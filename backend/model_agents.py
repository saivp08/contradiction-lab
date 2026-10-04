"""Validated artifact handoffs for the existing Omnigent orchestration.

Only the runner calls deterministic execution. Scientific interpretations are never
filled in by this module. Invalid model submissions fail the run without fallback.
"""

import hashlib
import json
import os
from datetime import datetime
from time import perf_counter

from backend import science, store, workflow
from backend.models import Experiment
from backend.agent_contracts import SCHEMAS, RESPONSIBILITIES

CONTEXT_KINDS = {
    'LiteratureAgent': {'question', 'paper'},
    'ContradictionAgent': {'evidence'},
    'HypothesisAgent': {'evidence', 'contradiction'},
    'ExperimentPlanner': {'evidence', 'contradiction', 'hypothesis'},
    'ExperimentRunner': {'experiment', 'safety'},
    'AnalysisAgent': {'hypothesis', 'experiment', 'result', 'contradiction'},
    'CriticAgent': {'evidence', 'hypothesis', 'experiment', 'result', 'analysis'},
    'DecisionAgent': {'contradiction', 'hypothesis', 'experiment', 'result', 'analysis', 'critique'},
    'SafetyAgent': {'evidence', 'contradiction', 'hypothesis', 'experiment', 'result', 'analysis', 'critique', 'decision'},
}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, allow_nan=False).encode()).hexdigest()


def plan_digest(record):
    return digest(store.by_kind(record, 'experiment'))


def next_role(record):
    if record['status'] in {'complete', 'failed', 'blocked', 'no_contradiction', 'awaiting_approval',
                            'sponsor_preparing_approval', 'sponsor_verifying'}:
        return None
    if record['status'] == 'verifying_plan':
        return 'SafetyAgent'
    return workflow.ROLES[record['stage']] if record['stage'] < 9 else None


def ensure_role(record, role):
    if record['mode'] != 'omnigent' or next_role(record) != role:
        raise ValueError(f'Invalid handoff: expected {next_role(record)}, received {role}')


def context(identifier, role):
    with workflow.lock_for(identifier):
        record = store.get(identifier)
        ensure_role(record, role)
        objects = [o for o in record['objects'].values() if o['kind'] in CONTEXT_KINDS[role]
                   or (o['kind'].startswith('prior_') and role != 'ExperimentRunner')]
        objects = [{**o, 'data': {k: v for k, v in o['data'].items() if k != 'points'}} for o in objects]
        data = {'investigation_id': identifier, 'objective': record['objective'], 'objects': objects,
                'approval': record['approval'], 'phase': 'preflight' if record['status'] == 'verifying_plan' else 'scientific',
                'schema': SCHEMAS[role].model_json_schema(), 'responsibility': RESPONSIBILITIES[role]}
        papers = record.get('source', {}).get('kind') == 'papers'
        if role == 'LiteratureAgent':
            data['sources'] = record['source']['analysis']['source_documents'] if papers else [
                e.model_dump(mode='json') for e in science.retrieve_evidence()]
            if len(json.dumps(data['sources'])) > 220_000:
                raise ValueError('Paper text exceeds the model context budget; use shorter papers')
        if role == 'ExperimentPlanner':
            data['capabilities'] = {
                'methods': ['claim_alignment_audit', 'condition_scan'] if papers else
                           ['species_adjustment', 'year_sensitivity', 'species_sex_year'],
                'data': 'Extracted paper claims only; no shared primary dataset' if papers else
                        'Palmer Penguins: bill_length_mm, bill_depth_mm, species, sex, year; missing rows excluded',
                'seed': record['seed'], 'bootstrap_samples': '100..2000',
                'procedures': 'Text overlap bootstrap and section exclusion' if papers else
                              'OLS bill_depth_mm on bill_length_mm, with method-specific covariates; '
                              'stratified bootstrap, year exclusion, BIC and slope decomposition',
            }
        executions = record.setdefault('agent_executions', [])
        active = next((e for e in executions if e['role'] == role and e['status'] == 'THINKING'), None)
        if active is None:
            executions.append({'id': store.uid('execution'), 'role': role, 'status': 'THINKING',
                               'started_at': store.now(), 'provider': 'openai-agents via Omnigent',
                               'model': os.getenv('OMNIGENT_MODEL', 'gpt-4.1-mini'),
                               'input_ids': [o['id'] for o in objects], 'input_sha256': digest(data),
                               'input_summary': f"{len(objects)} scoped artifacts; {data['phase']}",
                               'input_snapshot': data,
                               'output': None, 'error': None})
            store.event(record, role, 'Reviewing scoped evidence and structured artifacts',
                        [o['id'] for o in objects], [], 'model_context', status='running')
        return data


