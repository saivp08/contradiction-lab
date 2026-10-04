"""Contract tests with explicit fixture outputs. These are NOT live model verification."""

import asyncio
import json
from pathlib import Path

import pytest

from backend import model_agents as agents
from backend import science, store, workflow
from backend.models import NewInvestigation
from backend.omnigent_adapter import run


def base():
    return {'summary': 'Fixture scientific conclusion for contract validation.', 'confidence': 0.6, 'evidence_ids': []}


def send(identifier, role, output):
    agents.context(identifier, role)
    return agents.submit(identifier, role, json.dumps({**base(), **output}))


def prepared():
    r = workflow.create(NewInvestigation(mode='omnigent'))
    identifier = r['id']
    evidence = science.retrieve_evidence()
    send(identifier, 'LiteratureAgent', {'evidence': [e.model_dump(mode='json') for e in evidence]})
    send(identifier, 'ContradictionAgent', {'disposition': 'CONTRADICTION', 'classification': 'APPARENT',
         'dimensions': {'population': 'Same birds; different aggregation'},
         'contradiction': science.compare(*evidence).model_dump()})
    send(identifier, 'HypothesisAgent', {'hypotheses': [{**h.model_dump(), 'confidence': 0.5,
         'proposed_test': 'Compare the allowlisted covariate adjustments'} for h in science.hypotheses(True)]})
    send(identifier, 'ExperimentPlanner', {'experiments': [e.model_dump() for e in science.proposals(42)],
         'selected_experiment': 'E1', 'assumptions': ['Linear associations'], 'robustness_checks': ['Year exclusion']})
    send(identifier, 'SafetyAgent', {'passed': True, 'checks': ['Plan and provenance checked'], 'flags': [], 'blocking_issues': []})
    r = store.get(identifier)
    r['status'] = 'awaiting_approval'  # Adapter responsibility, explicit fixture setup.
    store.save(r)
    return identifier


def test_real_computation_and_model_artifacts_persist(monkeypatch):
    identifier = prepared()
    with pytest.raises(ValueError):
        send(identifier, 'ExperimentRunner', {'experiment_id': 'E1'})
    assert not store.by_kind(store.get(identifier), 'result')
    workflow.approve(identifier, 'E1', actor='explicit automated contract test')
    send(identifier, 'ExperimentRunner', {'experiment_id': 'E1'})
    r = store.get(identifier)
    result = store.by_kind(r, 'result')[0]
    assert result['data']['pooled_slope'] < 0 < result['data']['adjusted_slope']
    assert result['data']['provenance']['tool'] == 'experiments.penguins.compute'
    measurement = {'result_id': result['id'], 'path': 'adjusted_slope', 'value': result['data']['adjusted_slope']}
    updates = science.evaluate(result['data'])
    for name in ('evaluate', 'critique', 'decide'):
        monkeypatch.setattr(science, name, lambda *args: pytest.fail('Deterministic interpretation called in model mode'))
    send(identifier, 'AnalysisAgent', {'updates': updates, 'measurements': [measurement],
         'statistical_evidence': 'Positive adjusted interval', 'scientific_interpretation': 'Association only',
         'limitations': ['Observational']})
    analysis = store.by_kind(store.get(identifier), 'analysis')[0]
    send(identifier, 'CriticAgent', {'challenges': [{'challenge_id': 'custom-challenge',
         'attack': 'Unmeasured confounding remains a rival explanation.', 'test': 'Independent cohort',
         'evidence': 'Not tested by this observational sample', 'verdict': 'open', 'artifact_ids': [analysis['id']]}],
         'requested_experiments': ['Independent cohort'], 'measurements': []})
    send(identifier, 'DecisionAgent', {'disposition': 'NEEDS_FOLLOW_UP', 'previous_plan': 'Assess aggregation',
         'next_decision': 'Collect independent evidence', 'rationale': 'Confounding remains unresolved',
         'next_evidence_search': 'Independent cohort', 'next_experiment': 'Replication', 'unresolved': ['Confounding'],
         'contradiction_explained': False, 'measurements': []})
    send(identifier, 'SafetyAgent', {'passed': True, 'checks': ['Provenance, approval and numeric references'],
         'flags': ['Observational findings'], 'blocking_issues': []})
    r = store.get(identifier)
    assert len(r['agent_executions']) == 10
    assert all(e['status'] == 'COMPLETED' for e in r['agent_executions'])
    assert store.by_kind(r, 'critique')[0]['data']['challenges'][0]['verdict'] == 'open'
    r['verified_sha256'] = store.scientific_digest(r)
    store.save(r)
    assert store.verify(store.get(identifier))
    r['agent_executions'][0]['output']['summary'] = 'tampered'
    assert not store.verify(r)


