"""Provider boundary using the existing, pinned Omnigent executor, without its CLI daemon."""

import json
import os
import re
from pathlib import Path
from typing import Protocol

from backend import model_agents, store

ROOT = Path(__file__).resolve().parents[1]


MAX_SUBMISSIONS = 3
TASK = 'Read your scoped context, then submit your scientific artifact.'


class AgentProvider(Protocol):
    async def execute(self, identifier: str, role: str, phase: str) -> dict: ...


def _role_spec(role: str, phase: str) -> dict:
    return json.loads((ROOT / 'omnigent_config' / f'{phase}.yaml').read_text(encoding='utf-8'))['tools'][role]


def _redact(message: str) -> str:
    for key, value in os.environ.items():
        if value and any(word in key for word in ('KEY', 'TOKEN', 'SECRET')):
            message = message.replace(value, '[REDACTED]')
    return re.sub(r'sk-[A-Za-z0-9_-]+', '[REDACTED]', message)


def _record_error(identifier: str, message: str) -> None:
    # Persist only an operational error, never model reasoning or streamed text.
    record = store.get(identifier)
    record['agent_executions'][-1]['error'] = _redact(message)[:600]
    store.save(record)


class ClaudeProvider:
    """Runs each specialist on the Claude API with only its two scoped tools from the agent graph."""

    def __init__(self, client=None):
        self._client = client

    async def execute(self, identifier: str, role: str, phase: str) -> dict:
        import anthropic

        spec = _role_spec(role, phase)
        tools = [{'name': name, 'description': tool['description'], 'input_schema': tool['parameters']}
                 for name, tool in spec['tools'].items()]
        if self._client is not None:
            return await self._run(self._client, anthropic, identifier, role, tools, spec['prompt'])
        async with anthropic.AsyncAnthropic() as client:
            return await self._run(client, anthropic, identifier, role, tools, spec['prompt'])

    async def _run(self, client, anthropic, identifier: str, role: str, tools: list[dict], system: str) -> dict:
        messages: list[dict] = [{'role': 'user', 'content': TASK}]
        usage = {'input_tokens': 0, 'output_tokens': 0, 'cache_read_input_tokens': 0,
                 'cache_creation_input_tokens': 0, 'requests': 0}
        submitted = False
        attempts = 0
        for _ in range(12):
            try:
                async with client.beta.messages.stream(
                    model=model_agents.provider_model(),
                    max_tokens=32000,
                    system=system,
                    tools=tools,
                    messages=messages,
                    output_config={'effort': os.getenv('CLAUDE_EFFORT', 'medium')},
                    betas=['server-side-fallback-2026-07-01'],
                    fallbacks='default',
                    # History is append-only, so each turn re-reads the previous turn's prefix from cache.
                    cache_control={'type': 'ephemeral'},
                ) as stream:
                    message = await stream.get_final_message()
            except anthropic.APIError as error:
                _record_error(identifier, f'{type(error).__name__}: {error}')
                raise RuntimeError('Claude provider returned an API error') from error
            usage['requests'] += 1
            usage['input_tokens'] += message.usage.input_tokens
            usage['output_tokens'] += message.usage.output_tokens
            usage['cache_read_input_tokens'] += message.usage.cache_read_input_tokens or 0
            usage['cache_creation_input_tokens'] += message.usage.cache_creation_input_tokens or 0
            if message.stop_reason == 'refusal':
                category = getattr(message.stop_details, 'category', None) if message.stop_details else None
                _record_error(identifier, f'Claude declined the request (category: {category})')
                raise RuntimeError('Claude declined the request')
            if message.stop_reason == 'max_tokens':
                _record_error(identifier, 'Claude response hit max_tokens before finishing')
                raise RuntimeError('Claude response was truncated')
            messages.append({'role': 'assistant', 'content': message.content})
            calls = [block for block in message.content if block.type == 'tool_use']
            if not calls:
                if submitted:
                    return usage
                messages.append({'role': 'user', 'content': 'Call submit_artifact with your output_json.'})
                continue
            results = []
            for call in calls:
                if call.name == 'read_context':
                    content = json.dumps(model_agents.context(identifier, role), allow_nan=False)
                elif call.name == 'submit_artifact' and not submitted:
                    attempts += 1
                    try:
                        # The final attempt fails the run inside submit(); nothing is filled in for the agent.
                        content = json.dumps(model_agents.submit(
                            identifier, role, call.input['output_json'], final=attempts >= MAX_SUBMISSIONS))
                        submitted = True
                    except model_agents.SubmissionRejected as rejection:
                        results.append({'type': 'tool_result', 'tool_use_id': call.id, 'is_error': True,
                                        'content': f'Rejected by validator: {rejection}. Revise and resubmit.'})
                        continue
                else:
                    raise ValueError('Unknown or repeated mutation capability')
                results.append({'type': 'tool_result', 'tool_use_id': call.id, 'content': content})
            messages.append({'role': 'user', 'content': results})
            if submitted:
                return usage
        raise RuntimeError('Agent did not submit its required artifact')


class OmnigentProvider:
    async def execute(self, identifier: str, role: str, phase: str) -> dict:
        from omnigent import OpenAIAgentsSDKExecutor, ExecutorConfig, ExecutorError, TurnComplete

        spec = _role_spec(role, phase)
        executor = OpenAIAgentsSDKExecutor(api_key=os.environ['OPENAI_API_KEY'],
                                         model=os.getenv('OMNIGENT_MODEL', 'gpt-4.1-mini'),
                                         base_url_override=os.getenv('OMNIGENT_BASE_URL') or None)
        submitted = False
        usage = {}

        async def invoke(name, args):
            nonlocal submitted
            if name == 'read_context':
                return model_agents.context(identifier, role)
            if name != 'submit_artifact' or submitted:
                raise ValueError('Unknown or repeated mutation capability')
            result = model_agents.submit(identifier, role, args['output_json'])
            submitted = True
            return result

        # Pinned Omnigent 0.16.0 callback interface, also used by its workflow adapter.
        executor._tool_executor = invoke
        tools = [{'name': name, 'description': tool['description'], 'parameters': tool['parameters']}
                 for name, tool in spec['tools'].items()]
        try:
            async for event in executor.run_turn(
                [{'role': 'user', 'content': 'Read your scoped context, then submit your scientific artifact.',
                  'session_id': store.uid('session')}], tools, spec['prompt'],
                ExecutorConfig(model=os.getenv('OMNIGENT_MODEL', 'gpt-4.1-mini'),
                               extra={'max_turns': 8, 'parallel_tool_calls': False}),
            ):
                if isinstance(event, ExecutorError):
                    _record_error(identifier, event.message)
                    raise RuntimeError('Omnigent provider returned an execution error')
                if isinstance(event, TurnComplete):
                    usage = event.usage or {}
                # Text and ReasoningChunk events are deliberately not retained or exposed.
            if not submitted:
                raise RuntimeError('Agent did not submit its required artifact')
            return usage
        finally:
            await executor.close()


def default_provider() -> AgentProvider:
    return ClaudeProvider() if os.getenv('ANTHROPIC_API_KEY') else OmnigentProvider()