def check_measurements(record, output):
    for measurement in output.get('measurements', []):
        obj = record['objects'].get(measurement['result_id'])
        if not obj or obj['kind'] != 'result':
            raise ValueError('Measurement must reference a computed result artifact')
        value = obj['data']
        for part in measurement['path'].split('.'):
            value = value[int(part)] if isinstance(value, list) else value[part]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value != measurement['value']:
            raise ValueError('Model measurement does not match the computation')


def validate_evidence(record, rows):
    if len({r['evidence_id'] for r in rows}) != len(rows):
        raise ValueError('Duplicate evidence IDs')
    source = record.get('source')
    if not source:
        catalog = {e.evidence_id: e.model_dump(mode='json') for e in science.retrieve_evidence()}
        for row in rows:
            original = catalog.get(row['evidence_id'])
            if not original or row['claim'] != original['claim'] or row['citation'] != original['citation']:
                raise ValueError('Reference claim/citation must match the supplied catalog')
        return
    documents = {p['id']: p for p in source['analysis']['source_documents']}
    seen = set()
    for row in rows:
        provenance = row['provenance']
        paper = documents.get(provenance.get('pdf_sha256'))
        if not paper:
            raise ValueError('Unknown paper provenance')
        page = int(provenance.get('page', '0'))
        quote = provenance.get('quote', '')
        passages = [p for p in paper['passages'] if p['page'] == page and p['section'] == provenance.get('section')]
        if len(quote) < 15 or row['claim'] != quote or not any(quote in p['text'] for p in passages):
            raise ValueError('Paper claim must be an exact passage at the cited page and section')
        citation = row['citation']
        if citation['title'] != paper['meta']['title'] or citation['authors'] != (paper['meta']['authors'] or ['Author not extracted']):
            raise ValueError('Citation metadata differs from the uploaded paper')
        if citation['year'] != paper['meta']['year']:
            raise ValueError('Citation year differs from the uploaded paper')
        expected_identifier = paper['meta']['doi'] or f"sha256:{paper['id'][:16]}"
        expected_url = f"https://doi.org/{paper['meta']['doi']}" if paper['meta']['doi'] else None
        if citation['identifier'] != expected_identifier or citation['url'] != expected_url:
            raise ValueError('Citation identifier differs from the uploaded paper')
        seen.add(paper['id'])
    if seen != set(documents):
        raise ValueError('Evidence must cover both uploaded papers')


def submit(identifier, role, output_json):
    with workflow.lock_for(identifier):
        record = store.get(identifier)
        ensure_role(record, role)
        execution = next((e for e in record.get('agent_executions', [])
                          if e['role'] == role and e['status'] == 'THINKING'), None)
        if execution is None:
            raise ValueError('Read the role context before submitting')
        try:
            output = SCHEMAS[role].model_validate_json(output_json).model_dump(mode='json')
            result = apply_output(record, role, output, execution)
            return result
        except Exception as error:
            # Never persist raw provider exceptions or unvalidated model payloads.
            record = store.get(identifier)
            execution = next(e for e in record['agent_executions'] if e['id'] == execution['id'])
            execution.update(status='FAILED', completed_at=store.now(), error=f'Output rejected: {type(error).__name__}')
            record.update(status='failed', error=f'{role} output validation or execution failed; no fallback was run.')
            store.event(record, role, execution['error'], execution['input_ids'], [], 'validated_submission', status='failed')
            raise


