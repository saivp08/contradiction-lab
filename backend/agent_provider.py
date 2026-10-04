"""Provider boundary using the existing, pinned Omnigent executor, without its CLI daemon."""

import json
import os
import re
from pathlib import Path
from typing import Protocol

from backend import model_agents, store

ROOT = Path(__file__).resolve().parents[1]


class AgentProvider(Protocol):
    async def execute(self, identifier: str, role: str, phase: str) -> dict: ...


class OmnigentProvider:
    async def execute(self, identifier: str, role: str, phase: str) -> dict:
        from omnigent import OpenAIAgentsSDKExecutor, ExecutorConfig, ExecutorError, TurnComplete

        spec = json.loads((ROOT / 'omnigent_config' / f'{phase}.yaml').read_text(encoding='utf-8'))['tools'][role]
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
                    diagnostic = event.message
                    for key, value in os.environ.items():
                        if value and any(word in key for word in ('KEY', 'TOKEN', 'SECRET')):
                            diagnostic = diagnostic.replace(value, '[REDACTED]')
                    diagnostic = re.sub(r'sk-[A-Za-z0-9_-]+', '[REDACTED]', diagnostic)
                    # Persist only an operational error, never model reasoning or streamed text.
                    record = store.get(identifier)
                    record['agent_executions'][-1]['error'] = diagnostic[:600]
                    store.save(record)
                    raise RuntimeError('Omnigent provider returned an execution error')
                if isinstance(event, TurnComplete):
                    usage = event.usage or {}
                # Text and ReasoningChunk events are deliberately not retained or exposed.
            if not submitted:
                raise RuntimeError('Agent did not submit its required artifact')
            return usage
        finally:
            await executor.close()