@pytest.mark.parametrize('disposition', ['COMPATIBLE', 'INCONCLUSIVE', 'INSUFFICIENT_EVIDENCE'])
def test_no_forced_disagreement(disposition):
    r = workflow.create(NewInvestigation(mode='omnigent'))
    evidence = science.retrieve_evidence()
    send(r['id'], 'LiteratureAgent', {'evidence': [e.model_dump(mode='json') for e in evidence]})
    comparison = science.compare(*evidence).model_dump()
    comparison['contradiction_strength'] = 'none'
    send(r['id'], 'ContradictionAgent', {'disposition': disposition, 'classification': 'INSUFFICIENT_EVIDENCE',
         'dimensions': {'uncertainty': 'Unknown'}, 'contradiction': comparison})
    saved = store.get(r['id'])
    assert saved['status'] == 'no_contradiction'
    assert agents.next_role(saved) is None
    assert not store.by_kind(saved, 'hypothesis')


def test_failed_model_call_has_no_fallback():
    class FailingProvider:
        async def execute(self, *args):
            raise ConnectionError('provider unavailable')
    r = workflow.create(NewInvestigation(mode='omnigent'))
    asyncio.run(run(r['id'], FailingProvider()))
    r = store.get(r['id'])
    assert r['status'] == 'failed'
    assert r['agent_executions'][0]['status'] == 'FAILED'
    assert not store.by_kind(r, 'evidence')


def test_schema_rejects_invalid_model_output():
    r = workflow.create(NewInvestigation(mode='omnigent'))
    with pytest.raises(ValueError):
        send(r['id'], 'LiteratureAgent', {'evidence': [{'claim': 'invented'}]})
    assert store.get(r['id'])['status'] == 'failed'


def test_approval_digest_prevents_changed_plan():
    identifier = prepared()
    r = store.get(identifier)
    store.by_kind(r, 'experiment')[0]['data']['bootstrap_samples'] = 101
    store.save(r)
    with pytest.raises(ValueError, match='changed'):
        workflow.approve(identifier, 'E1')


def test_measurement_must_equal_python_result():
    identifier = prepared()
    workflow.approve(identifier, 'E1', actor='explicit automated contract test')
    send(identifier, 'ExperimentRunner', {'experiment_id': 'E1'})
    r = store.get(identifier)
    result = store.by_kind(r, 'result')[0]
    with pytest.raises(ValueError, match='does not match'):
        agents.check_measurements(r, {'measurements': [{'result_id': result['id'], 'path': 'adjusted_slope', 'value': 99.0}]})


def test_safety_can_block():
    identifier = prepared()
    r = store.get(identifier)
    r['status'] = 'verifying_plan'
    store.save(r)
    send(identifier, 'SafetyAgent', {'passed': False, 'checks': ['Feasibility'],
         'flags': [], 'blocking_issues': ['Required raw data are absent']})
    assert store.get(identifier)['status'] == 'blocked'
    with pytest.raises(ValueError, match='not awaiting'):
        workflow.approve(identifier, 'E1')


def test_paper_provenance_exact_page_and_quote():
    from backend import papers
    paths = [Path('data/fixtures') / name for name in ('caffeine-rct-young.pdf', 'caffeine-null-older.pdf')]
    assert paths
    documents = [papers.ingest(p.read_bytes(), p.name) for p in paths[:2]]
    report = papers.analyze(*documents)
    report['source_documents'] = documents
    store.save_analysis(report)
    r = workflow.create(NewInvestigation(mode='omnigent', source_analysis=report['analysis_id']))
    rows = []
    for index, p in enumerate(documents):
        claim = p['claims'][0]
        row = papers._to_evidence(p, claim, {'shared_terms': claim['terms']}, f'EV{index+1}', claim['text'], 'outcome').model_dump(mode='json')
        row['provenance']['quote'] = row['claim']
        rows.append(row)
    agents.validate_evidence(r, rows)
    rows[0]['provenance']['page'] = '999'
    with pytest.raises(ValueError, match='exact passage'):
        agents.validate_evidence(r, rows)


class FakeClaude:
    """Scripted stand-in for anthropic.AsyncAnthropic; records each request. Not a live model."""

    def __init__(self, replies):
        self.replies, self.requests = list(replies), []
        self.beta = type('Beta', (), {'messages': self})()

    def stream(self, **kwargs):
        from types import SimpleNamespace

        self.requests.append(kwargs)
        reply = self.replies.pop(0)

        class Stream:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc):
                return False

            async def get_final_message(self):
                usage = SimpleNamespace(input_tokens=10, output_tokens=5, cache_read_input_tokens=7,
                                        cache_creation_input_tokens=3)
                return SimpleNamespace(usage=usage, **reply)

        return Stream()


def tool_use(name, call_id, payload=None):
    from types import SimpleNamespace

    return SimpleNamespace(type='tool_use', name=name, id=call_id, input=payload or {})