def apply_output(record, role, output, execution):
    started = perf_counter()
    inputs = execution['input_ids']
    known = set(record['objects']) | {o['data'].get('evidence_id') for o in store.by_kind(record, 'evidence')}
    if not set(output['evidence_ids']) <= known:
        raise ValueError('Unknown evidence/artifact reference')
    check_measurements(record, output)
    outputs = []
    preflight = record['status'] == 'verifying_plan'
    if role == 'LiteratureAgent':
        validate_evidence(record, output['evidence'])
        for row in output['evidence']:
            outputs.append(store.add(record, 'evidence', row, inputs))
        if record.get('source'):
            record['source']['evidence'] = output['evidence']
            from backend.papers import _terms, _direction
            report = record['source']['analysis']
            for row in output['evidence']:
                index = next(i for i, p in enumerate(report['papers']) if p['id'] == row['provenance']['pdf_sha256'])
                claims = report['claims_a' if index == 0 else 'claims_b']
                if not any(c['text'] == row['claim'] for c in claims):
                    claims.append({'text': row['claim'], 'page': int(row['provenance']['page']),
                                   'section': row['provenance']['section'], 'terms': _terms(row['claim']),
                                   'direction': _direction(row['claim']), 'stats': []})
    elif role == 'ContradictionAgent':
        comparison = output['contradiction']
        ev_ids = {e['data']['evidence_id'] for e in store.by_kind(record, 'evidence')}
        if not {comparison['evidence_a'], comparison['evidence_b']} <= ev_ids:
            raise ValueError('Comparison references unknown claims')
        if comparison['evidence_a'] == comparison['evidence_b']:
            raise ValueError('Comparison requires two different claims')
        disagreement = output['disposition'] == 'CONTRADICTION'
        if disagreement != (output['classification'] in {'DIRECT', 'CONDITIONAL', 'APPARENT'}):
            raise ValueError('Classification and disposition disagree')
        if disagreement != (comparison['contradiction_strength'] != 'none'):
            raise ValueError('Inconsistent contradiction disposition')
        outputs.append(store.add(record, 'contradiction', {**comparison, **{k: v for k, v in output.items() if k != 'contradiction'}}, inputs))
        if not disagreement:
            record['status'] = 'no_contradiction'
        if record.get('source'):
            report = record['source']['analysis']
            report.update(relationship=output['classification'], defensible_contradiction=disagreement,
                          engine='Model-backed semantic comparison via Omnigent', evidence=record['source']['evidence'])
            record['source'].update(relationship=output['classification'], engine=report['engine'])
            from backend.papers import _similarity, _pair_kind
            selected = {e['data']['evidence_id']: e['data'] for e in store.by_kind(record, 'evidence')}
            pair = [selected[comparison[k]] for k in ('evidence_a', 'evidence_b')]
            if pair[0]['provenance']['pdf_sha256'] != report['papers'][0]['id']:
                pair.reverse()
            if {p['provenance']['pdf_sha256'] for p in pair} != {p['id'] for p in report['papers']}:
                raise ValueError('Paper comparison must compare claims from different papers')
            a = next(i for i, c in enumerate(report['claims_a']) if c['text'] == pair[0]['claim'])
            b = next(i for i, c in enumerate(report['claims_b']) if c['text'] == pair[1]['claim'])
            ca, cb = report['claims_a'][a], report['claims_b'][b]
            report['best_pair'] = {'a': a, 'b': b, 'similarity': _similarity(ca, cb),
                                   'kind': _pair_kind(ca['direction'], cb['direction']),
                                   'shared_terms': sorted(set(ca['terms']) & set(cb['terms'])), 'rank_score': 0}
    elif role == 'HypothesisAgent':
        rows = output['hypotheses']
        if len({h['hypothesis_id'] for h in rows}) != len(rows):
            raise ValueError('Duplicate hypothesis IDs')
        ev_ids = {e['data']['evidence_id'] for e in store.by_kind(record, 'evidence')}
        for row in rows:
            if not set(row['supporting_evidence'] + row['conflicting_evidence']) <= ev_ids:
                raise ValueError('Unknown hypothesis evidence')
            row['agent_generated'] = True
            outputs.append(store.add(record, 'hypothesis', row, inputs))
    elif role == 'ExperimentPlanner':
        allowed = {'claim_alignment_audit', 'condition_scan'} if record.get('source') else {
            'species_adjustment', 'year_sensitivity', 'species_sex_year'}
        hypotheses = {h['data']['hypothesis_id'] for h in store.by_kind(record, 'hypothesis')}
        ids = [e['experiment_id'] for e in output['experiments']]
        if len(set(ids)) != len(ids) or output['selected_experiment'] not in ids:
            raise ValueError('Invalid experiment selection')
        for row in output['experiments']:
            if row['method'] not in allowed or not set(row['hypothesis_targets']) <= hypotheses:
                raise ValueError('Experiment method or target is not available')
            outputs.append(store.add(record, 'experiment', {**row, 'planning_score': science.score(
                Experiment.model_validate(row))}, inputs))
        outputs.append(store.add(record, 'plan_review', output, inputs))
        record.update(selected_experiment=output['selected_experiment'], selection_rationale=output['summary'], status='verifying_plan')
        record['metrics']['question_to_spec_seconds'] = (
            datetime.fromisoformat(store.now()) - datetime.fromisoformat(record['created_at'])).total_seconds()
    elif role == 'ExperimentRunner':
        approval = record.get('approval')
        if not approval or approval['experiment_id'] != output['experiment_id']:
            raise ValueError('Human approval required for this experiment')
        if approval.get('plan_sha256') != plan_digest(record) or record.get('verified_plan_sha256') != plan_digest(record):
            raise ValueError('Approved plan was modified')
        record = workflow._advance_deterministic(record['id'], role, output['summary'])
        outputs = [o['id'] for o in store.by_kind(record, 'result')]
        execution = next(e for e in record['agent_executions'] if e['id'] == execution['id'])
    elif role == 'AnalysisAgent':
        hypotheses = {h['data']['hypothesis_id'] for h in store.by_kind(record, 'hypothesis')}
        if {u['hypothesis_id'] for u in output['updates']} != hypotheses:
            raise ValueError('Analysis must assess the registered hypotheses')
        outputs.append(store.add(record, 'analysis', {**output, 'score_label': 'Model judgment, not probability'}, inputs))
    elif role == 'CriticAgent':
        for challenge in output['challenges']:
            if not set(challenge['artifact_ids']) <= set(record['objects']):
                raise ValueError('Challenge references unknown artifacts')
        outputs.append(store.add(record, 'critique', output, inputs))
    elif role == 'DecisionAgent':
        outputs.append(store.add(record, 'decision', {**output, 'requires_new_approval': True}, inputs))
        record['metrics']['result_to_decision_seconds'] = (
            datetime.fromisoformat(store.now()) - datetime.fromisoformat(store.by_kind(record, 'result')[0]['created_at'])).total_seconds()
    else:
        issues = [] if preflight else science.rigor(record)
        if issues and output['passed']:
            raise ValueError('Verification missed deterministic integrity violations')
        passed = output['passed'] and not output['blocking_issues'] and not issues
        outputs.append(store.add(record, 'safety', {**output, 'phase': 'preflight' if preflight else 'final',
                                                   'status': 'passed' if passed else 'blocked'}, inputs))
        record['status'] = ('sponsor_preparing_approval' if preflight else 'sponsor_verifying') if passed else 'blocked'
        if not passed:
            record['error'] = 'Verification blocked progression: ' + '; '.join(output['blocking_issues'] + issues + output['flags'])
        elif preflight:
            record['verified_plan_sha256'] = plan_digest(record)
    if role != 'ExperimentRunner' and not preflight:
        record['stage'] += 1
    if record['status'] == 'created':
        record['status'] = 'investigating'
    execution.update(status='BLOCKED' if record['status'] == 'blocked' else 'COMPLETED',
                     completed_at=store.now(), output=output, output_ids=outputs, confidence=output['confidence'])
    store.event(record, role, output['summary'], inputs, outputs, 'model_artifact', perf_counter() - started,
                status='blocked' if record['status'] == 'blocked' else 'complete')
    return {'investigation_id': record['id'], 'status': record['status'], 'next_agent': next_role(record),
            'output_ids': outputs, 'instruction': 'Next specialist must read its own context tool. Stop if next_agent is null.'}
