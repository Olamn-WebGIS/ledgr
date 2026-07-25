export const PROFILE_STORAGE_KEY = 'ledgr-profile';
export const EXPENSE_STORAGE_KEY = 'ledgr-expense-entries';
export const INVENTORY_META_STORAGE_KEY = 'ledgr-inventory-meta';
const AUTH_MODE_STORAGE_KEY = 'ledgr-auth-mode';
const GUEST_PROFILE_KEY = 'ledgr-guest-profile';
const GUEST_EXPENSES_KEY = 'ledgr-guest-expenses';
const GUEST_INVENTORY_META_KEY = 'ledgr-guest-inventory-meta';
const GUEST_MODE_KEY = 'ledgr-guest-mode';
const ONBOARDING_DISMISSAL_KEY = 'ledgr-onboarding-dismissed';

const WORKSPACE_STORAGE_KEYS = [
  PROFILE_STORAGE_KEY,
  EXPENSE_STORAGE_KEY,
  INVENTORY_META_STORAGE_KEY,
  AUTH_MODE_STORAGE_KEY,
  GUEST_PROFILE_KEY,
  GUEST_EXPENSES_KEY,
  GUEST_INVENTORY_META_KEY,
  GUEST_MODE_KEY,
  ONBOARDING_DISMISSAL_KEY,
];

export const getGuestWorkspaceSnapshot = () => {
  if (typeof window === 'undefined') {
    return {
      profile: null,
      expenses: [],
      inventoryMeta: {},
      mode: 'guest',
    };
  }

  const read = (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const profileRaw = read(GUEST_PROFILE_KEY) || read(PROFILE_STORAGE_KEY);
  const expensesRaw = read(GUEST_EXPENSES_KEY) || read(EXPENSE_STORAGE_KEY);
  const inventoryRaw = read(GUEST_INVENTORY_META_KEY) || read(INVENTORY_META_STORAGE_KEY);
  const mode = read(GUEST_MODE_KEY) || read(AUTH_MODE_STORAGE_KEY) || 'guest';

  return {
    profile: profileRaw ? JSON.parse(profileRaw) : null,
    expenses: expensesRaw ? JSON.parse(expensesRaw) : [],
    inventoryMeta: inventoryRaw ? JSON.parse(inventoryRaw) : {},
    mode,
  };
};

export const buildGuestWorkspacePayload = (profile, expenses = [], inventoryMeta = {}) => ({
  profile: profile ? { ...profile, dataSource: 'guest', syncStatus: 'Local only' } : null,
  expenses: Array.isArray(expenses) ? expenses : [],
  inventoryMeta: inventoryMeta && typeof inventoryMeta === 'object' ? inventoryMeta : {},
  mode: 'guest',
});

export const mergeGuestWorkspaceIntoProfile = (guestProfile, currentProfile) => {
  const base = currentProfile && typeof currentProfile === 'object' ? currentProfile : {};
  return {
    ...base,
    ...guestProfile,
    notificationPreferences: {
      ...(base.notificationPreferences || {}),
      ...(guestProfile?.notificationPreferences || {}),
    },
  };
};

export const persistGuestWorkspace = ({ profile, expenses, inventoryMeta, mode = 'guest' }) => {
  if (typeof window === 'undefined') {
    return;
  }

  const write = (key, value) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore local storage errors.
    }
  };

  write(PROFILE_STORAGE_KEY, profile || null);
  write(EXPENSE_STORAGE_KEY, expenses || []);
  write(INVENTORY_META_STORAGE_KEY, inventoryMeta || {});
  write(AUTH_MODE_STORAGE_KEY, mode);
  write(GUEST_PROFILE_KEY, profile || null);
  write(GUEST_EXPENSES_KEY, expenses || []);
  write(GUEST_INVENTORY_META_KEY, inventoryMeta || {});
  write(GUEST_MODE_KEY, mode);
};

export const clearWorkspaceData = () => {
  if (typeof window === 'undefined') {
    return;
  }

  const keysToRemove = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (
      typeof key === 'string'
      && key.startsWith('ledgr-')
      && key !== 'ledgr-theme-mode'
      && key !== PROFILE_STORAGE_KEY
      && key !== GUEST_PROFILE_KEY
      && key !== AUTH_MODE_STORAGE_KEY
    ) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore local storage errors.
    }
  });
};

export const clearGuestWorkspace = () => {
  if (typeof window === 'undefined') {
    return;
  }

  const keysToRemove = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (typeof key === 'string' && key.startsWith('ledgr-') && key !== 'ledgr-theme-mode') {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore local storage errors.
    }
  });
};