def test_claude_provider_runs_scoped_tools_and_labels_the_run(monkeypatch):
    from backend.agent_provider import ClaudeProvider

    monkeypatch.setenv('ANTHROPIC_API_KEY', 'unit-test-not-a-real-key')
    monkeypatch.delenv('CLAUDE_MODEL', raising=False)
    identifier = workflow.create(NewInvestigation(mode='omnigent'))['id']
    evidence = [e.model_dump(mode='json') for e in science.retrieve_evidence()]
    output = json.dumps({**base(), 'evidence': evidence})
    client = FakeClaude([
        {'stop_reason': 'tool_use', 'stop_details': None, 'content': [tool_use('read_context', 't1')]},
        {'stop_reason': 'tool_use', 'stop_details': None,
         'content': [tool_use('submit_artifact', 't2', {'output_json': output})]},
    ])
    agents.context(identifier, 'LiteratureAgent')
    usage = asyncio.run(ClaudeProvider(client).execute(identifier, 'LiteratureAgent', 'prepare'))
    assert usage == {'input_tokens': 20, 'output_tokens': 10, 'cache_read_input_tokens': 14,
                     'cache_creation_input_tokens': 6, 'requests': 2}
    first, second = client.requests
    assert first['model'] == 'claude-opus-5-5' and first['fallbacks'] == 'default'
    assert first['cache_control'] == {'type': 'ephemeral'}
    assert first['betas'] == ['server-side-fallback-2026-07-01'] and 'tool_choice' not in first
    assert {t['name'] for t in first['tools']} == {'read_context', 'submit_artifact'}
    # Append-only history: the assistant turn is echoed back unchanged before the tool result.
    assert second['messages'][1]['role'] == 'assistant' and second['messages'][2]['content'][0]['tool_use_id'] == 't1'
    record = store.get(identifier)
    execution = record['agent_executions'][0]
    assert execution['provider'] == 'Claude API (anthropic SDK)' and execution['model'] == 'claude-opus-5-5'
    assert execution['status'] == 'COMPLETED' and len(store.by_kind(record, 'evidence')) == len(evidence)


def test_claude_refusal_fails_closed_without_fallback_artifacts(monkeypatch):
    from types import SimpleNamespace

    from backend.agent_provider import ClaudeProvider

    monkeypatch.setenv('ANTHROPIC_API_KEY', 'unit-test-not-a-real-key')
    identifier = workflow.create(NewInvestigation(mode='omnigent'))['id']
    client = FakeClaude([{'stop_reason': 'refusal', 'stop_details': SimpleNamespace(category='bio'), 'content': []}])
    asyncio.run(run(identifier, ClaudeProvider(client)))
    record = store.get(identifier)
    assert record['status'] == 'failed' and not store.by_kind(record, 'evidence')
    assert 'declined' in record['agent_executions'][0]['error']


def test_claude_agent_revises_a_rejected_artifact_and_rejections_are_recorded(monkeypatch):
    from backend.agent_provider import ClaudeProvider

    monkeypatch.setenv('ANTHROPIC_API_KEY', 'unit-test-not-a-real-key')
    identifier = workflow.create(NewInvestigation(mode='omnigent'))['id']
    evidence = [e.model_dump(mode='json') for e in science.retrieve_evidence()]
    bad = json.dumps({**base(), 'evidence_ids': ['EV404'], 'evidence': evidence})
    # Citing its own newly submitted evidence rows is a valid reference.
    good = json.dumps({**base(), 'evidence_ids': [e['evidence_id'] for e in evidence], 'evidence': evidence})
    client = FakeClaude([
        {'stop_reason': 'tool_use', 'stop_details': None, 'content': [tool_use('read_context', 't1')]},
        {'stop_reason': 'tool_use', 'stop_details': None, 'content': [tool_use('submit_artifact', 't2', {'output_json': bad})]},
        {'stop_reason': 'tool_use', 'stop_details': None, 'content': [tool_use('submit_artifact', 't3', {'output_json': good})]},
    ])
    agents.context(identifier, 'LiteratureAgent')
    asyncio.run(ClaudeProvider(client).execute(identifier, 'LiteratureAgent', 'prepare'))
    results = [block for m in client.requests[-1]['messages'] if m['role'] == 'user' and isinstance(m['content'], list)
               for block in m['content']]
    feedback = next(block for block in results if block['tool_use_id'] == 't2')
    assert feedback['is_error'] and 'Unknown evidence/artifact reference' in feedback['content']
    execution = store.get(identifier)['agent_executions'][0]
    assert execution['status'] == 'COMPLETED' and execution['rejections'] == [
        'ValueError: Unknown evidence/artifact reference'
    ]


def test_claude_agent_fails_closed_after_three_rejections(monkeypatch):
    from backend.agent_provider import ClaudeProvider

    monkeypatch.setenv('ANTHROPIC_API_KEY', 'unit-test-not-a-real-key')
    identifier = workflow.create(NewInvestigation(mode='omnigent'))['id']
    bad = json.dumps({**base(), 'evidence': 'not a list'})
    client = FakeClaude([{'stop_reason': 'tool_use', 'stop_details': None,
                          'content': [tool_use('submit_artifact', f't{i}', {'output_json': bad})]} for i in range(3)])
    asyncio.run(run(identifier, ClaudeProvider(client)))
    record = store.get(identifier)
    assert record['status'] == 'failed' and not store.by_kind(record, 'evidence')
    error = record['agent_executions'][0]['error']
    assert error.startswith('Output rejected: Schema validation failed: evidence') and 'not a list' not in error
