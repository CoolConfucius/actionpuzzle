import { test } from 'node:test';
import assert from 'node:assert/strict';

function makeStubStorage(initial) {
  const store = new Map(Object.entries(initial || {}));
  return {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); },
    _store: store,
  };
}

function makeThrowingStorage() {
  return {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); },
    clear() { throw new Error('denied'); },
  };
}

async function freshImport() {
  const mod = await import(`../render/title-screen.js?t=${Date.now()}${Math.random()}`);
  return mod;
}

test('getSelectedSkin returns default when localStorage empty', async () => {
  globalThis.localStorage = makeStubStorage();
  const { getSelectedSkin } = await freshImport();
  assert.equal(getSelectedSkin(), 'bear');
});

test('setSelectedSkin persists to localStorage', async () => {
  const stub = makeStubStorage();
  globalThis.localStorage = stub;
  const { getSelectedSkin, setSelectedSkin } = await freshImport();
  setSelectedSkin('wolf');
  assert.equal(stub.getItem('skin'), 'wolf');
  assert.equal(getSelectedSkin(), 'wolf');
});

test('getSelectedSkin falls back to default for invalid stored id', async () => {
  globalThis.localStorage = makeStubStorage({ skin: 'dragon' });
  const { getSelectedSkin } = await freshImport();
  assert.equal(getSelectedSkin(), 'bear');
});

test('setSelectedSkin rejects invalid skin id', async () => {
  globalThis.localStorage = makeStubStorage();
  const { getSelectedSkin, setSelectedSkin } = await freshImport();
  setSelectedSkin('wolf');
  setSelectedSkin('dragon');
  assert.equal(getSelectedSkin(), 'wolf');
});

test('getSelectedSkin survives localStorage throwing (private mode)', async () => {
  globalThis.localStorage = makeThrowingStorage();
  const { getSelectedSkin, setSelectedSkin } = await freshImport();
  assert.doesNotThrow(() => setSelectedSkin('lion'));
  const result = getSelectedSkin();
  const valid = ['bear', 'bear', 'wolf', 'lion', 'rabbit', 'pig', 'mole', 'monkey'];
  assert.ok(valid.includes(result));
});

test('all 8 skin ids round-trip', async () => {
  globalThis.localStorage = makeStubStorage();
  const { getSelectedSkin, setSelectedSkin } = await freshImport();
  const ids = ['bear', 'bear', 'wolf', 'lion', 'rabbit', 'pig', 'mole', 'monkey'];
  for (const id of ids) {
    setSelectedSkin(id);
    assert.equal(getSelectedSkin(), id);
  }
});
