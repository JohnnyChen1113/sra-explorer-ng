import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeProject } from '../src/features/sra-explorer/seqout.ts';

test('seqout projects with loosely typed fields are normalized', () => {
  const project = normalizeProject({ accession: 'GSE1', title: null, organisms: null, instrument_models: ['A', null], publications: [{ pmid: 123, pub_date: 2021, citation_count: '7' }, null] });
  assert.equal(project.title, 'GSE1');
  assert.deepEqual(project.organisms, []);
  assert.deepEqual(project.instrument_models, ['A']);
  assert.deepEqual(project.publications, [{ pmid: '123', title: undefined, journal: undefined, doi: undefined, pub_date: '2021', authors: undefined, citation_count: undefined }]);
});
