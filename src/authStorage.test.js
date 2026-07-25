import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGuestWorkspacePayload, clearWorkspaceData, mergeGuestWorkspaceIntoProfile } from './authStorage.js';

const createStorageMock = (initialEntries = {}) => {
  const store = new Map(Object.entries(initialEntries));

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
  };
};

test('buildGuestWorkspacePayload stores a guest snapshot', () => {
  const payload = buildGuestWorkspacePayload({
    firstName: 'Ada',
    surname: 'Lovelace',
    email: 'ada@example.com',
  }, [
    { id: '1', category: 'Ops', amount: 10, date: '2026-01-01' },
  ], { foo: 'bar' });

  assert.equal(payload.profile.firstName, 'Ada');
  assert.equal(payload.expenses.length, 1);
  assert.equal(payload.inventoryMeta.foo, 'bar');
  assert.equal(payload.mode, 'guest');
});

test('mergeGuestWorkspaceIntoProfile preserves current profile values', () => {
  const merged = mergeGuestWorkspaceIntoProfile(
    { firstName: 'Grace', surname: 'Hopper', email: 'grace@example.com' },
    { firstName: 'Ada', surname: 'Lovelace', email: 'ada@example.com' }
  );

  assert.equal(merged.firstName, 'Grace');
  assert.equal(merged.surname, 'Hopper');
  assert.equal(merged.email, 'grace@example.com');
});

test('clearWorkspaceData preserves profile details while clearing workspace data', () => {
  const storage = createStorageMock({
    'ledgr-profile': JSON.stringify({ firstName: 'Ada', surname: 'Lovelace', email: 'ada@example.com' }),
    'ledgr-guest-profile': JSON.stringify({ firstName: 'Ada', surname: 'Lovelace', email: 'ada@example.com' }),
    'ledgr-auth-mode': 'supabase',
    'ledgr-expense-entries': JSON.stringify([{ id: '1' }]),
    'ledgr-inventory-meta': JSON.stringify({ foo: 'bar' }),
    'ledgr-onboarding-dismissed': 'true',
  });
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: storage };

  try {
    clearWorkspaceData();

    assert.equal(storage.getItem('ledgr-profile'), JSON.stringify({ firstName: 'Ada', surname: 'Lovelace', email: 'ada@example.com' }));
    assert.equal(storage.getItem('ledgr-guest-profile'), JSON.stringify({ firstName: 'Ada', surname: 'Lovelace', email: 'ada@example.com' }));
    assert.equal(storage.getItem('ledgr-auth-mode'), 'supabase');
    assert.equal(storage.getItem('ledgr-expense-entries'), null);
    assert.equal(storage.getItem('ledgr-inventory-meta'), null);
    assert.equal(storage.getItem('ledgr-onboarding-dismissed'), null);
  } finally {
    globalThis.window = previousWindow;
  }
});
