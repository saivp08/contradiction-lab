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
