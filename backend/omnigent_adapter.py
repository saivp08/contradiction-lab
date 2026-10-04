"""Orchestrate model-authored artifacts through Omnigent's official executor."""
import asyncio
import hashlib
import importlib.metadata
import os
from datetime import datetime
from pathlib import Path
from backend import model_agents, store, workflow
from backend.agent_provider import AgentProvider, ClaudeProvider, OmnigentProvider, default_provider
ROOT = Path(__file__).resolve().parents[1]

async def run(identifier: str, provider: AgentProvider | None = None):
    try:
        if provider is None and not (os.getenv('ANTHROPIC_API_KEY') or os.getenv('OPENAI_API_KEY')):
            raise ValueError('ANTHROPIC_API_KEY is required')
        provider = provider or default_provider()
        claude = isinstance(provider, ClaudeProvider)
        omnigent = isinstance(provider, OmnigentProvider)
        version = importlib.metadata.version('anthropic' if claude else 'omnigent') if claude or omnigent else 'custom'
        if omnigent and version != '0.16.0':
            raise ValueError('Expected validated Omnigent version 0.16.0')
        adapter = f'Claude API, anthropic SDK {version}' if claude else 'official OpenAIAgentsSDKExecutor'
        record = store.get(identifier)
        phase = 'prepare' if record['stage'] < 4 else 'execute'
        store.event(record, 'Omnigent', f'Starting {phase}: {adapter}' if claude else
                    f'Starting {phase}: official Omnigent executor {version}',
                    [], [], 'omnigent_executor', status='running')
        async with asyncio.timeout(int(os.getenv('OMNIGENT_TIMEOUT', '900'))):
            while role := model_agents.next_role(store.get(identifier)):
                model_agents.context(identifier, role)
                usage = await provider.execute(identifier, role, phase)
                record = store.get(identifier)
                record['agent_executions'][-1]['usage'] = usage
                store.save(record)
        record = store.get(identifier)
        record.setdefault('omnigent_receipts', []).append({
            'version': version, 'phase': phase, 'returncode': 0,
            'adapter': adapter, 'model': model_agents.provider_model(),
            'config_sha256': hashlib.sha256((ROOT / 'omnigent_config' / f'{phase}.yaml').read_bytes()).hexdigest(),
            'timestamp': store.now(),
        })
        if record['status'] == 'sponsor_preparing_approval':
            record['status'] = 'awaiting_approval'
        elif record['status'] == 'sponsor_verifying':
            record['status'] = 'complete'
            record['metrics'].update(workflow.challenge_metrics(record))
            record['metrics']['agent_handoffs'] = len(record['agent_executions'])
            record['metrics']['human_approvals'] = 1
            record['metrics']['total_wall_seconds'] = (
                datetime.fromisoformat(store.now()) - datetime.fromisoformat(record['created_at'])).total_seconds()
            record['metrics']['claims_retrieved'] = len(store.by_kind(record, 'evidence'))
            record['metrics']['hypotheses_evaluated'] = len(store.by_kind(record, 'hypothesis'))
            record['metrics']['experiments_compared'] = len(store.by_kind(record, 'experiment'))
            record['verified_sha256'] = store.scientific_digest(record)
        elif record['status'] not in {'no_contradiction', 'blocked', 'failed'}:
            raise RuntimeError('Incomplete specialist handoffs')
        store.save(record)
    except Exception as error:
        record = store.get(identifier)
        if record['status'] not in {'failed', 'blocked'}:
            workflow.fail(identifier, error)
            record = store.get(identifier)
        for execution in record.get('agent_executions', []):
            if execution['status'] == 'THINKING':
                execution.update(status='FAILED', completed_at=store.now(), error=execution.get('error') or type(error).__name__)
        record['failure_type'] = type(error).__name__
        store.save(record)
