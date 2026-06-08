import test from 'node:test';
import assert from 'node:assert/strict';
import { toPublicDataStatus } from '../src/status.js';

test('toPublicDataStatus removes local paths and in-memory records from status payloads', () => {
  const publicStatus = toPublicDataStatus({
    available: true,
    root: '/Users/example/private/aihub_71806/api_download/unzipped',
    recordCount: 1501,
    records: [{ safeSummary: 'private case summary' }],
  });

  assert.equal(publicStatus.available, true);
  assert.equal(publicStatus.recordCount, 1501);
  assert.equal('root' in publicStatus, false);
  assert.equal('records' in publicStatus, false);
  assert.doesNotMatch(JSON.stringify(publicStatus), /Users|private case summary|api_download/);
});

test('toPublicDataStatus removes nested local paths and record arrays defensively', () => {
  const publicStatus = toPublicDataStatus({
    available: true,
    aihubRag: {
      root: '/Users/example/private/aihub_71806/api_download/unzipped',
      records: [{ safeSummary: 'nested private case summary' }],
      recordCount: 1501,
      source: {
        root: '/Users/example/private/another-path',
        labelJsonCount: 1501,
      },
    },
  });

  assert.equal(publicStatus.aihubRag.recordCount, 1501);
  assert.equal(publicStatus.aihubRag.source.labelJsonCount, 1501);
  assert.equal('root' in publicStatus.aihubRag, false);
  assert.equal('records' in publicStatus.aihubRag, false);
  assert.equal('root' in publicStatus.aihubRag.source, false);
  assert.doesNotMatch(JSON.stringify(publicStatus), /Users|private|nested private case summary|api_download/);
});
