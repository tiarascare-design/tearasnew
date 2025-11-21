const { normalizeMasterCollectionPath } = require('../index');
const assert = require('assert');

describe('normalizeMasterCollectionPath', () => {
  it('inserts main into legacy masters path', () => {
    const input = 'artifacts/tiaras-website/public/data/masters/suppliers';
    const out = normalizeMasterCollectionPath(input);
    assert.strictEqual(out, 'artifacts/tiaras-website/public/data/masters/main/suppliers');
  });
  it('leaves current path unchanged', () => {
    const input = 'artifacts/tiaras-website/public/data/masters/main/suppliers';
    const out = normalizeMasterCollectionPath(input);
    assert.strictEqual(out, input);
  });
  it('does nothing for non-masters paths', () => {
    const input = 'artifacts/tiaras-website/public/data/products';
    const out = normalizeMasterCollectionPath(input);
    assert.strictEqual(out, input);
  });
});
