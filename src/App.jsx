import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  BadgeDollarSign,
  BellRing,
  Boxes,
  Building2,
  CalendarDays,
  Clock3,
  Database,
  DollarSign,
  Globe2,
  History,
  KeyRound,
  LayoutGrid,
  Mail,
  MonitorSmartphone,
  Moon,
  Package,
  PlusCircle,
  ReceiptText,
  RefreshCw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  SunMedium,
  TrendingDown,
  TrendingUp,
  UserRound,
  Eye,
  EyeOff,
  X,
  Zap,
} from 'lucide-react';
import { buildInventoryRows } from './inventoryUtils';
import {
  clearGuestWorkspace,
  clearWorkspaceData,
  EXPENSE_STORAGE_KEY,
  getGuestWorkspaceSnapshot,
  INVENTORY_META_STORAGE_KEY,
  mergeGuestWorkspaceIntoProfile,
  persistGuestWorkspace,
  PROFILE_STORAGE_KEY,
} from './authStorage';
import { supabase } from './supabaseClient';

const defaultApiBaseUrl = import.meta.env.DEV ? 'http://localhost:5000/api' : '/api';
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || defaultApiBaseUrl;

// Helper function to add authentication header to API requests
async function getAuthenticatedHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

// Wrapper that injects auth headers into API requests
async function apiFetch(url, options = {}) {
  const headers = await getAuthenticatedHeaders();
  options.headers = { Accept: 'application/json', ...(options.headers || {}), ...headers };
  return fetch(url, options);
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    const snippet = text.replace(/\s+/g, ' ').slice(0, 200);
    throw new Error(`Expected JSON response from ${response.url} but got: ${snippet}`);
  }
}

const fallbackTrendData = [
  { day: 'Mon', revenue: 0, cogs: 0, netProfit: 0 },
  { day: 'Tue', revenue: 0, cogs: 0, netProfit: 0 },
  { day: 'Wed', revenue: 0, cogs: 0, netProfit: 0 },
  { day: 'Thu', revenue: 0, cogs: 0, netProfit: 0 },
  { day: 'Fri', revenue: 0, cogs: 0, netProfit: 0 },
  { day: 'Sat', revenue: 0, cogs: 0, netProfit: 0 },
  { day: 'Sun', revenue: 0, cogs: 0, netProfit: 0 },
];

const uiTranslations = {
  en: {
    navDashboard: 'Dashboard',
    navInventory: 'Inventory',
    navPnl: 'P&L',
    navExpenses: 'Expenses',
    navSettings: 'Settings',
    profileTab: 'Profile',
    workspaceTab: 'Workspace',
    securityTab: 'Security',
    lastLogin: 'Last login',
    profilePreferences: 'Profile preferences',
    workspacePreferences: 'Workspace preferences',
    securityControls: 'Security controls',
    focusStartTracking: 'Start tracking activity',
    focusStartBody: 'Add your first sale or restock to begin building a live P&L view.',
    focusHealthyTitle: 'Margin is looking healthy',
    focusHealthyBody: 'You have {count} recent activity items with {profit} in net profit, a {margin}% margin, {cogs} in costs, and {expenses} in operating expenses.',
    focusSteadyTitle: 'Profit is building steadily',
    focusSteadyBody: 'Your latest activity is generating {profit} in net profit with a {margin}% margin, {cogs} in costs, and {expenses} in operating expenses.',
    focusReviewTitle: 'Review your costs',
    focusReviewBody: 'You have {count} recent activity items, but your current profit is {profit}. Check your costs and pricing.',
    focusReviewSingleBody: 'Your latest activity shows {profit} in profit. Review your costs and pricing to improve margins.',
    kpiRevenue: 'Total Revenue',
    kpiGrossProfit: 'Gross Profit',
    kpiCogs: 'Total COGS',
    kpiOperatingExpenses: 'Operating Expenses',
    kpiNetProfit: 'Net Profit',
    kpiMargin: 'Profit Margin %',
    revenueTrend: 'Revenue trend',
    revenueTrendSubtitle: 'Steady growth across the week',
  },
};

const defaultProfileForm = {
  firstName: '',
  surname: '',
  email: '',
  businessName: '',
  currency: 'USD',
  operatingExpenses: '',
  password: '',
  language: 'en',
  dateFormat: 'MM/DD/YYYY',
  numberFormat: 'commas',
  dataSource: 'Supabase',
  syncStatus: 'Connected',
  activityTracking: true,
  notificationPreferences: {
    email: true,
    push: true,
    lowStock: true,
    marginDrop: true,
    insufficientStock: true,
    unusualReturns: true,
  },
  lastLoginAt: '',
};

function App() {
  const [sortOrder] = useState('date-desc');
  const [activityFilter, setActivityFilter] = useState('all');
  const [activityProductFilter, setActivityProductFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedAction, setSelectedAction] = useState('sale');
  const [activeView, setActiveView] = useState(() => {
    if (typeof window === 'undefined') {
      return 'dashboard';
    }

    const hash = window.location.hash.replace('#', '');
    const allowedViews = ['dashboard', 'inventory', 'expenses', 'pnl', 'settings'];
    return allowedViews.includes(hash) ? hash : 'dashboard';
  });
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    const savedTheme = window.localStorage.getItem('ledgr-theme-mode');
    return savedTheme ? savedTheme === 'dark' : true;
  });
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formState, setFormState] = useState({
    productId: '',
    quantity: '',
    price: '',
  });
  const [profile, setProfile] = useState(null);
  const [isSupabaseAuthenticated, setIsSupabaseAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    surname: '',
    email: '',
    businessName: '',
    currency: 'USD',
    operatingExpenses: '',
    password: '',
    language: 'en',
    dateFormat: 'MM/DD/YYYY',
    numberFormat: 'commas',
    dataSource: 'Supabase',
    syncStatus: 'Connected',
    activityTracking: true,
    notificationPreferences: {
      email: true,
      push: true,
      lowStock: true,
      marginDrop: true,
      insufficientStock: true,
      unusualReturns: true,
    },
    lastLoginAt: '',
  });

  const normalizeNotificationPreferences = (preferences) => ({
    email: preferences?.email ?? true,
    push: preferences?.push ?? true,
    lowStock: preferences?.lowStock ?? true,
    marginDrop: preferences?.marginDrop ?? true,
    insufficientStock: preferences?.insufficientStock ?? true,
    unusualReturns: preferences?.unusualReturns ?? true,
  });

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('signup'); // 'signup' or 'login'
  const [profileMessage, setProfileMessage] = useState('');
  const [securityMessage, setSecurityMessage] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [toastVariant, setToastVariant] = useState('success');
  const [settingsTab, setSettingsTab] = useState('profile');
  const [availableProducts, setAvailableProducts] = useState([]);
  const [activeActionMenuId, setActiveActionMenuId] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const [expenseEntries, setExpenseEntries] = useState([]);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [expenseForm, setExpenseForm] = useState({ category: '', amount: '', date: '' });
  const [inventoryProductFilter, setInventoryProductFilter] = useState('all');
  const [productSuggestionsOpen, setProductSuggestionsOpen] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [showInstallHint, setShowInstallHint] = useState(false);
  const [showManualInstallHint, setShowManualInstallHint] = useState(false);
  const [manualInstallHintMessage, setManualInstallHintMessage] = useState('');
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);
  const [hasAdSlotVisible, setHasAdSlotVisible] = useState(false);

  const [inventoryStatusFilter, setInventoryStatusFilter] = useState('all');
  const ITEMS_PER_PAGE = 10;

  const isMobileBrowser = (() => {
    if (typeof navigator === 'undefined') {
      return false;
    }

    const ua = navigator.userAgent || '';
    const hasMobileUa = /iphone|ipad|ipod|android|mobile|blackberry|windows phone|iemobile|opera mini/i.test(ua);
    const hasTouch = navigator.maxTouchPoints > 1 || (typeof window !== 'undefined' && 'ontouchstart' in window && /Macintosh/i.test(ua));

    return hasMobileUa || hasTouch;
  })();

  const [inventoryPage, setInventoryPage] = useState(1);
  const [editingInventoryProduct, setEditingInventoryProduct] = useState(null);
  const [pnlPage, setPnlPage] = useState(1);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [inventoryEditForm, setInventoryEditForm] = useState({ name: '', costPrice: '', quantity: '' });
  const [restockingInventoryProduct, setRestockingInventoryProduct] = useState(null);
  const [restockForm, setRestockForm] = useState({ quantity: '', costPerUnit: '' });
  const [securitySnapshot, setSecuritySnapshot] = useState({
    storageUsageBytes: 0,
    storageQuotaBytes: 0,
    notificationPermission: 'default',
    isOnline: true,
    browserLabel: 'Browser',
    lastUpdatedAt: '',
  });

  const ONBOARDING_DISMISSAL_KEY = 'ledgr-onboarding-dismissed';

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('ledgr-theme-mode', isDarkMode ? 'dark' : 'light');
    document.documentElement.style.colorScheme = isDarkMode ? 'dark' : 'light';
  }, [isDarkMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const optionsScriptId = 'sidewalkboiling-dashboard-options-script';
    const invokeScriptId = 'sidewalkboiling-dashboard-invoke-script';
    const containerId = 'container-61a2c10d537d409af3dbb4930b7469ae';

    const removeScripts = () => {
      const optionsScript = document.getElementById(optionsScriptId);
      if (optionsScript) {
        optionsScript.remove();
      }
      const invokeScript = document.getElementById(invokeScriptId);
      if (invokeScript) {
        invokeScript.remove();
      }
    };

    const hasRenderedAd = (element) => {
      if (!element) {
        return false;
      }
      return Array.from(element.children).some((child) => child.tagName !== 'SCRIPT' && child.tagName !== 'NOSCRIPT');
    };

    const updateAdVisibility = () => {
      const container = document.getElementById(containerId);
      setHasAdSlotVisible(hasRenderedAd(container));
    };

    let observer;
    const container = document.getElementById(containerId);

    if (['dashboard', 'inventory', 'pnl', 'expenses'].includes(activeView)) {
      setHasAdSlotVisible(false);
      removeScripts();

      const optionsScript = document.createElement('script');
      optionsScript.id = optionsScriptId;
      optionsScript.type = 'text/javascript';
      optionsScript.innerHTML = "atOptions = { 'key' : '9cf8d9c6a7dce6f9d6cb3730ee799cca', 'format' : 'iframe', 'height' : 300, 'width' : 160, 'params' : {} };";
      if (container) {
        container.appendChild(optionsScript);
      } else {
        document.body.appendChild(optionsScript);
      }

      const invokeScript = document.createElement('script');
      invokeScript.id = invokeScriptId;
      invokeScript.src = 'https://sidewalkboiling.com/61a2c10d537d409af3dbb4930b7469ae/invoke.js';
      invokeScript.async = true;
      if (container) {
        container.appendChild(invokeScript);
      } else {
        document.body.appendChild(invokeScript);
      }

      if (container) {
        observer = new MutationObserver(updateAdVisibility);
        observer.observe(container, { childList: true, subtree: true });
      }

      updateAdVisibility();
      setTimeout(updateAdVisibility, 500);
      setTimeout(updateAdVisibility, 1000);
    } else {
      removeScripts();
      setHasAdSlotVisible(false);
    }

    return () => {
      if (observer) {
        observer.disconnect();
      }
      removeScripts();
    };
  }, [activeView]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const socialScriptId = 'sidewalkboiling-social-script';
    const socialScriptSrc = 'https://sidewalkboiling.com/1c/99/d4/1c99d4cb346beac096c135dad13f2bbb.js';

    const removeSocialBar = () => {
      document.querySelectorAll(`script[src="${socialScriptSrc}"]`).forEach((script) => script.remove());
      const existingScript = document.getElementById(socialScriptId);
      if (existingScript) {
        existingScript.remove();
      }
      document.querySelectorAll('body > div').forEach((el) => {
        if (el.id === 'root') return;
        const text = el.textContent || '';
        if (text.includes('Learn More') && text.includes('Hide')) {
          el.remove();
        }
      });
    };

    const styleSocialPopup = (el) => {
      if (!el || el.id === 'root') {
        return;
      }
      el.style.background = 'transparent';
      el.style.backgroundColor = 'transparent';
      el.style.backgroundImage = 'none';
      el.style.boxShadow = 'none';
      el.style.border = '0';
      el.style.outline = 'none';
      el.style.padding = '0';
      el.style.margin = '0';
      el.style.minWidth = '0';
      el.style.minHeight = '0';
      el.style.maxWidth = 'none';
      el.style.maxHeight = 'none';
      el.style.color = 'inherit';
      el.style.opacity = '1';
      Array.from(el.querySelectorAll('*')).forEach((child) => {
        child.style.background = 'transparent';
        child.style.backgroundColor = 'transparent';
        child.style.backgroundImage = 'none';
        child.style.boxShadow = 'none';
        child.style.border = '0';
        child.style.outline = 'none';
      });
    };

    const applySocialBarStyles = () => {
      document.querySelectorAll('body > div, body div').forEach((el) => {
        if (el.id === 'root') return;
        const text = el.textContent || '';
        if (text.includes('Learn More') && text.includes('Hide')) {
          let current = el;
          while (current && current !== document.body && current !== document.documentElement) {
            styleSocialPopup(current);
            current = current.parentElement;
          }
        }
      });
    };

    const injectSocialBar = () => {
      removeSocialBar();
      const script = document.createElement('script');
      script.id = socialScriptId;
      script.src = socialScriptSrc;
      script.type = 'text/javascript';
      script.async = false;
      script.defer = false;
      script.crossOrigin = 'anonymous';
      document.body.appendChild(script);
      requestAnimationFrame(() => {
        applySocialBarStyles();
      });
      setTimeout(applySocialBarStyles, 200);
      setTimeout(applySocialBarStyles, 500);
      setTimeout(applySocialBarStyles, 1000);
    };

    let socialBarObserver;
    const observeSocialBar = () => {
      socialBarObserver = new MutationObserver(() => {
        applySocialBarStyles();
      });
      socialBarObserver.observe(document.body, { childList: true, subtree: true });
    };

    if (['inventory', 'pnl', 'expenses'].includes(activeView)) {
      injectSocialBar();
      observeSocialBar();
    } else {
      removeSocialBar();
    }

    return () => {
      removeSocialBar();
    };
  }, [activeView]);

  const refreshSecuritySnapshot = async () => {
    try {
      const fallbackStorageUsageBytes = [PROFILE_STORAGE_KEY, EXPENSE_STORAGE_KEY, INVENTORY_META_STORAGE_KEY, ONBOARDING_DISMISSAL_KEY].reduce((sum, key) => sum + (window.localStorage.getItem(key) ?? '').length, 0);
      const nextSnapshot = {
        storageUsageBytes: fallbackStorageUsageBytes,
        storageQuotaBytes: 0,
        notificationPermission: 'unsupported',
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
        browserLabel: 'Browser',
        lastUpdatedAt: new Date().toISOString(),
      };

      if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        const estimatedUsage = Number(estimate.usage ?? 0);
        if (estimatedUsage > 0) {
          nextSnapshot.storageUsageBytes = estimatedUsage;
        }
        nextSnapshot.storageQuotaBytes = Number(estimate.quota ?? 0);
      }

      if (typeof window !== 'undefined' && 'Notification' in window) {
        nextSnapshot.notificationPermission = Notification.permission;
      }

      if (typeof navigator !== 'undefined') {
        nextSnapshot.browserLabel = navigator.userAgentData?.brands?.map((brand) => brand.brand).join(' ') || navigator.userAgent || 'Browser';
      }

      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(() => {
        }).catch(() => {
          setSecurityMessage('Service worker not available.');
        });
      }
    } catch (error) {
      console.error('Error refreshing security snapshot', error);
    }
  };

  const expenseTotal = useMemo(() => expenseEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0), [expenseEntries]);
  const activeLanguage = profileForm.language || profile?.language || 'en';
  const activeNumberFormat = profileForm.numberFormat || profile?.numberFormat || 'us';
  const t = (key, replacements = {}) => {
    const translation = uiTranslations[activeLanguage]?.[key] || uiTranslations.en[key] || key;
    return Object.entries(replacements).reduce((result, [token, value]) => result.replaceAll(`{${token}}`, String(value)), translation);
  };

  const requestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }

    if (Notification.permission === 'granted') {
      return 'granted';
    }

    if (Notification.permission === 'denied') {
      return 'denied';
    }

    return Notification.requestPermission();
  };

  const showToast = (message, variant = 'success') => {
    setToastMessage(message);
    setToastVariant(variant);
  };

  useEffect(() => {
    if (!toastMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setToastMessage('');
    }, 4500);

    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const registerServiceWorker = async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }

    try {
      if (import.meta.env.DEV) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
      return await navigator.serviceWorker.register('/service-worker.js');
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && import.meta.env.DEV && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => {
          // Ignore failures while unregistering stale development service workers.
        });
    }
  }, []);

  const handleInstallPrompt = async () => {
    if (!installPromptEvent || typeof installPromptEvent.prompt !== 'function') {
      return;
    }

    installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;
    setShowInstallHint(false);
    setInstallPromptEvent(null);
    if (choice.outcome === 'accepted') {
      setSecurityMessage('Thanks! Install completed or prompt accepted.');
    } else {
      setSecurityMessage('Installation dismissed. You can add the app later via your browser menu.');
    }
  };

  const handleMobileInstallAction = () => {
    if (installPromptEvent && typeof installPromptEvent.prompt === 'function') {
      handleInstallPrompt();
      return;
    }

    setShowInstallHint(false);
    setShowManualInstallHint(true);
    setSecurityMessage('');

    if (typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)) {
      setManualInstallHintMessage('To install on iOS, tap Share and then Add to Home Screen.');
    } else if (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)) {
      setManualInstallHintMessage('Use your browser menu and choose Add to Home screen to install Ledgr.');
    } else {
      setManualInstallHintMessage('Use your browser menu to install Ledgr or add it to your home screen.');
    }
  };

  const showBrowserNotification = async (title, body) => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }

    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      return false;
    }

    const registration = await registerServiceWorker();
    const options = {
      body,
      tag: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      badge: '/icon-192x192.png',
      icon: '/icon-192x192.png',
      vibrate: [200, 100, 200],
      requireInteraction: false,
      data: { title, body },
    };

    if (registration?.showNotification) {
      registration.showNotification(title, options);
      return true;
    }

    new Notification(title, options);
    return true;
  };

  const subscribeToPushNotifications = async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return null;
    }

    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      return null;
    }

    const registration = await registerServiceWorker();
    if (!registration) {
      return null;
    }

    try {
      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        return existingSubscription;
      }

      const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        return null;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      return subscription;
    } catch {
      return null;
    }
  };

  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const registerPushSubscriptionWithServer = async (subscription) => {
    if (!subscription || !profile?.email) {
      return false;
    }

    const session = await supabase.auth.getUser();
    const userId = session?.data?.user?.id;
    if (!userId) {
      return false;
    }

    try {
      const response = await apiFetch(`${apiBaseUrl}/push/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          subscription,
        }),
      });

      return response.ok;
    } catch {
      return false;
    }
  };

  const handleEnablePushNotifications = async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    try {
      const subscription = await subscribeToPushNotifications();
      if (!subscription) {
        setSecurityMessage('Push notifications could not be enabled. Please allow notifications in your browser.');
        return;
      }

      const registered = await registerPushSubscriptionWithServer(subscription);
      if (registered) {
        setSecurityMessage('Push notifications enabled for this device.');
      } else {
        setSecurityMessage('Push notifications subscription was created, but server registration failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const maybeSendNotification = async ({ kind, title, body }) => {
    const notificationPreferences = profileForm.notificationPreferences || profile?.notificationPreferences || {};

    if (!notificationPreferences.push) {
      return false;
    }

    switch (kind) {
      case 'lowStock':
        if (!notificationPreferences.lowStock) return false;
        break;
      case 'marginDrop':
        if (!notificationPreferences.marginDrop) return false;
        break;
      case 'insufficientStock':
        if (!notificationPreferences.insufficientStock) return false;
        break;
      case 'unusualReturns':
        if (!notificationPreferences.unusualReturns) return false;
        break;
      default:
        break;
    }

    const subscription = await subscribeToPushNotifications();
    if (subscription) {
      await registerPushSubscriptionWithServer(subscription);
    }

    return showBrowserNotification(title, body);
  };

  const dismissOnboarding = () => {
    window.localStorage.setItem(ONBOARDING_DISMISSAL_KEY, 'true');
    setShowOnboarding(false);
  };

  const readInventoryMeta = () => {
    try {
      const storedMeta = window.localStorage.getItem(INVENTORY_META_STORAGE_KEY);
      if (!storedMeta) {
        return {};
      }

      const parsed = JSON.parse(storedMeta);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };

  const persistInventoryMeta = (meta) => {
    try {
      window.localStorage.setItem(INVENTORY_META_STORAGE_KEY, JSON.stringify(meta));
    } catch {
      // Ignore persistence failures.
    }
  };

  const normalizeInventoryProducts = (products = []) => {
    const storedMeta = readInventoryMeta();

    return (products || []).map((product) => {
      const key = String(product?.id ?? product?.name ?? '');
      const productMeta = storedMeta?.[key] || storedMeta?.[String(product?.id)] || {};

      return {
        ...product,
        category: product?.category || productMeta.category || 'General',
        sku: product?.sku || productMeta.sku || `SKU-${key || '000'}`,
        reorder_level: Number(product?.reorder_level ?? productMeta.reorderLevel ?? 5),
        reorderLevel: Number(product?.reorder_level ?? productMeta.reorderLevel ?? 5),
      };
    });
  };

  useEffect(() => {
    setFormState((prev) => ({ ...prev, price: '' }));
  }, [selectedAction]);

  const loadExpenses = async () => {
    try {
      const response = await apiFetch(`${apiBaseUrl}/expenses`);
      const json = await response.json();

      if (response.ok && json.success) {
        const nextEntries = (json.data?.expenses ?? []).map((entry) => ({
          id: entry.id,
          category: entry.category || 'Operating Expenses',
          amount: Number(entry.amount || 0),
          date: entry.date || new Date().toISOString().slice(0, 10),
        }));
        setExpenseEntries(nextEntries);
        return nextEntries;
      }
    } catch {
      // Ignore load failures and keep the existing UI state.
    }

    return [];
  };

  useEffect(() => {
    if (!authReady || !isSupabaseAuthenticated) {
      return;
    }

    loadExpenses();
  }, [authReady, isSupabaseAuthenticated]);

  useEffect(() => {
    const handlePointerDownOutside = (event) => {
      if (!(event.target instanceof HTMLElement)) {
        setActiveActionMenuId(null);
        return;
      }

      const clickedInsideMenu = event.target.closest('[data-action-menu-root]');
      if (!clickedInsideMenu) {
        setActiveActionMenuId(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDownOutside);
    return () => document.removeEventListener('mousedown', handlePointerDownOutside);
  }, []);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const snapshot = getGuestWorkspaceSnapshot();
        const hasDismissedOnboarding = window.localStorage.getItem(ONBOARDING_DISMISSAL_KEY) === 'true';

        if (snapshot.profile) {
          const parsedProfile = snapshot.profile;
          setProfile(parsedProfile);
          setProfileForm({
            firstName: parsedProfile.firstName ?? '',
            surname: parsedProfile.surname ?? '',
            email: parsedProfile.email ?? '',
            businessName: parsedProfile.businessName ?? '',
            currency: parsedProfile.currency ?? 'USD',
            operatingExpenses: parsedProfile.operatingExpenses != null ? String(parsedProfile.operatingExpenses) : '',
            password: parsedProfile.password ?? '',
            language: parsedProfile.language ?? 'en',
            dateFormat: parsedProfile.dateFormat ?? 'MM/DD/YYYY',
            numberFormat: parsedProfile.numberFormat ?? 'commas',
            dataSource: parsedProfile.dataSource ?? 'Supabase',
            syncStatus: parsedProfile.syncStatus ?? 'Connected',
            activityTracking: parsedProfile.activityTracking !== false,
            notificationPreferences: normalizeNotificationPreferences(parsedProfile.notificationPreferences),
            lastLoginAt: parsedProfile.lastLoginAt ?? '',
          });
        } else if (hasDismissedOnboarding) {
          setShowOnboarding(false);
        } else {
          setShowOnboarding(true);
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setIsSupabaseAuthenticated(true);
          const [{ data: profileData }, { data: workspaceData }] = await Promise.all([
            supabase.from('user_profiles').select('*').eq('id', session.user.id).single(),
            supabase.from('workspace_snapshots').select('*').eq('user_id', session.user.id).maybeSingle(),
          ]);

          const syncedProfile = profileData ? {
            firstName: profileData.display_name?.split(' ')[0] || session.user.user_metadata?.firstName || session.user.user_metadata?.full_name || 'User',
            surname: profileData.display_name?.split(' ').slice(1).join(' ') || session.user.user_metadata?.surname || '',
            email: profileData.email || session.user.email || '',
            businessName: profileData.business_name || session.user.user_metadata?.businessName || '',
            currency: profileData.currency || 'USD',
            language: profileData.language || 'en',
            dateFormat: profileData.date_format || 'MM/DD/YYYY',
            numberFormat: profileData.number_format || 'commas',
            dataSource: 'Supabase',
            syncStatus: 'Connected',
            activityTracking: profileData.activity_tracking !== false,
            notificationPreferences: normalizeNotificationPreferences(profileData.notification_preferences),
            lastLoginAt: new Date().toISOString(),
          } : {
            firstName: session.user.user_metadata?.firstName || 'User',
            surname: session.user.user_metadata?.surname || '',
            email: session.user.email || '',
            businessName: session.user.user_metadata?.businessName || '',
            currency: session.user.user_metadata?.currency || 'USD',
            language: 'en',
            dateFormat: 'MM/DD/YYYY',
            numberFormat: 'commas',
            dataSource: 'Supabase',
            syncStatus: 'Connected',
            activityTracking: true,
            notificationPreferences: normalizeNotificationPreferences(session.user.user_metadata?.notificationPreferences),
            lastLoginAt: new Date().toISOString(),
          };

          if (workspaceData?.profile) {
            const mergedProfile = mergeGuestWorkspaceIntoProfile(syncedProfile, workspaceData.profile);
            const normalizedMergedProfile = {
              ...mergedProfile,
              activityTracking: mergedProfile.activityTracking !== false,
              notificationPreferences: normalizeNotificationPreferences(mergedProfile.notificationPreferences),
            };

            setProfile(normalizedMergedProfile);
            setProfileForm((prev) => ({
              ...prev,
              firstName: normalizedMergedProfile.firstName || '',
              surname: normalizedMergedProfile.surname || '',
              email: normalizedMergedProfile.email || '',
              businessName: normalizedMergedProfile.businessName || '',
              currency: normalizedMergedProfile.currency || 'USD',
              language: normalizedMergedProfile.language || 'en',
              dateFormat: normalizedMergedProfile.dateFormat || 'MM/DD/YYYY',
              numberFormat: normalizedMergedProfile.numberFormat || 'commas',
              dataSource: 'Supabase',
              syncStatus: 'Connected',
              activityTracking: normalizedMergedProfile.activityTracking,
              notificationPreferences: normalizedMergedProfile.notificationPreferences,
              lastLoginAt: normalizedMergedProfile.lastLoginAt || new Date().toISOString(),
            }));
            persistGuestWorkspace({ profile: normalizedMergedProfile, expenses: Array.isArray(workspaceData.expenses) ? workspaceData.expenses : expenseEntries, inventoryMeta: workspaceData.inventory_meta || readInventoryMeta(), mode: 'authenticated' });
            setExpenseEntries(Array.isArray(workspaceData.expenses) ? workspaceData.expenses : expenseEntries);
          } else {
            setProfile(syncedProfile);
            setProfileForm((prev) => ({
              ...prev,
              firstName: syncedProfile.firstName || '',
              surname: syncedProfile.surname || '',
              email: syncedProfile.email || '',
              businessName: syncedProfile.businessName || '',
              currency: syncedProfile.currency || 'USD',
              language: syncedProfile.language || 'en',
              dateFormat: syncedProfile.dateFormat || 'MM/DD/YYYY',
              numberFormat: syncedProfile.numberFormat || 'commas',
              dataSource: 'Supabase',
              syncStatus: 'Connected',
              activityTracking: syncedProfile.activityTracking,
              notificationPreferences: syncedProfile.notificationPreferences,
              lastLoginAt: syncedProfile.lastLoginAt,
            }));
            persistGuestWorkspace({ profile: syncedProfile, expenses: expenseEntries, inventoryMeta: readInventoryMeta(), mode: 'authenticated' });
          }

          setShowOnboarding(false);
        }
      } catch {
        setShowOnboarding(true);
      }
    };

    initializeAuth();
  }, []);

  useEffect(() => {
    refreshSecuritySnapshot();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const restoreAuthSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setIsSupabaseAuthenticated(Boolean(session?.user));
      } catch (error) {
        console.error('Unable to restore Supabase session:', error);
      } finally {
        setAuthReady(true);
      }
    };

    restoreAuthSession();

    const authListener = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSupabaseAuthenticated(Boolean(session?.user));
      setAuthReady(true);
    });

    return () => {
      authListener.data?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPromptEvent(event);
      setShowInstallHint(true);
      setShowManualInstallHint(false);
    };

    const handleDeferredPromptReady = () => {
      if (typeof window !== 'undefined' && window.deferredInstallPrompt) {
        handleBeforeInstallPrompt(window.deferredInstallPrompt);
      } else if (isMobileBrowser) {
        setShowManualInstallHint(true);
      }
    };

    const handleAppInstalled = () => {
      setIsPwaInstalled(true);
      setShowInstallHint(false);
      setShowManualInstallHint(false);
      setInstallPromptEvent(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('deferredinstallprompt-ready', handleDeferredPromptReady);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (typeof window !== 'undefined') {
      handleDeferredPromptReady();

      if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
        setIsPwaInstalled(true);
        setShowInstallHint(false);
        setShowManualInstallHint(false);
      } else if (isMobileBrowser) {
        setShowManualInstallHint(true);
      }
    }

    registerServiceWorker();

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('deferredinstallprompt-ready', handleDeferredPromptReady);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);
        const operatingExpensesValue = Number(expenseTotal || profileForm.operatingExpenses || profile?.operatingExpenses || 0);
        const headers = await getAuthenticatedHeaders();
        const response = await fetch(`${apiBaseUrl}/dashboard?operatingExpenses=${encodeURIComponent(String(operatingExpensesValue))}`, { headers });
        const json = await response.json();

        if (!response.ok || !json.success) {
          throw new Error(json.error || 'Failed to load dashboard');
        }

        setDashboardData(json.data);
      } catch (err) {
        setError(err.message || 'Unable to load data');
      } finally {
        setLoading(false);
      }
    };

    if (!authReady || !isSupabaseAuthenticated) {
      return;
    }

    loadDashboard();
  }, [authReady, isSupabaseAuthenticated, profile?.operatingExpenses, profileForm.operatingExpenses, expenseTotal]);

  const loadProducts = async () => {
    try {
      const response = await apiFetch(`${apiBaseUrl}/products`);
      const json = await response.json();

      if (response.ok && json.success) {
        const nextProducts = normalizeInventoryProducts(json.data?.products ?? []);
        setAvailableProducts(nextProducts);
        return nextProducts;
      }
    } catch {
      setAvailableProducts([]);
    }

    return [];
  };

  useEffect(() => {
    if (!authReady || !isSupabaseAuthenticated) {
      return;
    }

    loadProducts();
  }, [authReady, isSupabaseAuthenticated]);

  useEffect(() => {
    if (modalOpen) {
      loadProducts();
    }
  }, [modalOpen]);

  const transactions = dashboardData?.transactions ?? [];
  const trendData = dashboardData?.trend ?? fallbackTrendData;


  const refreshDashboard = async () => {
    try {
      await loadExpenses();
      const operatingExpensesValue = Number(expenseTotal || profileForm.operatingExpenses || profile?.operatingExpenses || 0);
      const response = await apiFetch(`${apiBaseUrl}/dashboard?operatingExpenses=${encodeURIComponent(String(operatingExpensesValue))}`);
      const json = await response.json();

      if (response.ok && json.success) {
        setDashboardData(json.data);
      }

      await loadProducts();
    } catch {
      // Ignore refresh failures and keep the current UI state.
    }
  };

  const refreshCurrentView = async (view = activeView) => {
    if (view === 'dashboard' || view === 'pnl') {
      await refreshDashboard();
    } else if (view === 'inventory') {
      await loadProducts();
    } else if (view === 'expenses') {
      await loadExpenses();
    }
  };

  useEffect(() => {
    if (!authReady) {
      return;
    }

    refreshCurrentView();
  }, [activeView, authReady]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshCurrentView();
      }
    };

    const handleWindowFocus = () => {
      refreshCurrentView();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handleWindowFocus);
    };
  }, [activeView, expenseTotal, profileForm.operatingExpenses, profile?.operatingExpenses]);

  const closeInventoryModal = () => {
    setShowInventoryModal(false);
    setEditingInventoryProduct(null);
    setInventoryEditForm({ name: '', costPrice: '', quantity: '' });
  };

  const handleEditInventoryProduct = (row) => {
    setEditingInventoryProduct(row);
    setShowInventoryModal(true);
    setInventoryEditForm({
      name: row.name || '',
      costPrice: String(row.costPrice ?? row.cost_price ?? 0),
      quantity: String(row.quantity ?? row.current_stock ?? 0),
    });
    setRestockingInventoryProduct(null);
    setRestockForm({ quantity: '', costPerUnit: '' });
  };

  const handleSaveInventoryEdit = async () => {
    if (submitting) {
      return;
    }

    if (!editingInventoryProduct) {
      return;
    }

    setSubmitting(true);

    try {
      const isNewProduct = editingInventoryProduct === 'new';

      if (isNewProduct) {
        if (!inventoryEditForm.name.trim()) {
          setActionMessage('Please enter a product name.');
          return;
        }

        const response = await apiFetch(`${apiBaseUrl}/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: inventoryEditForm.name.trim(),
            current_stock: Number(inventoryEditForm.quantity || 0),
            cost_price: Number(inventoryEditForm.costPrice || 0),
            selling_price: 0,
          }),
        });
        const json = await response.json();

        if (!response.ok || !json.success) {
          throw new Error(json.error || 'Unable to create product');
        }

        setAvailableProducts((prev) => [
          ...prev,
          {
            id: json.data?.product?.id,
            name: inventoryEditForm.name.trim(),
            current_stock: Number(inventoryEditForm.quantity || 0),
            cost_price: Number(inventoryEditForm.costPrice || 0),
            selling_price: 0,
          },
        ]);
        setActionMessage('Product created successfully.');
      } else {
        const response = await apiFetch(`${apiBaseUrl}/products/${editingInventoryProduct.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: inventoryEditForm.name.trim(),
            cost_price: Number(inventoryEditForm.costPrice || 0),
            selling_price: 0,
            current_stock: Number(inventoryEditForm.quantity || 0),
          }),
        });
        const json = await response.json();

        if (!response.ok || !json.success) {
          throw new Error(json.error || 'Unable to update product');
        }

        const nextMeta = readInventoryMeta();
        nextMeta[String(editingInventoryProduct.id)] = {
          sku: editingInventoryProduct.sku || `SKU-${editingInventoryProduct.id}`,
          category: editingInventoryProduct.category || 'General',
          reorderLevel: Number(editingInventoryProduct.reorderLevel ?? editingInventoryProduct.reorder_level ?? 5),
        };
        persistInventoryMeta(nextMeta);

        setAvailableProducts((prev) => prev.map((product) => (product.id === editingInventoryProduct.id ? {
          ...product,
          name: inventoryEditForm.name.trim() || product.name,
          cost_price: Number(inventoryEditForm.costPrice || 0),
          current_stock: Number(inventoryEditForm.quantity || 0),
          selling_price: 0,
          sku: product.sku,
          category: product.category || 'General',
          reorder_level: Number(product.reorderLevel ?? product.reorder_level ?? 5),
          reorderLevel: Number(product.reorderLevel ?? product.reorder_level ?? 5),
        } : product)));
        setActionMessage('Product updated.');
      }

      setShowInventoryModal(false);
      setEditingInventoryProduct(null);
      setInventoryEditForm({ name: '', costPrice: '', quantity: '' });
      await refreshDashboard();
    } catch (err) {
      setActionMessage(err.message || 'Unable to save product.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteInventoryProduct = async (row) => {
    if (submitting) {
      return;
    }
    if (!window.confirm(`Delete ${row.name}?`)) {
      return;
    }

    setSubmitting(true);

    try {
      const response = await apiFetch(`${apiBaseUrl}/products/${row.id}`, {
        method: 'DELETE',
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || 'Unable to delete product');
      }

      const nextMeta = readInventoryMeta();
      delete nextMeta[String(row.id)];
      persistInventoryMeta(nextMeta);
      setAvailableProducts((prev) => prev.filter((product) => product.id !== row.id));
      setActionMessage('Product removed.');
      await refreshDashboard();
    } catch (err) {
      setActionMessage(err.message || 'Unable to delete product.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestockInventoryProduct = (row) => {
    setRestockingInventoryProduct(row);
    setRestockForm({ quantity: '', costPerUnit: '' });
    setEditingInventoryProduct(null);
    setInventoryEditForm({ name: '', costPrice: '', quantity: '' });
  };

  const handleSaveInventoryRestock = async () => {
    if (submitting) {
      return;
    }

    if (!restockingInventoryProduct) {
      return;
    }

    setSubmitting(true);

    try {
      const quantity = Number(restockForm.quantity || 0);
      const costPerUnit = Number(restockForm.costPerUnit || 0);

      if (!quantity || !costPerUnit) {
        throw new Error('Please enter a quantity and cost per unit.');
      }

      const response = await apiFetch(`${apiBaseUrl}/restocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: Number(restockingInventoryProduct.id),
          quantity,
          cost_per_unit: costPerUnit,
        }),
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || 'Unable to restock product');
      }

      setRestockingInventoryProduct(null);
      setRestockForm({ quantity: '', costPerUnit: '' });
      setActionMessage('Restock recorded.');
      await refreshDashboard();
      await maybeSendNotification({
        kind: 'activity',
        title: 'Restock recorded',
        body: `Restock recorded for ${restockingInventoryProduct.name}.`,
      });
    } catch (err) {
      setActionMessage(err.message || 'Unable to restock product.');
    } finally {
      setSubmitting(false);
    }
  };


  const handleDeleteEntry = async (entryId) => {
    setActiveActionMenuId(null);

    try {
      const entry = transactions.find((transaction) => transaction.id === entryId);
      const response = await apiFetch(`${apiBaseUrl}/activities/${entryId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: entry?.type === 'Restock' ? 'restock' : 'sale' }),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || 'Unable to delete entry');
      }

      await refreshDashboard();
      setActionMessage('Entry removed from the database.');
    } catch (err) {
      setActionMessage(err.message || 'Unable to delete entry.');
    }
  };

  const handleRefundEntry = async (entryId) => {
    setActiveActionMenuId(null);

    try {
      const entry = transactions.find((transaction) => transaction.id === entryId);
      const response = await apiFetch(`${apiBaseUrl}/activities/${entryId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: entry?.type === 'Restock' ? 'restock' : 'sale' }),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || 'Unable to refund entry');
      }

      await refreshDashboard();
      setActionMessage('Entry marked as a refund.');
      await maybeSendNotification({
        kind: 'unusualReturns',
        title: 'Refund recorded',
        body: `A refund was recorded for ${entry?.productName || 'an activity entry'}.`,
      });
    } catch (err) {
      setActionMessage(err.message || 'Unable to refund entry.');
    }
  };

  const matchesDateRange = (entryDate, filter, customStart, customEnd) => {
    if (!entryDate) {
      return true;
    }

    const parsedDate = new Date(entryDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return true;
    }

    const entryDay = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
    const today = new Date();
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    switch (filter) {
      case 'today': {
        return entryDay.getTime() === todayDay.getTime();
      }
      case 'yesterday': {
        const yesterday = new Date(todayDay);
        yesterday.setDate(todayDay.getDate() - 1);
        return entryDay.getTime() === yesterday.getTime();
      }
      case 'last-7-days': {
        const start = new Date(todayDay);
        start.setDate(todayDay.getDate() - 6);
        return entryDay >= start && entryDay <= todayDay;
      }
      case 'last-30-days': {
        const start = new Date(todayDay);
        start.setDate(todayDay.getDate() - 29);
        return entryDay >= start && entryDay <= todayDay;
      }
      case 'this-week': {
        const day = todayDay.getDay();
        const diff = (day + 6) % 7;
        const start = new Date(todayDay);
        start.setDate(todayDay.getDate() - diff);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return entryDay >= start && entryDay <= end;
      }
      case 'this-month': {
        const start = new Date(todayDay.getFullYear(), todayDay.getMonth(), 1);
        const end = new Date(todayDay.getFullYear(), todayDay.getMonth() + 1, 0);
        return entryDay >= start && entryDay <= end;
      }
      case 'last-month': {
        const start = new Date(todayDay.getFullYear(), todayDay.getMonth() - 1, 1);
        const end = new Date(todayDay.getFullYear(), todayDay.getMonth(), 0);
        return entryDay >= start && entryDay <= end;
      }
      case 'this-year': {
        const start = new Date(todayDay.getFullYear(), 0, 1);
        const end = new Date(todayDay.getFullYear(), 11, 31);
        return entryDay >= start && entryDay <= end;
      }
      case 'custom': {
        if (!customStart && !customEnd) {
          return true;
        }

        const start = customStart ? new Date(customStart) : null;
        const end = customEnd ? new Date(customEnd) : null;

        if (start && end) {
          return entryDay >= start && entryDay <= end;
        }

        if (start) {
          return entryDay >= start;
        }

        if (end) {
          return entryDay <= end;
        }

        return true;
      }
      default:
        return true;
    }
  };
  const trendChangePercent = useMemo(() => {
    if (!trendData?.length) {
      return null;
    }

    const firstRevenue = Number(trendData[0]?.revenue ?? 0);
    const lastRevenue = Number(trendData[trendData.length - 1]?.revenue ?? 0);

    if (!firstRevenue && !lastRevenue) {
      return null;
    }

    if (!firstRevenue) {
      return lastRevenue > 0 ? 100 : 0;
    }

    return ((lastRevenue - firstRevenue) / firstRevenue) * 100;
  }, [trendData]);
  const navItems = [
    { id: 'dashboard', label: t('navDashboard'), icon: LayoutGrid },
    { id: 'inventory', label: t('navInventory'), icon: Package },
    { id: 'pnl', label: t('navPnl'), icon: ReceiptText },
    { id: 'expenses', label: t('navExpenses'), icon: BadgeDollarSign },
    { id: 'settings', label: t('navSettings'), icon: Settings },
  ];
  const hasActivity = (dashboardData?.revenue ?? 0) > 0 || transactions.length > 0;
  const currencyCode = profileForm.currency || profile?.currency || 'USD';
  const currencyOptions = [
    'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'ATS', 'AUD', 'AWG', 'AZN', 'BAM', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD',
    'CAD', 'CDF', 'CHF', 'CLP', 'CNY', 'COP', 'CRC', 'CUP', 'CVE', 'CZK',
    'DJF', 'DKK', 'DOP', 'DZD',
    'EGP', 'EUR', 'ETB',
    'FJD', 'FKP',
    'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD',
    'HKD', 'HNL', 'HRK', 'HTG', 'HUF',
    'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK',
    'JMD', 'JOD', 'JPY',
    'KES', 'KGS', 'KHR', 'KMF', 'KRW', 'KWD', 'KYD', 'KZT',
    'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD',
    'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRO', 'MUR', 'MVR', 'MWK', 'MXN', 'MYR', 'MZN',
    'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD',
    'OMR',
    'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG',
    'QAR',
    'RON', 'RSD', 'RUB', 'RWF',
    'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SLL', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL',
    'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS',
    'UAH', 'UGX', 'USD', 'UYU', 'UZS',
    'VES', 'VND', 'VUV',
    'WST',
    'XAF', 'XCD', 'XOF', 'XPF',
    'YER',
    'ZAR', 'ZMW', 'ZWL',
  ].sort((a, b) => a.localeCompare(b));
  const getCurrencyMeta = (currency = currencyCode) => {
    const normalizedCurrency = String(currency || 'USD').toUpperCase();

    try {
      const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: normalizedCurrency,
        currencyDisplay: 'narrowSymbol',
        maximumFractionDigits: 0,
      });

      const currencyPart = formatter.formatToParts(1000).find((part) => part.type === 'currency');
      const symbol = currencyPart?.value || normalizedCurrency;

      return { label: normalizedCurrency, symbol };
    } catch {
      return { label: normalizedCurrency, symbol: normalizedCurrency };
    }
  };
  const getNumberFormatLocale = () => {
    switch (activeNumberFormat) {
      case 'de-DE':
        return 'de-DE';
      case 'fr-FR':
        return 'fr-FR';
      case 'sv-SE':
        return 'sv-SE';
      case 'en-IN':
        return 'en-IN';
      default:
        return 'en-US';
    }
  };

  const formatNumber = (value) => {
    const locale = getNumberFormatLocale();
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value ?? 0));
  };

  const formatDisplayDate = (value) => {
    if (!value) {
      return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    switch (profileForm.dateFormat || profile?.dateFormat || 'MM/DD/YYYY') {
      case 'DD/MM/YYYY':
        return `${day}/${month}/${year}`;
      case 'YYYY-MM-DD':
        return `${year}-${month}-${day}`;
      default:
        return `${month}/${day}/${year}`;
    }
  };

  const formatCurrency = (value, currency = currencyCode) => {
    const { symbol } = getCurrencyMeta(currency);
    const absValue = Math.abs(Number(value ?? 0));
    const formattedValue = formatNumber(absValue);
    const sign = Number(value ?? 0) < 0 ? '-' : '';
    return `${sign}${symbol}${formattedValue}`;
  };
  const getCurrencyLabel = (currency = currencyCode) => {
    const { label, symbol } = getCurrencyMeta(currency);
    return `${label} (${symbol})`;
  };
  const parseCurrencyValue = (value) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replace(/[^0-9.-]/g, ''));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };
  const formatStorageUsage = (bytes) => {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getPromptToneClasses = (message, fallbackClassName = '') => {
    if (!message) {
      return fallbackClassName;
    }

    const positiveKeywords = /(success|created|updated|saved|recorded|ready|welcome back|synced|signed out|cleared|connected)/i;
    const negativeKeywords = /(please|unable|does not exist|error|invalid|insufficient|not enough|failed|denied|cannot|review)/i;

    if (negativeKeywords.test(message)) {
      return isDarkMode
        ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
        : 'border-rose-200 bg-rose-50 text-rose-700';
    }

    if (positiveKeywords.test(message)) {
      return isDarkMode
        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700';
    }

    return fallbackClassName;
  };

  const focusSummary = useMemo(() => {
    const revenue = Number(dashboardData?.revenue ?? 0);
    const profit = Number(dashboardData?.profit ?? 0);
    const cogs = Number(dashboardData?.cogs ?? 0);
    const operatingExpenses = Number(dashboardData?.operatingExpenses ?? 0);
    const profitMargin = Number(dashboardData?.profitMargin ?? 0);
    const recentActivityCount = transactions.length;

    if (!hasActivity) {
      return {
        title: t('focusStartTracking'),
        body: t('focusStartBody'),
      };
    }

    if (profit > 0) {
      return {
        title: profit > revenue * 0.2 ? t('focusHealthyTitle') : t('focusSteadyTitle'),
        body: recentActivityCount > 1
          ? t('focusHealthyBody', { count: recentActivityCount, profit: formatCurrency(profit), margin: profitMargin.toFixed(1), cogs: formatCurrency(cogs), expenses: formatCurrency(operatingExpenses) })
          : t('focusSteadyBody', { profit: formatCurrency(profit), margin: profitMargin.toFixed(1), cogs: formatCurrency(cogs), expenses: formatCurrency(operatingExpenses) }),
      };
    }

    return {
      title: t('focusReviewTitle'),
      body: recentActivityCount > 1
        ? t('focusReviewBody', { count: recentActivityCount, profit: formatCurrency(profit) })
        : t('focusReviewSingleBody', { profit: formatCurrency(profit) }),
    };
  }, [dashboardData, hasActivity, transactions.length, currencyCode, activeLanguage]);

  const kpiCards = useMemo(() => [
    {
      label: t('kpiRevenue'),
      value: formatCurrency(dashboardData?.revenue ?? 0),
      rawValue: Number(dashboardData?.revenue ?? 0),
      positiveColor: true,
      icon: DollarSign,
    },
    {
      label: t('kpiGrossProfit'),
      value: formatCurrency(dashboardData?.grossProfit ?? 0),
      rawValue: Number(dashboardData?.grossProfit ?? 0),
      icon: TrendingUp,
    },
    {
      label: t('kpiCogs'),
      value: formatCurrency(dashboardData?.cogs ?? 0),
      rawValue: Number(dashboardData?.cogs ?? 0),
      alwaysNegative: true,
      icon: Boxes,
    },
    {
      label: t('kpiOperatingExpenses'),
      value: formatCurrency(dashboardData?.operatingExpenses ?? 0),
      rawValue: Number(dashboardData?.operatingExpenses ?? 0),
      alwaysNegative: true,
      icon: ReceiptText,
    },
    {
      label: t('kpiMargin'),
      value: `${Number(dashboardData?.profitMargin ?? 0).toFixed(1)}%`,
      rawValue: Number(dashboardData?.profitMargin ?? 0),
      icon: TrendingUp,
    },
    {
      label: t('kpiNetProfit'),
      value: formatCurrency(dashboardData?.profit ?? 0),
      rawValue: Number(dashboardData?.profit ?? 0),
      icon: TrendingUp,
    },
  ], [dashboardData, currencyCode]);

  const handleSave = async () => {
    if (!formState.quantity || !formState.price) {
      setError('Please complete the quantity and price before saving.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const productName = formState.productId.trim() ? formState.productId.trim() : 'Starter SKU';
      const enteredPrice = Number(formState.price || 0);
      const existingProductResponse = await apiFetch(`${apiBaseUrl}/products?name=${encodeURIComponent(productName)}`);
      const existingProductJson = await existingProductResponse.json();

      let productId = existingProductJson?.data?.product?.id;

      if (!productId) {
        throw new Error(`Product "${productName}" does not exist. Please add the product to inventory before recording a ${selectedAction}.`);
      }

      const endpoint = selectedAction === 'sale' ? `${apiBaseUrl}/sales` : `${apiBaseUrl}/restocks`;
      const payload = selectedAction === 'sale'
        ? {
            product_id: Number(productId),
            quantity: Number(formState.quantity),
            selling_price: Number(formState.price),
          }
        : {
            product_id: Number(productId),
            quantity: Number(formState.quantity),
            cost_per_unit: Number(formState.price),
          };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || `Unable to save ${selectedAction}`);
      }

      const savedProductName = productName.trim();
      setAvailableProducts((prev) => {
        const alreadyExists = prev.some((product) => (product?.name || '').toLowerCase() === savedProductName.toLowerCase());
        if (alreadyExists) {
          return prev;
        }

        return [
          ...prev,
          {
            id: Number(productId),
            name: savedProductName,
            current_stock: 0,
            cost_price: enteredPrice,
            selling_price: enteredPrice,
          },
        ];
      });

      setFormState({ productId: '', quantity: '', price: '' });
      setModalOpen(false);
      const operatingExpensesValue = Number(expenseTotal || profileForm.operatingExpenses || profile?.operatingExpenses || 0);
      const refreshed = await apiFetch(`${apiBaseUrl}/dashboard?operatingExpenses=${encodeURIComponent(String(operatingExpensesValue))}`);
      const refreshedJson = await refreshed.json();
      setDashboardData(refreshedJson.data);
      const latestProducts = await loadProducts();
      await maybeSendNotification({
        kind: 'activity',
        title: selectedAction === 'sale' ? 'Sale recorded' : 'Restock recorded',
        body: `${selectedAction === 'sale' ? 'Sale' : 'Restock'} recorded for ${savedProductName}.`,
      });

      const lowStockProduct = latestProducts.find((product) => product?.status?.label === 'Low stock' || product?.status?.label === 'Out of stock');
      if (lowStockProduct) {
        await maybeSendNotification({
          kind: 'lowStock',
          title: 'Low stock alert',
          body: `${lowStockProduct.name} is now ${lowStockProduct.status.label.toLowerCase()}.`,
        });
      }

      const matchedProduct = latestProducts.find((product) => (product?.name || '').toLowerCase() === savedProductName.toLowerCase());
      if (matchedProduct && Number(matchedProduct.profitMargin || 0) < 5) {
        await maybeSendNotification({
          kind: 'marginDrop',
          title: 'Margin warning',
          body: `${matchedProduct.name} is running below a 5% margin.`,
        });
      }
    } catch (err) {
      const errorMessage = err.message || `Unable to save ${selectedAction}`;
      setError(errorMessage);
      
      if (errorMessage === 'Insufficient stock') {
        await maybeSendNotification({
          kind: 'insufficientStock',
          title: 'Insufficient stock',
          body: `Not enough stock available for ${productName.trim()}.`,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const buildNextProfile = () => ({
    firstName: profileForm.firstName.trim(),
    surname: profileForm.surname.trim(),
    email: profileForm.email.trim(),
    businessName: profileForm.businessName.trim(),
    currency: profileForm.currency || 'USD',
    operatingExpenses: Number(expenseTotal || profileForm.operatingExpenses || 0),
    password: profileForm.password || profile?.password || '',
    language: profileForm.language || 'en',
    dateFormat: profileForm.dateFormat || 'MM/DD/YYYY',
    numberFormat: profileForm.numberFormat || 'commas',
    dataSource: profileForm.dataSource || 'Supabase',
    syncStatus: profileForm.syncStatus || 'Connected',
    activityTracking: profileForm.activityTracking !== false,
    notificationPreferences: {
      email: profileForm.notificationPreferences?.email ?? true,
      push: profileForm.notificationPreferences?.push ?? true,
      lowStock: profileForm.notificationPreferences?.lowStock ?? true,
      marginDrop: profileForm.notificationPreferences?.marginDrop ?? true,
      insufficientStock: profileForm.notificationPreferences?.insufficientStock ?? true,
      unusualReturns: profileForm.notificationPreferences?.unusualReturns ?? true,
    },
    lastLoginAt: new Date().toISOString(),
  });

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);
    const firstName = profileForm.firstName.trim();
    const surname = profileForm.surname.trim();
    const email = profileForm.email.trim();
    const password = profileForm.password;

    if (!firstName || !surname) {
      setProfileMessage('Please add both your first name and surname.');
      setSubmitting(false);
      return;
    }

    if (!email) {
      setProfileMessage('Please enter your email address.');
      setSubmitting(false);
      return;
    }

    if (!profile && !password) {
      setProfileMessage('Please create a password to continue.');
      setSubmitting(false);
      return;
    }

    const nextProfile = buildNextProfile();

    if (!profile) {
      try {
        const createAccountResponse = await apiFetch(`${apiBaseUrl}/auth/signup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            password,
            firstName,
            surname,
            businessName: nextProfile.businessName,
            currency: nextProfile.currency,
            language: nextProfile.language,
            dateFormat: nextProfile.dateFormat,
            numberFormat: nextProfile.numberFormat,
            activityTracking: nextProfile.activityTracking,
            notificationPreferences: nextProfile.notificationPreferences,
            expenses: expenseEntries,
            inventoryMeta: readInventoryMeta(),
          }),
        });

        const createAccountResult = await parseJsonResponse(createAccountResponse);
        if (!createAccountResponse.ok) {
          throw new Error(createAccountResult?.error || `Signup failed with status ${createAccountResponse.status}`);
        }
        if (!createAccountResult?.success) {
          throw new Error(createAccountResult?.error || 'Unable to create your account in Supabase.');
        }

        const signInResult = await supabase.auth.signInWithPassword({ email, password });
        const activeSession = signInResult.data?.session;
        const activeSessionUser = activeSession?.user;

        if (activeSessionUser) {
          setIsSupabaseAuthenticated(true);
        }

        persistGuestWorkspace({
          profile: nextProfile,
          expenses: expenseEntries,
          inventoryMeta: readInventoryMeta(),
          mode: 'authenticated',
        });
        setProfile(nextProfile);
        setProfileForm((prev) => ({
          ...prev,
          email: nextProfile.email,
          businessName: nextProfile.businessName,
          currency: nextProfile.currency,
          operatingExpenses: String(nextProfile.operatingExpenses ?? ''),
          password: password || prev.password || '',
          language: nextProfile.language,
          dateFormat: nextProfile.dateFormat,
          numberFormat: nextProfile.numberFormat,
          dataSource: nextProfile.dataSource,
          syncStatus: nextProfile.syncStatus,
          activityTracking: nextProfile.activityTracking,
          notificationPreferences: nextProfile.notificationPreferences,
          lastLoginAt: nextProfile.lastLoginAt,
        }));
        setShowOnboarding(false);
        setProfileMessage('Profile created successfully.');
        return;
      } catch (err) {
        setProfileMessage(err.message || 'Unable to save profile to Supabase.');
        setSubmitting(false);
        return;
      }
    }

    try {
      if (isSupabaseAuthenticated) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
        if (sessionError) {
          throw sessionError;
        }

        const authenticatedUser = sessionData?.user;
        if (authenticatedUser) {
          const authUpdatePayload = {};
          if (nextProfile.email && nextProfile.email !== profile?.email) {
            authUpdatePayload.email = nextProfile.email;
          }
          if (password) {
            authUpdatePayload.password = password;
          }

          if (Object.keys(authUpdatePayload).length > 0) {
            const { error: authUpdateError } = await supabase.auth.updateUser(authUpdatePayload);
            if (authUpdateError) {
              throw authUpdateError;
            }
          }

          const profileUpdatePayload = {
            id: authenticatedUser.id,
            display_name: `${nextProfile.firstName} ${nextProfile.surname}`.trim(),
            email: nextProfile.email,
            business_name: nextProfile.businessName,
            currency: nextProfile.currency,
            language: nextProfile.language,
            date_format: nextProfile.dateFormat,
            number_format: nextProfile.numberFormat,
            activity_tracking: nextProfile.activityTracking,
            notification_preferences: nextProfile.notificationPreferences,
          };

          const workspaceUpdatePayload = {
            user_id: authenticatedUser.id,
            profile: nextProfile,
            expenses: expenseEntries,
            inventory_meta: readInventoryMeta(),
          };

          const [{ error: profileUpdateError }, { error: workspaceUpdateError }] = await Promise.all([
            supabase.from('user_profiles').upsert(profileUpdatePayload, { onConflict: 'id' }),
            supabase.from('workspace_snapshots').upsert(workspaceUpdatePayload, { onConflict: 'user_id' }),
          ]);

          if (profileUpdateError || workspaceUpdateError) {
            throw profileUpdateError || workspaceUpdateError;
          }
        }
      }

      persistGuestWorkspace({
        profile: nextProfile,
        expenses: expenseEntries,
        inventoryMeta: readInventoryMeta(),
        mode: 'authenticated',
      });
      setProfile(nextProfile);
      setProfileForm((prev) => ({
        ...prev,
        email: nextProfile.email,
        businessName: nextProfile.businessName,
        currency: nextProfile.currency,
        operatingExpenses: String(nextProfile.operatingExpenses ?? ''),
        password: password || prev.password || '',
        language: nextProfile.language,
        dateFormat: nextProfile.dateFormat,
        numberFormat: nextProfile.numberFormat,
        dataSource: nextProfile.dataSource,
        syncStatus: nextProfile.syncStatus,
        activityTracking: nextProfile.activityTracking,
        notificationPreferences: nextProfile.notificationPreferences,
        lastLoginAt: nextProfile.lastLoginAt,
      }));
      setShowOnboarding(false);
      setProfileMessage('Settings updated securely.');
    } catch (err) {
      setProfileMessage(err.message || 'Unable to sync settings to Supabase.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveWorkspacePreferences = async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    const nextProfile = buildNextProfile();

    try {
      if (isSupabaseAuthenticated) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
        if (sessionError) {
          throw sessionError;
        }

        const authenticatedUser = sessionData?.user;
        if (authenticatedUser) {
          const profileUpdatePayload = {
            id: authenticatedUser.id,
            display_name: `${nextProfile.firstName} ${nextProfile.surname}`.trim(),
            email: nextProfile.email,
            business_name: nextProfile.businessName,
            currency: nextProfile.currency,
            language: nextProfile.language,
            date_format: nextProfile.dateFormat,
            number_format: nextProfile.numberFormat,
            activity_tracking: nextProfile.activityTracking,
            notification_preferences: nextProfile.notificationPreferences,
          };

          const workspaceUpdatePayload = {
            user_id: authenticatedUser.id,
            profile: nextProfile,
            expenses: expenseEntries,
            inventory_meta: readInventoryMeta(),
          };

          const [{ error: profileUpdateError }, { error: workspaceUpdateError }] = await Promise.all([
            supabase.from('user_profiles').upsert(profileUpdatePayload, { onConflict: 'id' }),
            supabase.from('workspace_snapshots').upsert(workspaceUpdatePayload, { onConflict: 'user_id' }),
          ]);

          if (profileUpdateError || workspaceUpdateError) {
            throw profileUpdateError || workspaceUpdateError;
          }
        }
      }

      persistGuestWorkspace({
        profile: nextProfile,
        expenses: expenseEntries,
        inventoryMeta: readInventoryMeta(),
        mode: isSupabaseAuthenticated ? 'authenticated' : 'guest',
      });

      setProfile(nextProfile);
      setProfileForm((prev) => ({
        ...prev,
        email: nextProfile.email,
        businessName: nextProfile.businessName,
        currency: nextProfile.currency,
        operatingExpenses: String(nextProfile.operatingExpenses ?? ''),
        password: profileForm.password || prev.password || '',
        language: nextProfile.language,
        dateFormat: nextProfile.dateFormat,
        numberFormat: nextProfile.numberFormat,
        dataSource: nextProfile.dataSource,
        syncStatus: nextProfile.syncStatus,
        activityTracking: nextProfile.activityTracking,
        notificationPreferences: nextProfile.notificationPreferences,
        lastLoginAt: nextProfile.lastLoginAt,
      }));

      setProfileMessage('Workspace preferences saved.');
    } catch (err) {
      setProfileMessage(err.message || 'Unable to save workspace preferences.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async () => {
    setAuthMode('signup');
    setShowAuthModal(true);
  };

  const handleLogin = async () => {
    setAuthMode('login');
    setShowAuthModal(true);
  };

  const openLoginFromOnboarding = () => {
    setShowOnboarding(false);
    setAuthMode('login');
    setShowAuthModal(true);
  };

  const openSignupFromLogin = () => {
    setAuthMode('signup');
  };

  const executeSignUp = async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    const email = profileForm.email.trim().toLowerCase();
    const password = profileForm.password;
    const firstName = profileForm.firstName.trim();
    const surname = profileForm.surname.trim();

    if (!firstName || !surname || !email || !password) {
      setProfileMessage('Please fill in all required fields.');
      setSubmitting(false);
      return;
    }

    try {
      const createAccountResponse = await apiFetch(`${apiBaseUrl}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          firstName,
          surname,
          businessName: profileForm.businessName.trim(),
          currency: profileForm.currency || 'USD',
          language: profileForm.language || 'en',
          dateFormat: profileForm.dateFormat || 'MM/DD/YYYY',
          numberFormat: profileForm.numberFormat || 'commas',
          activityTracking: profileForm.activityTracking !== false,
          notificationPreferences: profileForm.notificationPreferences || {},
          expenses: expenseEntries,
          inventoryMeta: readInventoryMeta(),
        }),
      });

      const createAccountResult = await createAccountResponse.json();
      if (!createAccountResponse.ok || !createAccountResult?.success) {
        throw new Error(createAccountResult?.error || 'Unable to create your account.');
      }

      const signInResult = await supabase.auth.signInWithPassword({ email, password });
      const activeSession = signInResult.data?.session ?? null;
      const activeSessionUser = activeSession?.user ?? null;
      const nextProfile = {
        firstName,
        surname,
        email,
        businessName: profileForm.businessName.trim(),
        currency: profileForm.currency || 'USD',
        operatingExpenses: Number(expenseTotal || profileForm.operatingExpenses || 0),
        password,
        language: profileForm.language || 'en',
        dateFormat: profileForm.dateFormat || 'MM/DD/YYYY',
        numberFormat: profileForm.numberFormat || 'commas',
        dataSource: 'Supabase',
        syncStatus: 'Connected',
        activityTracking: profileForm.activityTracking !== false,
        notificationPreferences: {
          email: profileForm.notificationPreferences?.email ?? true,
          push: profileForm.notificationPreferences?.push ?? true,
          lowStock: profileForm.notificationPreferences?.lowStock ?? true,
          marginDrop: profileForm.notificationPreferences?.marginDrop ?? true,
          unusualReturns: profileForm.notificationPreferences?.unusualReturns ?? true,
        },
        lastLoginAt: new Date().toISOString(),
      };

      if (!activeSessionUser) {
        throw new Error('Your Supabase session is not active yet.');
      }

      setIsSupabaseAuthenticated(true);
      persistGuestWorkspace({ profile: nextProfile, expenses: expenseEntries, inventoryMeta: readInventoryMeta(), mode: 'authenticated' });
      setProfile(nextProfile);
      setProfileForm((prev) => ({
        ...prev,
        email: nextProfile.email,
        businessName: nextProfile.businessName,
        currency: nextProfile.currency,
        operatingExpenses: String(nextProfile.operatingExpenses ?? ''),
        password: password || prev.password || '',
        language: nextProfile.language,
        dateFormat: nextProfile.dateFormat,
        numberFormat: nextProfile.numberFormat,
        dataSource: nextProfile.dataSource,
        syncStatus: nextProfile.syncStatus,
        activityTracking: nextProfile.activityTracking,
        notificationPreferences: nextProfile.notificationPreferences,
        lastLoginAt: nextProfile.lastLoginAt,
      }));
      setProfileMessage('Account created.');
      setShowAuthModal(false);
    } catch (err) {
      setProfileMessage(err.message || 'Unable to create your account.');
    } finally {
      setSubmitting(false);
    }
  };

  const executeLogin = async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    const email = profileForm.email.trim().toLowerCase();
    const password = profileForm.password;

    if (!email || !password) {
      setProfileMessage('Please enter your email and password to log in.');
      setSubmitting(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw error;
      }

      const user = data?.user;
      if (user) {
        setIsSupabaseAuthenticated(true);
        clearGuestWorkspace();
        const [{ data: profileData }, { data: workspaceData }] = await Promise.all([
          supabase.from('user_profiles').select('*').eq('id', user.id).single(),
          supabase.from('workspace_snapshots').select('*').eq('user_id', user.id).maybeSingle(),
        ]);

        const syncedProfile = profileData ? {
          firstName: profileData.display_name?.split(' ')[0] || user.user_metadata?.firstName || 'User',
          surname: profileData.display_name?.split(' ').slice(1).join(' ') || user.user_metadata?.surname || '',
          email: profileData.email || user.email || email,
          businessName: profileData.business_name || user.user_metadata?.businessName || '',
          currency: profileData.currency || 'USD',
          language: profileData.language || 'en',
          dateFormat: profileData.date_format || 'MM/DD/YYYY',
          numberFormat: profileData.number_format || 'commas',
          dataSource: 'Supabase',
          syncStatus: 'Connected',
          activityTracking: profileData.activity_tracking !== false,
          notificationPreferences: normalizeNotificationPreferences(profileData.notification_preferences),
          lastLoginAt: new Date().toISOString(),
        } : {
          firstName: user.user_metadata?.firstName || 'User',
          surname: user.user_metadata?.surname || '',
          email: user.email || email,
          businessName: user.user_metadata?.businessName || '',
          currency: user.user_metadata?.currency || 'USD',
          dataSource: 'Supabase',
          syncStatus: 'Connected',
          activityTracking: true,
          notificationPreferences: normalizeNotificationPreferences(user.user_metadata?.notificationPreferences),
          lastLoginAt: new Date().toISOString(),
        };

        if (workspaceData?.profile) {
          const mergedProfile = mergeGuestWorkspaceIntoProfile(syncedProfile, workspaceData.profile);
          setProfile(mergedProfile);
          setProfileForm((prev) => ({
            ...prev,
            firstName: mergedProfile.firstName || '',
            surname: mergedProfile.surname || '',
            email: mergedProfile.email || '',
            businessName: mergedProfile.businessName || '',
            currency: mergedProfile.currency || 'USD',
            language: mergedProfile.language || 'en',
            dateFormat: mergedProfile.dateFormat || 'MM/DD/YYYY',
            numberFormat: mergedProfile.numberFormat || 'commas',
            dataSource: 'Supabase',
            syncStatus: 'Connected',
            activityTracking: mergedProfile.activityTracking !== false,
            notificationPreferences: mergedProfile.notificationPreferences || prev.notificationPreferences,
            lastLoginAt: mergedProfile.lastLoginAt || new Date().toISOString(),
          }));
          persistGuestWorkspace({ profile: mergedProfile, expenses: Array.isArray(workspaceData.expenses) ? workspaceData.expenses : expenseEntries, inventoryMeta: workspaceData.inventory_meta || readInventoryMeta(), mode: 'authenticated' });
          setExpenseEntries(Array.isArray(workspaceData.expenses) ? workspaceData.expenses : expenseEntries);
          showToast('Workspace synced successfully.', 'success');
          showBrowserNotification(
            'Workspace synced',
            `Welcome back${mergedProfile?.firstName ? `, ${mergedProfile.firstName}` : ''}! Your workspace is now synced and ready.`
          );
        } else {
          persistGuestWorkspace({ profile: syncedProfile, expenses: expenseEntries, inventoryMeta: readInventoryMeta(), mode: 'authenticated' });
          setProfile(syncedProfile);
          setProfileForm((prev) => ({ ...prev, firstName: syncedProfile.firstName || '', surname: syncedProfile.surname || '', email: syncedProfile.email || '', businessName: syncedProfile.businessName || '', currency: syncedProfile.currency || 'USD', language: syncedProfile.language || 'en', dateFormat: syncedProfile.dateFormat || 'MM/DD/YYYY', numberFormat: syncedProfile.numberFormat || 'commas', dataSource: 'Supabase', syncStatus: 'Connected', activityTracking: syncedProfile.activityTracking !== false, notificationPreferences: syncedProfile.notificationPreferences || prev.notificationPreferences, lastLoginAt: syncedProfile.lastLoginAt || new Date().toISOString() }));
          showToast('Workspace synced successfully.', 'success');
          showBrowserNotification(
            'Workspace synced',
            `Welcome back${syncedProfile?.firstName ? `, ${syncedProfile.firstName}` : ''}! Your workspace is now synced and ready.`
          );
        }
      }

      setProfileMessage('');
      setShowOnboarding(false);
      setShowAuthModal(false);
    } catch (err) {
      setProfileMessage(err.message || 'Unable to log in.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore sign-out failures and still clear local session state.
    } finally {
      clearGuestWorkspace();
      setIsSupabaseAuthenticated(false);
      setProfile(null);
      setProfileForm(defaultProfileForm);
      setExpenseEntries([]);
      setDashboardData(null);
      setAvailableProducts([]);
      setActionMessage('');
      setSecurityMessage('');
      setProfileMessage('');
      setActiveActionMenuId(null);
      setEditingExpenseId(null);
      setEditingInventoryProduct(null);
      setRestockingInventoryProduct(null);
      setInventoryEditForm({ name: '', costPrice: '', quantity: '' });
      setExpenseForm({ category: '', amount: '', date: '' });
      setRestockForm({ quantity: '', costPerUnit: '' });
      setFormState({ productId: '', quantity: '', price: '' });
      setSelectedAction('sale');
      setActiveView('dashboard');
      setModalOpen(false);
      setShowAuthModal(false);
      setShowOnboarding(true);
      setSubmitting(false);
    }
  };

  const handleResetWorkspace = async () => {
    if (!window.confirm('Reset local workspace data and clear recent activity cache?')) {
      return;
    }

    try {
      const currentUserId = supabase.auth.getUser ? (await supabase.auth.getUser()).data?.user?.id : null;
      if (!currentUserId) {
        throw new Error('Unable to reset workspace: user is not signed in.');
      }

      const response = await apiFetch(`${apiBaseUrl}/workspace/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId }),
      });

      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || 'Some workspace data could not be cleared from the backend.');
      }

      clearWorkspaceData();
      setExpenseEntries([]);
      setDashboardData(null);
      setAvailableProducts([]);
      setActionMessage('Workspace data was cleared.');
      setProfileMessage('Workspace reset complete.');
      setSecurityMessage('Workspace reset complete.');
    } catch (err) {
      setSecurityMessage(err.message || 'Unable to clear workspace data from the backend.');
    }
  };

  const handleExportWorkspace = () => {
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      profile: profile || profileForm,
      expenseEntries,
      inventoryMeta: window.localStorage.getItem(INVENTORY_META_STORAGE_KEY) || '{}',
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'ledgr-workspace-export.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(objectUrl);
    setSecurityMessage('Workspace export started.');
  };

  const activityProductOptions = useMemo(() => {
    const names = new Set();
    transactions.forEach((entry) => {
      if (entry.productName) {
        names.add(entry.productName);
      }
    });
    availableProducts.forEach((product) => {
      const productName = product?.name ?? product?.product_name ?? product?.productName;
      if (productName) {
        names.add(productName);
      }
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [transactions, availableProducts]);

  const inventoryRows = useMemo(() => {
    const inventoryMeta = Object.fromEntries((availableProducts || []).map((product) => {
      const productKey = String(product?.id ?? product?.name ?? '');
      return [productKey, {
        sku: product?.sku || product?.code || `SKU-${productKey || '000'}`,
        category: product?.category || 'General',
        reorderLevel: Number(product?.reorder_level ?? product?.reorderLevel ?? 5),
      }];
    }));

    return buildInventoryRows(availableProducts, inventoryMeta).filter((row) => {
      const matchesProduct = inventoryProductFilter === 'all' || row.name === inventoryProductFilter;
      const matchesStatus = inventoryStatusFilter === 'all' || row.status.label === inventoryStatusFilter;
      return matchesProduct && matchesStatus;
    });
  }, [availableProducts, inventoryProductFilter, inventoryStatusFilter]);

  const inventoryTotalPages = Math.max(1, Math.ceil(inventoryRows.length / ITEMS_PER_PAGE));
  const inventoryStartIndex = (inventoryPage - 1) * ITEMS_PER_PAGE;
  const paginatedInventoryRows = useMemo(() => inventoryRows.slice(inventoryStartIndex, inventoryStartIndex + ITEMS_PER_PAGE), [inventoryRows, inventoryPage, inventoryStartIndex]);

  useEffect(() => {
    setInventoryPage(1);
  }, [inventoryProductFilter, inventoryStatusFilter, availableProducts]);

  const inventoryProductOptions = useMemo(() => {
    const products = new Set((availableProducts || []).map((product) => product?.name).filter(Boolean));
    return Array.from(products).sort((a, b) => a.localeCompare(b));
  }, [availableProducts]);

  const sortedTransactions = useMemo(() => {
    const items = [...transactions].filter((entry) => {
      const matchesType = activityFilter === 'all' || entry.type === activityFilter;
      const matchesProduct = activityProductFilter === 'all' || entry.productName === activityProductFilter;
      const matchesDate = matchesDateRange(entry.date, dateFilter, customDateStart, customDateEnd);
      return matchesType && matchesProduct && matchesDate;
    });

    const getSortTime = (entry) => {
      if (entry.timestamp) {
        return new Date(entry.timestamp).getTime();
      }
      return entry.date ? new Date(entry.date).getTime() : 0;
    };

    switch (sortOrder) {
      case 'date-asc':
        items.sort((a, b) => getSortTime(a) - getSortTime(b));
        break;
      case 'type':
        items.sort((a, b) => a.type.localeCompare(b.type));
        break;
      case 'date-desc':
      default:
        items.sort((a, b) => getSortTime(b) - getSortTime(a));
        break;
    }

    return items;
  }, [activityFilter, activityProductFilter, dateFilter, customDateStart, customDateEnd, sortOrder, transactions]);

  const pnlTotalPages = Math.max(1, Math.ceil(sortedTransactions.length / ITEMS_PER_PAGE));
  const pnlStartIndex = (pnlPage - 1) * ITEMS_PER_PAGE;
  const paginatedTransactions = useMemo(() => sortedTransactions.slice(pnlStartIndex, pnlStartIndex + ITEMS_PER_PAGE), [sortedTransactions, pnlPage, pnlStartIndex]);

  useEffect(() => {
    setPnlPage(1);
  }, [sortedTransactions]);

  const inventoryCount = dashboardData?.inventoryCount ?? 0;
  const stockUnits = dashboardData?.stockUnits ?? 0;
  const revenue = dashboardData?.revenue ?? 0;
  const cogs = dashboardData?.cogs ?? 0;
  const productCostBreakdown = dashboardData?.productCostBreakdown ?? [];
  const profit = dashboardData?.profit ?? 0;
  const grossMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const expenseSummary = useMemo(() => {
    const byCategory = expenseEntries.reduce((acc, entry) => {
      const category = entry.category?.trim() || 'Nil';
      acc.set(category, (acc.get(category) || 0) + Number(entry.amount || 0));
      return acc;
    }, new Map());

    const byMonth = expenseEntries.reduce((acc, entry) => {
      const month = entry.date ? entry.date.slice(0, 7) : 'Unknown';
      acc.set(month, (acc.get(month) || 0) + Number(entry.amount || 0));
      return acc;
    }, new Map());

    return {
      total: Number(expenseTotal.toFixed(2)),
      byCategory: Array.from(byCategory.entries()).map(([category, total]) => ({ category, total: Number(total.toFixed(2)) })).sort((a, b) => b.total - a.total),
      byMonth: Array.from(byMonth.entries()).map(([month, total]) => ({ month, total: Number(total.toFixed(2)) })).sort((a, b) => a.month.localeCompare(b.month)),
    };
  }, [expenseEntries, expenseTotal]);
  const expenseTrend = useMemo(() => {
    const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      return date.toISOString().slice(0, 10);
    });

    return lastSevenDays.map((date) => ({
      day: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
      expenses: expenseEntries.filter((entry) => entry.date === date).reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
    }));
  }, [expenseEntries]);
  const groupedExpenses = useMemo(() => {
    // Normalize category/name and merge near-duplicates (typos, case differences)
    const normalize = (s = '') => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

    // simple Levenshtein distance
    const lev = (a = '', b = '') => {
      const m = a.length, n = b.length;
      if (m === 0) return n;
      if (n === 0) return m;
      const v0 = new Array(n + 1).fill(0);
      const v1 = new Array(n + 1).fill(0);
      for (let j = 0; j <= n; j++) v0[j] = j;
      for (let i = 1; i <= m; i++) {
        v1[0] = i;
        for (let j = 1; j <= n; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          v1[j] = Math.min(v1[j - 1] + 1, v0[j] + 1, v0[j - 1] + cost);
        }
        for (let j = 0; j <= n; j++) v0[j] = v1[j];
      }
      return v0[n];
    };

    const groups = [];
    for (const e of (expenseEntries || [])) {
      const raw = (e.category || 'Operating Expenses').trim();
      const norm = normalize(raw);

      // try find existing group with exact normalized match or near match (distance <= 1)
      let found = null;
      for (const g of groups) {
        const gnorm = normalize(g.name);
        if (gnorm === norm || lev(gnorm, norm) <= 1) {
          found = g;
          break;
        }
      }

      if (!found) {
        found = { name: raw, total: 0, items: [] };
        groups.push(found);
      }

      found.total += Number(e.amount || 0);
      found.items.push(e);
    }

    return groups.map((g) => ({ ...g, total: Number((g.total || 0).toFixed(2)) }));
  }, [expenseEntries]);
  const viewCopy = {
    dashboard: {
      title: 'Run your inventory and profit picture from one calm workspace.',
      description: 'Ledgr brings your sales, stock movement, and profitability into one clear view for faster decisions.',
    },
    inventory: {
      title: 'Inventory at a glance.',
      description: 'Track on-hand stock and keep your supply picture clear and current.',
    },
    pnl: {
      title: 'P&L performance, distilled.',
      description: 'Review revenue, costs, and profit in one calm view.',
    },
    expenses: {
      title: 'Operating expenses, categorized.',
      description: 'Track where money is leaving the business and see the trend lines before costs spiral.',
    },
    settings: {
      title: 'Workspace settings and sync status.',
      description: 'Manage preferences, connectivity, and the current dashboard setup.',
    },
  };
  const activeViewMeta = viewCopy[activeView] ?? viewCopy.dashboard;

  const renderMainContent = () => {
    if (activeView === 'inventory') {
      return (
        <div className="space-y-4 sm:space-y-6">
          <section className={`rounded-2xl border p-4 shadow-xl sm:p-6 ${isDarkMode ? 'border-slate-800 bg-slate-900/80 shadow-slate-950/30' : 'border-slate-200 bg-white/80 shadow-slate-200/70'}`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Inventory overview</p>
                <h2 className={`mt-2 text-xl font-semibold sm:text-2xl ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Stock health, value, and margin from one place</h2>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className={`rounded-2xl border p-4 ${isDarkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'}`}>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Active SKUs</p>
                  <p className={`mt-2 text-2xl font-semibold sm:text-3xl ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{inventoryCount}</p>
                </div>
                <div className={`rounded-2xl border p-4 ${isDarkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'}`}>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Units on hand</p>
                  <p className={`mt-2 text-2xl font-semibold sm:text-3xl ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{stockUnits}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingInventoryProduct('new');
                    setShowInventoryModal(true);
                    setInventoryEditForm({ name: '', costPrice: '', quantity: '' });
                  }}
                  className="rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  Add inventory
                </button>
              </div>
            </div>
          </section>

<div className={`${hasAdSlotVisible ? '' : 'hidden'} mb-4 rounded-3xl border p-4 ${isDarkMode ? 'border-slate-700 bg-slate-950/70 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-900'}`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>Sponsored</span>
            </div>
            <div id="container-61a2c10d537d409af3dbb4930b7469ae" className="mx-auto max-w-full rounded-3xl" />
          </div>

          <section className={`rounded-2xl border p-4 shadow-xl sm:p-6 ${isDarkMode ? 'border-slate-800 bg-slate-900/80 shadow-slate-950/30' : 'border-slate-200 bg-white/80 shadow-slate-200/70'}`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Stock movement</p>
              </div>
              <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
                <select
                  value={inventoryProductFilter}
                  onChange={(event) => setInventoryProductFilter(event.target.value)}
                  className={`min-w-[8rem] shrink-0 rounded-2xl border px-3 py-2.5 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                >
                  <option value="all">All products</option>
                  {inventoryProductOptions.map((productName) => (
                    <option key={productName} value={productName}>{productName}</option>
                  ))}
                </select>
                <select
                  value={inventoryStatusFilter}
                  onChange={(event) => setInventoryStatusFilter(event.target.value)}
                  className={`min-w-[8rem] shrink-0 rounded-2xl border px-3 py-2.5 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                >
                  <option value="all">All stock status</option>
                  <option value="Healthy">Healthy</option>
                  <option value="Low stock">Low stock</option>
                  <option value="Out of stock">Out of stock</option>
                </select>
              </div>
            </div>

            {restockingInventoryProduct ? (
              <div className={`mt-4 rounded-2xl border p-4 ${isDarkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Restock {restockingInventoryProduct.name}</p>
                    <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Increase stock and record the new unit cost.</p>
                  </div>
                  <button type="button" onClick={() => setRestockingInventoryProduct(null)} className={`rounded-xl px-3 py-2 text-sm ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}>Cancel</button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Quantity to add</span>
                    <input type="number" min="1" value={restockForm.quantity} onChange={(event) => setRestockForm((prev) => ({ ...prev, quantity: event.target.value }))} className={`w-full rounded-2xl border px-3 py-2.5 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-700'}`} placeholder="Quantity" />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Cost per unit</span>
                    <input type="number" min="0" step="0.01" value={restockForm.costPerUnit} onChange={(event) => setRestockForm((prev) => ({ ...prev, costPerUnit: event.target.value }))} className={`w-full rounded-2xl border px-3 py-2.5 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-700'}`} placeholder="Cost per unit" />
                  </label>
                </div>
                <div className="mt-3 flex justify-end">
                  <button type="button" onClick={handleSaveInventoryRestock} disabled={submitting} className="rounded-2xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-500 disabled:hover:bg-indigo-600">Save restock</button>
                </div>
              </div>
            ) : null}

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
                <thead>
                  <tr className={`${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    <th className="px-3 py-2 font-semibold">Product</th>
                    <th className="px-3 py-2 font-semibold">Cost Price</th>
                    <th className="px-3 py-2 font-semibold">Quantity</th>
                    <th className="px-3 py-2 font-semibold">Total Value</th>
                    <th className="px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryRows.length ? paginatedInventoryRows.map((row, index) => {
                    const globalIndex = inventoryStartIndex + index;
                    const statusClass = row.status.tone === 'danger' ? 'bg-rose-500/15 text-rose-400' : row.status.tone === 'warning' ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400';
                    const inventoryMenuKey = `inventory-${row.key || row.name}`;

                    return (
                      <tr key={row.key} className={`${globalIndex % 2 === 0 ? (isDarkMode ? 'bg-slate-950/50' : 'bg-slate-50') : (isDarkMode ? 'bg-slate-900/80' : 'bg-white')}`}>
                        <td className="px-3 py-3">
                          <div className="flex flex-col">
                            <span className={`font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>{row.name}</span>
                            <span className={`mt-1 text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>{row.status.label}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">{formatCurrency(row.costPrice)}</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.quantity <= 0 ? 'bg-rose-500/15 text-rose-400' : row.quantity <= row.reorderLevel ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                            {row.quantity}
                          </span>
                        </td>
                        <td className="px-3 py-3">{formatCurrency(row.totalValue)}</td>
                        <td className="px-3 py-3">
                          <div className="relative inline-flex" data-action-menu-root>
                            <button
                              type="button"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setActiveActionMenuId((current) => current === inventoryMenuKey ? null : inventoryMenuKey);
                              }}
                              className={`rounded-full border p-2 text-xs font-medium ${isDarkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-700 hover:bg-slate-100'}`}
                              aria-label={`More actions for ${row.name}`}
                            >
                              <span className="flex gap-0.5">
                                <span className="h-1 w-1 rounded-full bg-current" />
                                <span className="h-1 w-1 rounded-full bg-current" />
                                <span className="h-1 w-1 rounded-full bg-current" />
                              </span>
                            </button>
                            {activeActionMenuId === inventoryMenuKey ? (
                              <div
                                className={`absolute right-0 z-10 mt-2 w-36 rounded-2xl border p-2 shadow-xl ${isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}
                                onMouseDown={(event) => event.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleRestockInventoryProduct(row);
                                  }}
                                  className={`block w-full rounded-xl px-3 py-2 text-left text-sm ${isDarkMode ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'}`}
                                >
                                  Restock
                                </button>
                                <button
                                  type="button"
                                  onMouseDown={async (event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    if (!confirm(`Are you sure you want to delete "${row.name}"?`)) return;
                                    try {
                                      const response = await apiFetch(`${apiBaseUrl}/products/${row.id}`, { method: 'DELETE' });
                                      const json = await response.json();
                                      if (!response.ok || !json.success) throw new Error(json.error || 'Unable to delete product');
                                      await loadProducts();
                                    } catch (err) {
                                      setError(err.message);
                                    }
                                    setActiveActionMenuId(null);
                                  }}
                                  className={`mt-1 block w-full rounded-xl px-3 py-2 text-left text-sm ${isDarkMode ? 'text-rose-300 hover:bg-slate-800' : 'text-rose-700 hover:bg-slate-100'}`}
                                >
                                  Delete
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan="10" className={`px-3 py-6 text-center text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        No inventory matches your current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-2 flex items-center justify-between text-sm">
              <div className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>
                Showing {inventoryRows.length ? inventoryStartIndex + 1 : 0}–{Math.min(inventoryStartIndex + ITEMS_PER_PAGE, inventoryRows.length)} of {inventoryRows.length}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setInventoryPage((p) => Math.max(1, p - 1))} disabled={inventoryPage <= 1} className={`rounded-xl px-3 py-1 text-sm ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}>
                  Prev
                </button>
                <div className={isDarkMode ? 'text-slate-300' : 'text-slate-600'}>Page {inventoryPage} / {inventoryTotalPages}</div>
                <button type="button" onClick={() => setInventoryPage((p) => Math.min(inventoryTotalPages, p + 1))} disabled={inventoryPage >= inventoryTotalPages} className={`rounded-xl px-3 py-1 text-sm ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}>
                  Next
                </button>
              </div>
            </div>
          </section>
        </div>
      );
    }

    if (activeView === 'pnl') {
      return (
        <div className="space-y-4 sm:space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              { label: 'Revenue', value: formatCurrency(revenue), rawValue: Number(revenue), alwaysPositive: true },
              { label: 'COGS', value: formatCurrency(cogs), rawValue: Number(cogs), alwaysNegative: true },
              { label: 'Profit', value: formatCurrency(profit), rawValue: Number(profit) },
            ].map((item) => {
              const isNegative = item.alwaysNegative || item.rawValue < 0;
              const valueClasses = isNegative ? 'text-rose-400' : 'text-emerald-400';

              return (
                <article key={item.label} className={`rounded-2xl border p-5 shadow-lg ${isDarkMode ? 'border-slate-800 bg-slate-900/80 shadow-slate-950/30' : 'border-slate-200 bg-white/80 shadow-slate-200/70'}`}>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{item.label}</p>
                  <p className={`mt-3 text-2xl font-semibold ${valueClasses}`}>{item.value}</p>
                  {item.label === 'COGS' && productCostBreakdown.length > 0 && (
                    <div className={`mt-3 space-y-2 border-t pt-3 text-sm ${isDarkMode ? 'border-slate-800 text-slate-300' : 'border-slate-200 text-slate-700'}`}>
                      {productCostBreakdown.map((product) => (
                        <div key={product.id} className="flex items-center justify-between gap-3">
                          <span>{product.name}</span>
                          <span className="font-medium">{formatCurrency(product.costPerUnit)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </section>

          <section className={`rounded-2xl border p-4 shadow-xl sm:p-6 ${isDarkMode ? 'border-slate-800 bg-slate-900/80 shadow-slate-950/30' : 'border-slate-200 bg-white/80 shadow-slate-200/70'}`}>
            <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Margin snapshot</p>
            <p className={`mt-2 text-base leading-7 sm:text-lg ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Gross margin is {grossMargin.toFixed(1)}% based on the current revenue and profit totals.
            </p>
          </section>

          <div className={`${hasAdSlotVisible ? '' : 'hidden'} mb-4 rounded-3xl border p-4 ${isDarkMode ? 'border-slate-700 bg-slate-950/70 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-900'}`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>Sponsored</span>
            </div>
            <div id="container-61a2c10d537d409af3dbb4930b7469ae" className="mx-auto max-w-full rounded-3xl" />
          </div>
        </div>
      );
    }

    if (activeView === 'expenses') {
      return (
        <div className="space-y-4 sm:space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <article className={`rounded-2xl border p-5 shadow-lg ${isDarkMode ? 'border-slate-800 bg-slate-900/80 shadow-slate-950/30' : 'border-slate-200 bg-white/80 shadow-slate-200/70'}`}>
              <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Total expenses</p>
              <p className={`mt-3 text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{formatCurrency(expenseSummary.total)}</p>
            </article>
            <article className={`rounded-2xl border p-5 shadow-lg ${isDarkMode ? 'border-slate-800 bg-slate-900/80 shadow-slate-950/30' : 'border-slate-200 bg-white/80 shadow-slate-200/70'}`}>
              <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Largest category</p>
              <p className={`mt-3 text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {expenseSummary.byCategory?.[0]?.category || 'Nil'}
              </p>
            </article>
            <article className={`rounded-2xl border p-5 shadow-lg ${isDarkMode ? 'border-slate-800 bg-slate-900/80 shadow-slate-950/30' : 'border-slate-200 bg-white/80 shadow-slate-200/70'}`}>
              <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Profit margin</p>
              <p className={`mt-3 text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{Number(dashboardData?.profitMargin ?? 0).toFixed(1)}%</p>
            </article>
          </section>

          <section className={`rounded-2xl border p-4 shadow-xl sm:p-6 ${isDarkMode ? 'border-slate-800 bg-slate-900/80 shadow-slate-950/30' : 'border-slate-200 bg-white/80 shadow-slate-200/70'}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Expense trend</p>
                <p className={`mt-1 text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Monthly costs and category movement</p>
              </div>
            </div>
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={expenseTrend}>
                  <defs>
                    <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#334155' : '#cbd5e1'} strokeOpacity={0.35} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 12 }} />
                  <Tooltip
                    cursor={{ stroke: '#f59e0b', strokeWidth: 1 }}
                    contentStyle={{
                      backgroundColor: isDarkMode ? '#020617' : '#ffffff',
                      border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
                      borderRadius: '12px',
                      color: isDarkMode ? '#f8fafc' : '#0f172a',
                    }}
                  />
                  <Area type="monotone" dataKey="expenses" stroke="#f59e0b" strokeWidth={2.5} fill="url(#expenseGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className={`rounded-2xl border p-4 shadow-xl sm:p-6 ${isDarkMode ? 'border-slate-800 bg-slate-900/80 shadow-slate-950/30' : 'border-slate-200 bg-white/80 shadow-slate-200/70'}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Expense entries</p>
                <p className={`mt-1 text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Edit your recurring costs</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingExpenseId('new');
                  setExpenseForm({ category: '', amount: '', date: new Date().toISOString().slice(0, 10) });
                }}
                className="rounded-2xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                Add expenses
              </button>
            </div>

            {editingExpenseId ? (
              <div className={`mt-4 rounded-2xl border p-4 ${isDarkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'}`}>
                <div className="grid gap-3 md:grid-cols-3">
                  <input
                    value={expenseForm.category}
                    onChange={(event) => setExpenseForm((prev) => ({ ...prev, category: event.target.value }))}
                    className={`rounded-xl border px-3 py-2 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-700'}`}
                    placeholder="Category"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={expenseForm.amount}
                    onChange={(event) => setExpenseForm((prev) => ({ ...prev, amount: event.target.value }))}
                    className={`rounded-xl border px-3 py-2 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-700'}`}
                    placeholder="Amount"
                  />
                  <input
                    type="date"
                    value={expenseForm.date}
                    onChange={(event) => setExpenseForm((prev) => ({ ...prev, date: event.target.value }))}
                    className={`rounded-xl border px-3 py-2 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-700'}`}
                  />
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingExpenseId(null);
                      setExpenseForm({ category: '', amount: '', date: new Date().toISOString().slice(0, 10) });
                    }}
                    className={`rounded-2xl px-3 py-2 text-sm ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!expenseForm.category.trim() || !expenseForm.amount) return;

                      try {
                        const payload = {
                          category: expenseForm.category.trim(),
                          amount: Number(expenseForm.amount || 0),
                          date: expenseForm.date || new Date().toISOString().slice(0, 10),
                        };

                        const method = editingExpenseId === 'new' ? 'POST' : 'PUT';
                        const url = editingExpenseId === 'new' ? `${apiBaseUrl}/expenses` : `${apiBaseUrl}/expenses/${editingExpenseId}`;

                        const response = await apiFetch(url, {
                          method,
                          body: JSON.stringify(payload),
                        });
                        const json = await response.json();

                        if (!response.ok || !json.success) {
                          throw new Error(json.error || 'Unable to save expense');
                        }
                      } catch {
                        // Ignore save failures for now.
                      }

                      setEditingExpenseId(null);
                      setExpenseForm({ category: '', amount: '', date: new Date().toISOString().slice(0, 10) });
                      await refreshDashboard();
                    }}
                    className="rounded-2xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-4">
              {groupedExpenses.length ? (
                <div className={`rounded-2xl border p-4 ${isDarkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                    {groupedExpenses.map((g) => (
                      <div key={g.name} className={`rounded-2xl px-4 py-3 ${isDarkMode ? 'bg-slate-900 text-amber-300' : 'bg-white text-amber-700'} shadow-sm flex flex-col gap-2 break-words sm:flex-row sm:items-center sm:justify-between`}>
                        <span className={`font-medium break-words ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{g.name}</span>
                        <span className={`font-semibold ${isDarkMode ? 'text-amber-300' : 'text-amber-700'}`}>{formatCurrency(g.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className={`rounded-2xl border p-4 md:col-span-2 ${isDarkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'}`}>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>No expense categories have been logged yet. Add your first expense entry to see category and trend data here.</p>
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2">
              {expenseEntries.length ? expenseEntries.map((entry) => (
                <div key={entry.id} className={`flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between ${isDarkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'}`}>
                  <div>
                    <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{entry.category}</p>
                    <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{entry.date} • {formatCurrency(entry.amount)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingExpenseId(entry.id);
                        setExpenseForm({ category: entry.category, amount: String(entry.amount), date: entry.date });
                      }}
                      className={`rounded-2xl border px-3 py-2 text-sm font-medium ${isDarkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-700 hover:bg-slate-100'}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const response = await apiFetch(`${apiBaseUrl}/expenses/${entry.id}`, { method: 'DELETE' });
                          const json = await response.json();

                          if (!response.ok || !json.success) {
                            throw new Error(json.error || 'Unable to delete expense');
                          }
                        } catch {
                          // Ignore delete failures for now.
                        }

                        await refreshDashboard();
                      }}
                      className={`rounded-2xl border px-3 py-2 text-sm font-medium ${isDarkMode ? 'border-slate-700 text-rose-300 hover:bg-slate-800' : 'border-slate-200 text-rose-700 hover:bg-slate-100'}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )) : null}
            </div>
          </section>

          <section className={`${hasAdSlotVisible ? '' : 'hidden'} rounded-3xl border p-4 ${isDarkMode ? 'border-slate-700 bg-slate-950/70 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-900'}`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>Sponsored</span>
            </div>
            <div id="container-61a2c10d537d409af3dbb4930b7469ae" className="mx-auto max-w-full rounded-3xl" />
          </section>
        </div>
      );
    }

    if (activeView === 'settings') {
      const settingsTabs = [
        { id: 'profile', label: t('profileTab'), icon: UserRound },
        { id: 'workspace', label: t('workspaceTab'), icon: SlidersHorizontal },
        { id: 'security', label: t('securityTab'), icon: ShieldCheck },
      ];

      const selectedTab = settingsTabs.find((tab) => tab.id === settingsTab) ?? settingsTabs[0];
      const ActiveTabIcon = selectedTab.icon;
      const lastLoginLabel = profile?.lastLoginAt ? formatDisplayDate(profile.lastLoginAt) : 'No sign-in recorded yet';
      const storageUsageLabel = formatStorageUsage(securitySnapshot.storageUsageBytes);
      const syncLogs = [
        { title: 'Cloud sync', detail: `${profileForm.syncStatus || 'Connected'} • ${profile?.lastLoginAt ? 'Last synced recently' : 'Awaiting first sync'}`, accent: 'healthy' },
        { title: 'Activity tracking', detail: profileForm.activityTracking ? `${transactions.length} activity events captured` : 'Activity tracking is paused', accent: 'neutral' },
      ];
      const deviceList = [
        { name: 'Current device', location: securitySnapshot.browserLabel || 'Browser', seen: securitySnapshot.lastUpdatedAt ? formatDisplayDate(securitySnapshot.lastUpdatedAt) : 'Just now', status: securitySnapshot.isOnline ? 'Active' : 'Offline' },
        { name: 'Workspace session', location: typeof window !== 'undefined' ? window.location.hostname : 'Local workspace', seen: profile?.lastLoginAt ? formatDisplayDate(profile.lastLoginAt) : 'Awaiting first sign-in', status: profile?.lastLoginAt ? 'Secure' : 'Review' },
      ];
      const sessionHistory = [
        { title: 'Last sign-in', detail: profile?.lastLoginAt ? `${formatDisplayDate(profile.lastLoginAt)} • ${profileForm.syncStatus || 'Connected'}` : 'No sign-in recorded yet' },
        { title: 'Last review', detail: securitySnapshot.lastUpdatedAt ? `Reviewed ${formatDisplayDate(securitySnapshot.lastUpdatedAt)}` : 'No security review yet' },
      ];

      return (
        <div className="space-y-4 sm:space-y-6">
          <section className={`rounded-3xl border p-4 shadow-xl sm:p-6 ${isDarkMode ? 'border-slate-800 bg-slate-900/80 shadow-slate-950/30' : 'border-slate-200 bg-white/80 shadow-slate-200/70'}`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="w-full">
                <div className="flex items-center gap-2">
                </div>
              </div>
            </div>

            <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
              {settingsTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = selectedTab.id === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSettingsTab(tab.id)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition ${isActive ? (isDarkMode ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300' : 'border-indigo-500/40 bg-indigo-50 text-indigo-700') : (isDarkMode ? 'border-slate-700 bg-slate-950/60 text-slate-300 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100')}`}
                  >
                    <Icon size={15} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
              <div className={`rounded-3xl border p-4 sm:p-5 ${isDarkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-slate-50'}`}>
                {settingsTab === 'profile' ? (
                  <form className="space-y-4" onSubmit={handleProfileSubmit}>
                    <div className="flex items-center gap-2">
                      <UserRound size={16} className={isDarkMode ? 'text-indigo-300' : 'text-indigo-700'} />
                      <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{t('profilePreferences')}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-2 text-sm">
                        <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>First name</span>
                        <input
                          value={profileForm.firstName}
                          onChange={(event) => setProfileForm((prev) => ({ ...prev, firstName: event.target.value }))}
                          className={`w-full rounded-2xl border px-3 py-2.5 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-700'}`}
                          placeholder="First name"
                        />
                      </label>
                      <label className="space-y-2 text-sm">
                        <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Surname</span>
                        <input
                          value={profileForm.surname}
                          onChange={(event) => setProfileForm((prev) => ({ ...prev, surname: event.target.value }))}
                          className={`w-full rounded-2xl border px-3 py-2.5 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-700'}`}
                          placeholder="Surname"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-2 text-sm">
                        <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Email address</span>
                        <div className="relative">
                          <Mail size={15} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                          <input
                            value={profileForm.email}
                            onChange={(event) => setProfileForm((prev) => ({ ...prev, email: event.target.value }))}
                            disabled={isSupabaseAuthenticated}
                            className={`w-full rounded-2xl border py-2.5 pl-9 pr-3 text-sm outline-none ${isSupabaseAuthenticated ? 'cursor-not-allowed opacity-70' : ''} ${isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-700'}`}
                            placeholder="name@company.com"
                          />
                        </div>
                      </label>
                      <label className="space-y-2 text-sm">
                        <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Business name</span>
                        <div className="relative">
                          <Building2 size={15} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                          <input
                            value={profileForm.businessName}
                            onChange={(event) => setProfileForm((prev) => ({ ...prev, businessName: event.target.value }))}
                            className={`w-full rounded-2xl border py-2.5 pl-9 pr-3 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-700'}`}
                            placeholder="Your business"
                          />
                        </div>
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-2 text-sm">
                        <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Default currency</span>
                        <select
                          value={profileForm.currency}
                          onChange={(event) => setProfileForm((prev) => ({ ...prev, currency: event.target.value }))}
                          className={`w-full rounded-2xl border px-3 py-2.5 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-700'}`}
                        >
                          {currencyOptions.map((currency) => {
                            const meta = getCurrencyMeta(currency);
                            return (
                              <option key={currency} value={currency}>
                                {currency} ({meta.symbol})
                              </option>
                            );
                          })}
                        </select>
                      </label>
                      <label className="space-y-2 text-sm">
                        <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Password</span>
                        <div className="relative">
                          <KeyRound size={15} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={profileForm.password}
                            onChange={(event) => setProfileForm((prev) => ({ ...prev, password: event.target.value }))}
                            className={`w-full rounded-2xl border py-2.5 pl-9 pr-10 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-700'}`}
                            placeholder={profile ? 'Leave blank to keep current password' : 'Create password'}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((s) => !s)}
                            className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 ${isDarkMode ? 'text-slate-300' : ''}`}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </label>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className={`text-sm ${getPromptToneClasses(profileMessage, isDarkMode ? 'text-slate-400' : 'text-slate-600')}`}>{profileMessage || (profile ? `Current profile: ${profile.firstName} ${profile.surname}` : 'Create your profile to personalize Ledgr.')}</p>
                      <button type="submit" disabled={submitting} className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-500 disabled:hover:bg-indigo-600">
                        {submitting ? 'Saving…' : 'Save changes'}
                      </button>
                    </div>
                  </form>
                ) : null}

                {settingsTab === 'workspace' ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal size={16} className={isDarkMode ? 'text-indigo-300' : 'text-indigo-700'} />
                      <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{t('workspacePreferences')}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-2 text-sm">
                        <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Theme</span>
                        <div className={`flex h-11 items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-sm ${isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
                          <span>{isDarkMode ? 'Dark mode' : 'Light mode'}</span>
                          <button
                            type="button"
                            onClick={() => setIsDarkMode((prev) => !prev)}
                            className={`inline-flex h-8 items-center justify-center gap-2 rounded-2xl border px-3 py-1 text-sm font-medium transition ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}
                          >
                            {isDarkMode ? <Moon size={15} /> : <SunMedium size={15} />}
                            {isDarkMode ? 'Dark' : 'Light'}
                          </button>
                        </div>
                      </label>
                      <label className="space-y-2 text-sm">
                        <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Activity tracking</span>
                        <label className="flex items-center justify-between rounded-2xl border px-3 py-2.5 text-sm">
                          <span>{profileForm.activityTracking ? 'Enabled' : 'Paused'}</span>
                          <input
                            type="checkbox"
                            checked={Boolean(profileForm.activityTracking)}
                            onChange={(event) => setProfileForm((prev) => ({ ...prev, activityTracking: event.target.checked }))}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </label>
                      </label>
                    </div>
                    <div className={`rounded-3xl border p-4 ${isDarkMode ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-white'}`}>
                      <div className="flex items-center gap-2">
                        <BellRing size={16} className={isDarkMode ? 'text-amber-300' : 'text-amber-700'} />
                        <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Notification preferences</p>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <label className={`flex items-center justify-between rounded-2xl border px-3 py-2.5 text-sm ${isDarkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-slate-50'}`}>
                          <span>Push alerts</span>
                          <input
                            type="checkbox"
                            checked={Boolean(profileForm.notificationPreferences?.push)}
                            onChange={(event) => setProfileForm((prev) => ({ ...prev, notificationPreferences: { ...prev.notificationPreferences, push: event.target.checked } }))}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </label>
                        <label className={`flex items-center justify-between rounded-2xl border px-3 py-2.5 text-sm ${isDarkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-slate-50'}`}>
                          <span>Low stock</span>
                          <input
                            type="checkbox"
                            checked={Boolean(profileForm.notificationPreferences?.lowStock)}
                            onChange={(event) => setProfileForm((prev) => ({ ...prev, notificationPreferences: { ...prev.notificationPreferences, lowStock: event.target.checked } }))}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </label>
                        <label className={`flex items-center justify-between rounded-2xl border px-3 py-2.5 text-sm ${isDarkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-slate-50'}`}>
                          <span>Margin drops</span>
                          <input
                            type="checkbox"
                            checked={Boolean(profileForm.notificationPreferences?.marginDrop)}
                            onChange={(event) => setProfileForm((prev) => ({ ...prev, notificationPreferences: { ...prev.notificationPreferences, marginDrop: event.target.checked } }))}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </label>
                        <label className={`flex items-center justify-between rounded-2xl border px-3 py-2.5 text-sm ${isDarkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-slate-50'}`}>
                          <span>Insufficient stock</span>
                          <input
                            type="checkbox"
                            checked={Boolean(profileForm.notificationPreferences?.insufficientStock)}
                            onChange={(event) => setProfileForm((prev) => ({ ...prev, notificationPreferences: { ...prev.notificationPreferences, insufficientStock: event.target.checked } }))}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </label>
                        <label className={`flex items-center justify-between rounded-2xl border px-3 py-2.5 text-sm sm:col-span-2 ${isDarkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-slate-50'}`}>
                          <span>Unusual returns</span>
                          <input
                            type="checkbox"
                            checked={Boolean(profileForm.notificationPreferences?.unusualReturns)}
                            onChange={(event) => setProfileForm((prev) => ({ ...prev, notificationPreferences: { ...prev.notificationPreferences, unusualReturns: event.target.checked } }))}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </label>
                      </div>
                      <div className="mt-4 space-y-3">
                        <button
                          type="button"
                          onClick={handleEnablePushNotifications}
                          disabled={submitting}
                          className="w-full inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-400"
                        >
                          Enable push notifications
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveWorkspacePreferences}
                          disabled={submitting}
                          className="w-full inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-500 disabled:hover:bg-indigo-600"
                        >
                          {submitting ? 'Saving…' : 'Save workspace settings'}
                        </button>
                      </div>
                      {securityMessage ? (
                        <div className={`rounded-2xl border px-3 py-2 text-sm ${isDarkMode ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                          {securityMessage}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {settingsTab === 'security' ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={16} className={isDarkMode ? 'text-emerald-300' : 'text-emerald-700'} />
                      <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{t('securityControls')}</p>
                    </div>
                    {securityMessage ? (
                      <div className={`rounded-2xl border px-3 py-2 text-sm ${isDarkMode ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                        {securityMessage}
                      </div>
                    ) : null}
                    <div className="grid grid-cols-2 gap-3">
                      <div className={`rounded-2xl border p-3 ${isDarkMode ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-white'}`}>
                        <div className="flex items-center gap-2">
                          <Database size={15} className={isDarkMode ? 'text-sky-300' : 'text-sky-700'} />
                          <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Storage usage</p>
                        </div>
                        <p className={`mt-2 text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{storageUsageLabel}</p>
                        <p className={`mt-1 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Local workspace data is compact and ready to sync.</p>
                      </div>
                      <div className={`rounded-2xl border p-3 ${isDarkMode ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-white'}`}>
                        <div className="flex items-center gap-2">
                          <RefreshCw size={15} className={isDarkMode ? 'text-amber-300' : 'text-amber-700'} />
                          <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Sync logs</p>
                        </div>
                        <div className="mt-3 space-y-2">
                          {syncLogs.map((log) => (
                            <div key={log.title} className={`rounded-xl px-3 py-2 text-sm ${isDarkMode ? 'bg-slate-950/60' : 'bg-slate-50'}`}>
                              <div className="flex items-center justify-between gap-3">
                                <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{log.title}</span>
                                <span className={`rounded-full px-2 py-1 text-[11px] ${log.accent === 'healthy' ? (isDarkMode ? 'bg-emerald-500/10 text-emerald-300' : 'bg-emerald-100 text-emerald-700') : (isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700')}`}>
                                  {log.accent === 'healthy' ? 'Healthy' : 'On'}
                                </span>
                              </div>
                              <p className={`mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{log.detail}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className={`rounded-3xl border p-4 ${isDarkMode ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-white'}`}>
                      <div className="flex items-center gap-2">
                        <MonitorSmartphone size={16} className={isDarkMode ? 'text-indigo-300' : 'text-indigo-700'} />
                        <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Device management</p>
                      </div>
                      <div className="mt-3 space-y-2">
                        {deviceList.map((device) => (
                          <div key={device.name} className={`flex flex-col gap-2 rounded-2xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between ${isDarkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-slate-50'}`}>
                            <div>
                              <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{device.name}</p>
                              <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{device.location} • {device.seen}</p>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${device.status === 'Active' ? (isDarkMode ? 'bg-emerald-500/10 text-emerald-300' : 'bg-emerald-100 text-emerald-700') : (isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700')}`}>
                              {device.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className={`rounded-3xl border p-4 ${isDarkMode ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-white'}`}>
                      <div className="flex items-center gap-2">
                        <History size={16} className={isDarkMode ? 'text-amber-300' : 'text-amber-700'} />
                        <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Session history</p>
                      </div>
                      <div className="mt-3 space-y-2">
                        {sessionHistory.map((item) => (
                          <div key={item.title} className={`rounded-2xl border px-3 py-2.5 text-sm ${isDarkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-slate-50'}`}>
                            <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{item.title}</p>
                            <p className={`mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{item.detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className={`flex flex-col gap-3 rounded-3xl border p-4 sm:flex-row sm:items-center sm:justify-between ${isDarkMode ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-white'}`}>
                      <div>
                        <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Account & data</p>
                        <p className={`mt-1 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{profile ? 'Manage your account or reset your workspace.' : 'Sign up to sync your workspace, or keep working locally until you\'re ready.'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!isSupabaseAuthenticated ? (
                          <>
                            <button
                              type="button"
                              onClick={handleSignUp}
                              className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                            >
                              <ShieldCheck size={15} />
                              Sign up
                            </button>
                            <button
                              type="button"
                              onClick={handleLogin}
                              className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition ${isDarkMode ? 'border-slate-700 bg-slate-950/60 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'}`}
                            >
                              <KeyRound size={15} />
                              Log in
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={handleLogout}
                            disabled={submitting}
                            className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition ${isDarkMode ? 'border-slate-700 bg-slate-950/60 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'} ${submitting ? 'cursor-not-allowed opacity-70' : ''}`}
                          >
                            <RefreshCw size={15} />
                            Log out
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleResetWorkspace}
                          className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition ${isDarkMode ? 'border-slate-700 bg-slate-950/60 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'}`}
                        >
                          <Zap size={15} />
                          Reset workspace
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {settingsTab !== 'security' ? (
                <div className="space-y-4">
                  <div className={`rounded-3xl border p-4 ${isDarkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-center gap-2">
                      <ActiveTabIcon size={16} className={isDarkMode ? 'text-emerald-300' : 'text-emerald-700'} />
                      <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{selectedTab.label} overview</p>
                    </div>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className={`rounded-2xl border px-3 py-2 ${isDarkMode ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-white'}`}>
                        <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Currency formatting</p>
                        <p className={`mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{getCurrencyLabel(currencyCode)} • 2 decimals</p>
                      </div>
                      <div className={`rounded-2xl border px-3 py-2 ${isDarkMode ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-white'}`}>
                        <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Business details</p>
                        <p className={`mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{profileForm.businessName || 'Add your business name to personalise the workspace.'}</p>
                      </div>
                    </div>
                  </div>
                  <div className={`rounded-3xl border p-4 ${isDarkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'}`}>
                    <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Security tip</p>
                    <p className={`mt-2 text-sm leading-6 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Use strong passwords and review device access regularly to keep the workspace protected.</p>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      );
    }

    return (
      <>
        {loading ? (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${isDarkMode ? 'border-slate-800 bg-slate-900/70 text-slate-300' : 'border-slate-200 bg-white/80 text-slate-600'}`}>
            Loading dashboard data...
          </div>
        ) : null}

        {(showInstallHint || showManualInstallHint) && !isPwaInstalled ? (
          <section className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${isDarkMode ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-100' : 'border-indigo-200 bg-indigo-50 text-indigo-700'}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">Add Ledgr to your home screen</p>
                <p className={`mt-1 text-sm ${isDarkMode ? 'text-indigo-100' : 'text-indigo-700'}`}>
                  {installPromptEvent
                    ? 'Tap the button to install Ledgr and launch it like an app.'
                    : manualInstallHintMessage
                      ? manualInstallHintMessage
                      : isMobileBrowser
                        ? 'Use your browser menu to add Ledgr to your home screen.'
                        : 'Open your browser menu to install Ledgr or add it to your home screen.'}
                </p>
              </div>
              {installPromptEvent ? (
                <button
                  type="button"
                  onClick={handleInstallPrompt}
                  className={`inline-flex items-center justify-center rounded-2xl px-3 py-2 text-sm font-semibold transition ${isDarkMode ? 'bg-indigo-500 text-white hover:bg-indigo-400' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
                >
                  Add to home screen
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleMobileInstallAction}
                  className={`inline-flex items-center justify-center rounded-2xl px-3 py-2 text-sm font-semibold transition ${isDarkMode ? 'bg-indigo-500 text-white hover:bg-indigo-400' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
                >
                  Install instructions
                </button>
              )}
            </div>
          </section>
        ) : null}

        <section className="grid gap-3 grid-cols-2">
          {kpiCards.map((card) => {
            const Icon = card.icon;
            const shouldShowNegative = card.alwaysNegative || card.rawValue < 0;
            const valueClasses = shouldShowNegative
              ? 'text-rose-400'
              : 'text-emerald-400';
            const iconBgClasses = shouldShowNegative
              ? 'bg-rose-500/15 text-rose-400'
              : 'bg-emerald-500/15 text-emerald-400';

            return (
              <article
                key={card.label}
                className={`rounded-2xl border p-4 shadow-lg sm:p-5 ${isDarkMode ? 'border-slate-800 bg-slate-900/80 shadow-slate-950/30' : 'border-slate-200 bg-white/80 shadow-slate-200/70'}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{card.label}</p>
                    <p className={`mt-3 text-xl font-semibold sm:text-2xl ${valueClasses}`}>{card.value}</p>
                  </div>
                  <div className={`rounded-2xl p-2 ${iconBgClasses}`}>
                    <Icon size={20} />
                  </div>
                </div>

              </article>
            );
          })}
        </section>

        <section className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr]">
          <div className={`rounded-2xl border p-4 shadow-xl sm:p-5 ${isDarkMode ? 'border-slate-800 bg-slate-900/80 shadow-slate-950/30' : 'border-slate-200 bg-white/80 shadow-slate-200/70'}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{t('revenueTrend')}</p>
                <p className={`mt-1 text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{t('revenueTrendSubtitle')}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
                Revenue
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                COGS
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                Net profit
              </div>
            </div>
            <div className="mt-4 h-56 w-full sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#818cf8" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="cogsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.03} />
                    </linearGradient>
                    <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#334155' : '#cbd5e1'} strokeOpacity={0.35} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 12 }} />
                  <Tooltip
                    cursor={{ stroke: isDarkMode ? '#818cf8' : '#4f46e5', strokeWidth: 1 }}
                    contentStyle={{
                      backgroundColor: isDarkMode ? '#020617' : '#ffffff',
                      border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
                      borderRadius: '12px',
                      color: isDarkMode ? '#f8fafc' : '#0f172a',
                    }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#818cf8" strokeWidth={2.5} fill="url(#revenueGradient)" />
                  <Area type="monotone" dataKey="cogs" stroke="#f59e0b" strokeWidth={2.5} fill="url(#cogsGradient)" />
                  <Area type="monotone" dataKey="netProfit" stroke="#34d399" strokeWidth={2.5} fill="url(#profitGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`rounded-2xl border p-4 shadow-xl sm:p-5 ${isDarkMode ? 'border-slate-800 bg-slate-900/80 shadow-slate-950/30' : 'border-slate-200 bg-white/80 shadow-slate-200/70'}`}>
            <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Today's focus</p>
            <h3 className={`mt-2 text-lg font-semibold sm:text-xl ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{focusSummary.title}</h3>
            <p className={`mt-2 text-sm leading-6 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              {focusSummary.body}
            </p>
          </div>
        </section>

        <div className={`${hasAdSlotVisible ? '' : 'hidden'} mb-4 rounded-3xl border p-4 ${isDarkMode ? 'border-slate-700 bg-slate-950/70 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-900'}`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>Sponsored</span>
          </div>
          <div id="container-61a2c10d537d409af3dbb4930b7469ae" className="mx-auto max-w-full rounded-3xl" />
        </div>

        <section className={`rounded-2xl border p-3 shadow-xl sm:p-6 ${isDarkMode ? 'border-slate-800 bg-slate-900/80 shadow-slate-950/30' : 'border-slate-200 bg-white/80 shadow-slate-200/70'}`}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Activity Ledger</h2>
            </div>

            <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
              <select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value)}
                className={`min-w-[8rem] shrink-0 rounded-2xl border px-3 py-2 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950/60 text-slate-300' : 'border-slate-200 bg-slate-100 text-slate-600'}`}
              >
                <option value="all">All types</option>
                <option value="Sale">Sale</option>
                <option value="Restock">Restock</option>
                <option value="Refund">Refund</option>
              </select>
              <select
                value={activityProductFilter}
                onChange={(e) => setActivityProductFilter(e.target.value)}
                className={`min-w-[8rem] shrink-0 rounded-2xl border px-3 py-2 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950/60 text-slate-300' : 'border-slate-200 bg-slate-100 text-slate-600'}`}
              >
                <option value="all">All products</option>
                {activityProductOptions.map((productName) => (
                  <option key={productName} value={productName}>{productName}</option>
                ))}
              </select>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className={`min-w-[8rem] shrink-0 rounded-2xl border px-3 py-2 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950/60 text-slate-300' : 'border-slate-200 bg-slate-100 text-slate-600'}`}
              >
                <option value="all">All dates</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="last-7-days">Last 7 days</option>
                <option value="last-30-days">Last 30 days</option>
                <option value="this-week">This week</option>
                <option value="this-month">This month</option>
                <option value="last-month">Last month</option>
                <option value="this-year">This year</option>
                <option value="custom">Custom date</option>
              </select>
              {dateFilter === 'custom' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={customDateStart}
                    onChange={(e) => setCustomDateStart(e.target.value)}
                    className={`min-w-[8rem] shrink-0 rounded-2xl border px-3 py-2 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950/60 text-slate-300' : 'border-slate-200 bg-slate-100 text-slate-600'}`}
                  />
                  <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>to</span>
                  <input
                    type="date"
                    value={customDateEnd}
                    onChange={(e) => setCustomDateEnd(e.target.value)}
                    className={`min-w-[8rem] shrink-0 rounded-2xl border px-3 py-2 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950/60 text-slate-300' : 'border-slate-200 bg-slate-100 text-slate-600'}`}
                  />
                </div>
              ) : null}
            </div>
          </div>

          {actionMessage ? (
            <div className={`mb-3 rounded-2xl border px-3 py-2 text-sm ${getPromptToneClasses(actionMessage, isDarkMode ? 'border-slate-700 bg-slate-950/60 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600')}`}>
              {actionMessage}
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className={`min-w-full divide-y text-left text-sm ${isDarkMode ? 'divide-slate-800' : 'divide-slate-200'}`}>
              <thead>
                <tr className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>
                  <th className="px-3 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="px-3 py-3 font-medium">Description</th>
                  <th className="px-3 py-3 font-medium">Quantity</th>
                  <th className="px-3 py-3 font-medium">Amount</th>
                  <th className="px-3 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800' : 'divide-slate-200'}`}>
                {paginatedTransactions.map((entry, index) => {
                  const globalIndex = pnlStartIndex + index;
                  const actionMenuKey = `${entry.type}-${entry.id}`;

                  return (
                  <tr
                    key={actionMenuKey}
                    className={isDarkMode ? 'hover:bg-slate-800/40' : 'hover:bg-slate-100'}
                  >
                    <td className={`whitespace-nowrap px-3 py-3 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      <div className="flex items-center gap-2">
                        <CalendarDays size={15} className={isDarkMode ? 'text-slate-500' : 'text-slate-400'} />
                        {entry.date}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${entry.type === 'Sale' ? 'bg-emerald-500/10 text-emerald-400' : entry.type === 'Restock' ? 'bg-sky-500/10 text-sky-400' : 'bg-amber-500/10 text-amber-400'}`}>
                        {entry.type}
                      </span>
                    </td>
                    <td className={`px-3 py-3 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{entry.productName || entry.description}</td>
                    <td className={`px-3 py-3 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{entry.quantity ?? '-'}</td>
                    <td className={`px-3 py-3 font-semibold ${parseCurrencyValue(entry.amount) < 0 ? 'text-rose-400' : isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                      {formatCurrency(parseCurrencyValue(entry.amount))}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {entry.type === 'Sale' ? (
                        <div className="relative inline-flex" data-action-menu-root>
                          <button
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setActiveActionMenuId((current) => current === actionMenuKey ? null : actionMenuKey);
                            }}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
                          >
                            …
                          </button>
                          {activeActionMenuId === actionMenuKey ? (
                            <div
                              className={`absolute right-0 z-10 mt-2 w-40 rounded-2xl border p-2 shadow-xl ${isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}
                              onMouseDown={(event) => event.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setActiveActionMenuId(null);
                                  handleDeleteEntry(entry.id);
                                }}
                                className={`block w-full rounded-xl px-3 py-2 text-left text-sm ${isDarkMode ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'}`}
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setActiveActionMenuId(null);
                                  handleRefundEntry(entry.id);
                                }}
                                className={`mt-1 block w-full rounded-xl px-3 py-2 text-left text-sm ${isDarkMode ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'}`}
                              >
                                Mark refund
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                      <div className="inline-flex h-8 w-8 items-center justify-center">
                        <span className={isDarkMode ? 'text-slate-500' : 'text-slate-400'}>&mdash;</span>
                      </div>
                    )}
                  </td>
                </tr>
                );
              })}
              </tbody>
            </table>
          </div>

          <div className="mt-2 flex items-center justify-between text-sm">
            <div className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>
              Showing {sortedTransactions.length ? pnlStartIndex + 1 : 0}–{Math.min(pnlStartIndex + ITEMS_PER_PAGE, sortedTransactions.length)} of {sortedTransactions.length}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPnlPage((p) => Math.max(1, p - 1))} disabled={pnlPage <= 1} className={`rounded-xl px-3 py-1 text-sm ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}>
                Prev
              </button>
              <div className={isDarkMode ? 'text-slate-300' : 'text-slate-600'}>Page {pnlPage} / {pnlTotalPages}</div>
              <button type="button" onClick={() => setPnlPage((p) => Math.min(pnlTotalPages, p + 1))} disabled={pnlPage >= pnlTotalPages} className={`rounded-xl px-3 py-1 text-sm ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}>
                Next
              </button>
            </div>
          </div>
        </section>
      </>
    );
  };

  if (showOnboarding) {
    return (
      <div className={`min-h-screen overflow-hidden ${isDarkMode ? 'bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.2),_transparent_35%),linear-gradient(135deg,#020617_0%,#0f172a_100%)] text-slate-100' : 'bg-[radial-gradient(circle_at_top_left,_rgba(129,140,248,0.15),_transparent_35%),linear-gradient(135deg,#f8fafc_0%,#e2e8f0_100%)] text-slate-800'}`}>
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-3 py-3 sm:px-6 lg:flex-row lg:gap-6 lg:px-8 lg:py-8">
          <aside className={`hidden rounded-3xl border p-4 shadow-2xl backdrop-blur lg:sticky lg:top-6 lg:block lg:h-fit lg:w-72 lg:p-5 ${isDarkMode ? 'border-slate-800/80 bg-slate-900/70 shadow-slate-950/40' : 'border-slate-200 bg-white/80 shadow-slate-200/70'}`}>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
                <LayoutGrid size={20} />
              </div>
              <div>
                <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Ledgr</p>
                <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Operations Suite</p>
              </div>
            </div>

            <nav className="mt-6 space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined' && item.id === 'settings') {
                        window.location.hash = item.id;
                        window.location.reload();
                        return;
                      }

                      setActiveView(item.id);
                      refreshCurrentView(item.id);
                    }}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition ${isActive ? (isDarkMode ? 'bg-indigo-500/10 text-indigo-300' : 'bg-indigo-100 text-indigo-700') : (isDarkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}`}
                  >
                    <Icon size={16} />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="flex-1 space-y-4 pb-24 sm:space-y-6 sm:pb-0">
            <div className={`rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur sm:hidden ${isDarkMode ? 'border-slate-800/80 bg-slate-900/70 shadow-slate-950/40' : 'border-slate-200 bg-white/80 shadow-slate-200/70'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/20 to-cyan-400/20 text-indigo-300 shadow-lg shadow-indigo-500/10">
                    <LayoutGrid size={18} />
                  </div>
                  <div>
                    <p className={`text-sm font-semibold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Ledgr</p>
                    <p className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Operations Suite</p>
                  </div>
                </div>
                <div className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] ${isDarkMode ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300' : 'border-indigo-200 bg-indigo-50 text-indigo-700'}`}>
                  {profile?.firstName || 'Guest'}
                </div>
              </div>
            </div>

            <header className={`rounded-2xl border px-4 py-4 shadow-2xl backdrop-blur sm:px-6 sm:py-6 ${isDarkMode ? 'border-slate-800/80 bg-slate-900/70 shadow-slate-950/40' : 'border-slate-200 bg-white/80 shadow-slate-200/70'}`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:gap-6">
                <div className="flex items-start gap-3">
                  <div>
                    <p className={`mb-2 hidden items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300 sm:inline-flex ${isDarkMode ? '' : ''}`}>
                      {profile?.firstName ? `Welcome back, ${profile.firstName}` : 'Ledgr • Finance Control Center'}
                    </p>
                    <h1 className={`mt-2 text-2xl font-semibold tracking-tight sm:mt-0 sm:text-3xl ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      {activeViewMeta.title}
                    </h1>
                    <p className={`mt-2 max-w-2xl text-sm sm:text-base ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      {activeViewMeta.description}
                    </p>
                  </div>
                </div>

                {activeView === 'dashboard' ? (
                  <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                    {(showInstallHint || showManualInstallHint) && !isPwaInstalled ? (
                      <div className={`rounded-2xl border px-4 py-3 text-sm ${isDarkMode ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-100' : 'border-indigo-200 bg-indigo-50 text-indigo-700'}`}>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                          <div>
                            <p className="font-medium">Add Ledgr to your home screen</p>
                            <p className={`mt-1 text-sm ${isDarkMode ? 'text-indigo-100' : 'text-indigo-700'}`}>
                              {installPromptEvent
                                ? 'Tap the button to install Ledgr and launch it like an app.'
                                : manualInstallHintMessage
                                  ? manualInstallHintMessage
                                  : isMobileBrowser
                                    ? 'Open your browser menu and choose Add to Home screen to install Ledgr.'
                                    : 'Install Ledgr from your browser settings or add it to your home screen.'}
                            </p>
                          </div>
                          {installPromptEvent ? (
                            <button
                              type="button"
                              onClick={handleInstallPrompt}
                              className={`inline-flex items-center justify-center rounded-2xl px-3 py-2 text-sm font-semibold transition ${isDarkMode ? 'bg-indigo-500 text-white hover:bg-indigo-400' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
                            >
                              Add to home screen
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={handleMobileInstallAction}
                              className={`inline-flex items-center justify-center rounded-2xl px-3 py-2 text-sm font-semibold transition ${isDarkMode ? 'bg-indigo-500 text-white hover:bg-indigo-400' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
                            >
                              Show install instructions
                            </button>
                          )}
                        </div>
                      </div>
                    ) : null}
                    <button
                      onClick={() => setModalOpen(true)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 sm:w-auto"
                    >
                      <PlusCircle size={18} />
                      Add Activity
                    </button>
                  </div>
                ) : null}
              </div>
            </header>

            {renderMainContent()}
          </div>
        </div>

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 px-3 py-4 backdrop-blur-[2px]">
          <div className={`w-full max-w-[19rem] rounded-3xl border p-2 shadow-2xl sm:max-w-[24rem] sm:p-6 ${isDarkMode ? 'border-slate-800 bg-slate-900/95 shadow-slate-950/40' : 'border-slate-200 bg-white/95 shadow-slate-200/70'}`} style={{ maxHeight: 'calc(100vh - 1.5rem)' }}>
            <div className="max-h-[calc(100vh-1.5rem)] overflow-y-auto pr-1">
              <div className="flex items-start justify-between gap-2">
              <div className="space-y-1.5">
                <p className={`text-[9px] font-semibold uppercase tracking-[0.35em] ${isDarkMode ? 'text-indigo-300' : 'text-indigo-600'}`}>Welcome to Ledgr</p>
                <h2 className={`text-base font-semibold sm:text-xl ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Create your workspace profile</h2>
              </div>
              <button
                type="button"
                onClick={dismissOnboarding}
                aria-label="Cancel signup"
                className={`rounded-full p-2 transition ${isDarkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
              >
                <X size={18} />
              </button>
            </div>

            <form className="mt-3 space-y-2" onSubmit={handleProfileSubmit}>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <label className="space-y-1 text-xs">
                  <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>First name</span>
                  <input
                    value={profileForm.firstName}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, firstName: event.target.value }))}
                    className={`w-full rounded-2xl border px-2 py-1.5 text-xs outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                    placeholder="First name"
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Surname</span>
                  <input
                    value={profileForm.surname}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, surname: event.target.value }))}
                    className={`w-full rounded-2xl border px-2 py-1.5 text-xs outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                    placeholder="Surname"
                  />
                </label>
              </div>

              <label className="space-y-1 text-xs">
                <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Email</span>
                <input
                  required
                  type="email"
                  value={profileForm.email}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, email: event.target.value }))}
                  className={`w-full rounded-2xl border px-2 py-1.5 text-xs outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                  placeholder="your@email.com"
                />
              </label>

              <div className="grid gap-1.5 sm:grid-cols-2">
                <label className="space-y-1 text-xs">
                  <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Default currency</span>
                  <select
                    value={profileForm.currency}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, currency: event.target.value }))}
                    className={`w-full rounded-2xl border px-2 py-1.5 text-xs outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                  >
                    {currencyOptions.map((currency) => {
                      const meta = getCurrencyMeta(currency);
                      return (
                        <option key={currency} value={currency}>
                          {currency} ({meta.symbol})
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Password</span>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={profileForm.password}
                      onChange={(event) => setProfileForm((prev) => ({ ...prev, password: event.target.value }))}
                      className={`w-full rounded-2xl border px-2 py-1.5 pr-9 text-xs outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                      placeholder="Create password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className={`absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isDarkMode ? 'border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'}`}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className={`text-xs ${getPromptToneClasses(profileMessage, isDarkMode ? 'text-slate-400' : 'text-slate-600')}`}>{profileMessage || 'Continue to create your workspace profile.'}</p>
                  <button
                    type="button"
                    onClick={openLoginFromOnboarding}
                    className={`text-xs font-medium underline-offset-2 hover:underline ${isDarkMode ? 'text-indigo-300' : 'text-indigo-600'}`}
                  >
                    Already have an account? Log in here
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-500 disabled:hover:bg-indigo-600"
                >
                  {submitting ? 'Continuing…' : 'Continue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.2),_transparent_35%),linear-gradient(135deg,#020617_0%,#0f172a_100%)] text-slate-100' : 'bg-[radial-gradient(circle_at_top_left,_rgba(129,140,248,0.15),_transparent_35%),linear-gradient(135deg,#f8fafc_0%,#e2e8f0_100%)] text-slate-800'}`}>
      {toastMessage ? (
        <div className={`fixed right-4 top-4 z-50 max-w-sm rounded-3xl border px-4 py-3 shadow-2xl ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              <Zap size={18} className={toastVariant === 'success' ? 'text-emerald-400' : 'text-indigo-500'} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{toastMessage}</p>
            </div>
            <button type="button" onClick={() => setToastMessage('')} className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100">
              <X size={16} />
            </button>
          </div>
        </div>
      ) : null}
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-3 py-3 sm:px-6 lg:flex-row lg:gap-6 lg:px-8 lg:py-8">
        <aside className={`hidden rounded-3xl border p-4 shadow-2xl backdrop-blur lg:sticky lg:top-6 lg:block lg:h-fit lg:w-72 lg:p-5 ${isDarkMode ? 'border-slate-800/80 bg-slate-900/70 shadow-slate-950/40' : 'border-slate-200 bg-white/80 shadow-slate-200/70'}`}>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
              <LayoutGrid size={20} />
            </div>
            <div>
              <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Ledgr</p>
              <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Operations Suite</p>
            </div>
          </div>

          <nav className="mt-6 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition ${isActive ? (isDarkMode ? 'bg-indigo-500/10 text-indigo-300' : 'bg-indigo-100 text-indigo-700') : (isDarkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}`}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 space-y-4 pb-24 sm:space-y-6 sm:pb-0">
          <div className={`rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur sm:hidden ${isDarkMode ? 'border-slate-800/80 bg-slate-900/70 shadow-slate-950/40' : 'border-slate-200 bg-white/80 shadow-slate-200/70'}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/20 to-cyan-400/20 text-indigo-300 shadow-lg shadow-indigo-500/10">
                  <LayoutGrid size={18} />
                </div>
                <div>
                  <p className={`text-sm font-semibold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Ledgr</p>
                  <p className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Operations Suite</p>
                </div>
              </div>
              <div className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] ${isDarkMode ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300' : 'border-indigo-200 bg-indigo-50 text-indigo-700'}`}>
                {profile?.firstName || 'Guest'}
              </div>
            </div>
          </div>

        <header className={`rounded-2xl border px-4 py-4 shadow-2xl backdrop-blur sm:px-6 sm:py-6 ${isDarkMode ? 'border-slate-800/80 bg-slate-900/70 shadow-slate-950/40' : 'border-slate-200 bg-white/80 shadow-slate-200/70'}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:gap-6">
            <div className="flex items-start gap-3">
              <div>
                <p className={`mb-2 hidden items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300 sm:inline-flex ${isDarkMode ? '' : ''}`}>
                  {profile?.firstName ? `Welcome back, ${profile.firstName}` : 'Ledgr • Finance Control Center'}
                </p>
                <h1 className={`mt-2 text-2xl font-semibold tracking-tight sm:mt-0 sm:text-3xl ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {activeViewMeta.title}
                </h1>
                <p className={`mt-2 max-w-2xl text-sm sm:text-base ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  {activeViewMeta.description}
                </p>
              </div>
            </div>

            {activeView === 'dashboard' ? (
              <div className="flex w-full items-center justify-end sm:w-auto">
                <button
                  onClick={() => setModalOpen(true)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 sm:w-auto"
                >
                  <PlusCircle size={18} />
                  Add Activity
                </button>
              </div>
            ) : null}
          </div>
        </header>

        {renderMainContent()}
        </div>
      </div>

      <div className={`fixed bottom-0 left-0 right-0 z-50 border-t px-2 pb-3 pt-2 shadow-[0_-10px_35px_rgba(0,0,0,0.2)] lg:hidden ${isDarkMode ? 'border-slate-800 bg-slate-950/95' : 'border-slate-200 bg-white/95'}`}>
        <nav className={`mx-auto flex max-w-md items-center justify-around rounded-2xl border p-1 shadow-inner backdrop-blur sm:max-w-lg ${isDarkMode ? 'border-white/10 bg-slate-900/70 shadow-black/20' : 'border-slate-200 bg-white/90 shadow-slate-200'}`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined' && item.id === 'settings') {
                    window.location.hash = item.id;
                    window.location.reload();
                    return;
                  }

                  setActiveView(item.id);
                  refreshCurrentView(item.id);
                }}
                className={`flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[11px] font-medium transition ${isActive ? (isDarkMode ? 'bg-indigo-500/20 text-indigo-200 shadow-sm shadow-indigo-500/20' : 'bg-indigo-100 text-indigo-700') : (isDarkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}`}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-3 py-4 backdrop-blur-sm">
          <div className={`w-full max-w-[min(100%,24rem)] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border p-4 shadow-2xl shadow-slate-950/60 sm:p-6 ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`text-sm font-medium uppercase tracking-[0.2em] ${isDarkMode ? 'text-indigo-300' : 'text-indigo-600'}`}>Ledgr action</p>
                <h3 className={`mt-1 text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Capture a new activity</h3>
              </div>
              <button onClick={() => setModalOpen(false)} className={`rounded-full p-2 transition ${isDarkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setSelectedAction('sale');
                  setError('');
                  setFormState({ productId: '', quantity: '', price: '' });
                }}
                className={`rounded-2xl border px-3 py-3 text-sm font-medium transition ${selectedAction === 'sale' ? (isDarkMode ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' : 'border-indigo-500 bg-indigo-50 text-indigo-700') : (isDarkMode ? 'border-slate-700 bg-slate-950/50 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700')}`}
              >
                <div className="flex items-center justify-center gap-2">
                  <ShoppingCart size={16} />
                  Add Sale
                </div>
              </button>
              <button
                onClick={() => {
                  setSelectedAction('restock');
                  setError('');
                  setFormState({ productId: '', quantity: '', price: '' });
                }}
                className={`rounded-2xl border px-3 py-3 text-sm font-medium transition ${selectedAction === 'restock' ? (isDarkMode ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' : 'border-indigo-500 bg-indigo-50 text-indigo-700') : (isDarkMode ? 'border-slate-700 bg-slate-950/50 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700')}`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Package size={16} />
                  Add Restock
                </div>
              </button>
            </div>

            <div className={`mt-5 rounded-2xl border p-4 ${isDarkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'}`}>
              <h4 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {selectedAction === 'sale' ? 'New sale entry' : 'New restock entry'}
              </h4>
              <div className="mt-4 space-y-3">
                {error ? (
                  <div className={`rounded-2xl border px-3 py-2 text-xs ${getPromptToneClasses(error, isDarkMode ? 'border-slate-700 bg-slate-950/60 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600')}`}>
                    {error}
                  </div>
                ) : null}
                <div className="relative space-y-1">
                  <input
                    type="text"
                    className={`w-full rounded-xl border px-3 py-2.5 text-base sm:text-sm outline-none placeholder:text-slate-500 ${isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-200' : 'border-slate-200 bg-white text-slate-700'}`}
                    placeholder="Enter Product name or choose an existing product"
                    value={formState.productId}
                    onChange={(e) => {
                      setError('');
                      setFormState((prev) => ({ ...prev, productId: e.target.value }));
                      setProductSuggestionsOpen(true);
                    }}
                    onFocus={() => setProductSuggestionsOpen(true)}
                    onBlur={() => setTimeout(() => setProductSuggestionsOpen(false), 150)}
                    autoComplete="off"
                  />
                  {productSuggestionsOpen && availableProducts.length > 0 ? (
                    <div className={`absolute inset-x-0 top-full z-30 mt-2 min-w-full max-h-56 overflow-y-auto rounded-3xl border px-1 py-1 shadow-2xl ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`}>
                      {availableProducts
                        .filter((product) => {
                          const name = String(product?.name || product?.product_name || product?.productName || '').toLowerCase();
                          const query = String(formState.productId || '').toLowerCase().trim();
                          return query === '' || name.includes(query);
                        })
                        .slice(0, 8)
                        .map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              setFormState((prev) => ({ ...prev, productId: product.name || '' }));
                              setProductSuggestionsOpen(false);
                            }}
                            className={`w-full rounded-2xl px-3 py-2 text-left text-sm transition ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}
                          >
                            {product.name}
                          </button>
                        ))}
                    </div>
                  ) : null}
                </div>
                <input
                  className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none placeholder:text-slate-500 ${isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-200' : 'border-slate-200 bg-white text-slate-700'}`}
                  placeholder="Quantity"
                  value={formState.quantity}
                  onChange={(e) => {
                    setError('');
                    setFormState((prev) => ({ ...prev, quantity: e.target.value }));
                  }}
                />
                <div className="space-y-1">
                  <input
                    className={`w-full rounded-xl border px-3 py-2.5 text-base sm:text-sm outline-none placeholder:text-slate-500 ${isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-200' : 'border-slate-200 bg-white text-slate-700'}`}
                    placeholder={selectedAction === 'sale' ? 'Selling price (per unit)' : 'Cost price (per unit)'}
                    value={formState.price}
                    onChange={(e) => {
                      setError('');
                      setFormState((prev) => ({ ...prev, price: e.target.value }));
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSave}
                disabled={submitting}
                className="rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? 'Saving…' : `Save ${selectedAction === 'sale' ? 'sale' : 'restock'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showInventoryModal && editingInventoryProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm">
          <div className={`w-full max-w-xl rounded-3xl border p-6 shadow-2xl sm:p-8 ${isDarkMode ? 'border-slate-800 bg-slate-900/90 shadow-slate-950/40' : 'border-slate-200 bg-white/90 shadow-slate-200/70'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <p className={`text-sm font-semibold uppercase tracking-[0.2em] ${isDarkMode ? 'text-indigo-300' : 'text-indigo-600'}`}>Inventory</p>
                <h2 className={`text-2xl font-semibold sm:text-3xl ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{editingInventoryProduct === 'new' ? 'Add new inventory item' : 'Edit inventory item'}</h2>
              </div>
              <button
                type="button"
                onClick={closeInventoryModal}
                aria-label="Close inventory editor"
                className={`rounded-full p-2 transition ${isDarkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <input value={inventoryEditForm.name} onChange={(event) => setInventoryEditForm((prev) => ({ ...prev, name: event.target.value }))} className={`rounded-2xl border px-3 py-2.5 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-700'}`} placeholder="Product name" />
              <input type="number" min="0" step="0.01" value={inventoryEditForm.costPrice} onChange={(event) => setInventoryEditForm((prev) => ({ ...prev, costPrice: event.target.value }))} className={`rounded-2xl border px-3 py-2.5 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-700'}`} placeholder="Cost price / unit" />
              <input type="number" min="0" step="1" value={inventoryEditForm.quantity} onChange={(event) => setInventoryEditForm((prev) => ({ ...prev, quantity: event.target.value }))} className={`rounded-2xl border px-3 py-2.5 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-700'}`} placeholder="Quantity in stock" />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={closeInventoryModal} className={`rounded-2xl border px-3 py-2 text-sm font-semibold transition ${isDarkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-700 hover:bg-slate-100'}`}>
                Cancel
              </button>
              <button type="button" onClick={handleSaveInventoryEdit} disabled={submitting} className="rounded-2xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-500 disabled:hover:bg-indigo-600">{editingInventoryProduct === 'new' ? 'Create product' : 'Save changes'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 px-4 py-8 backdrop-blur-[2px]">
          <div className={`w-full max-w-xl rounded-3xl border p-6 shadow-2xl sm:p-8 ${isDarkMode ? 'border-slate-800 bg-slate-900/90 shadow-slate-950/40' : 'border-slate-200 bg-white/90 shadow-slate-200/70'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <p className={`text-sm font-semibold uppercase tracking-[0.2em] ${isDarkMode ? 'text-indigo-300' : 'text-indigo-600'}`}>{authMode === 'signup' ? 'Create Account' : 'Sign In'}</p>
                <h2 className={`text-2xl font-semibold sm:text-3xl ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{authMode === 'signup' ? 'Sign up for Supabase sync' : 'Welcome back'}</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                aria-label="Cancel"
                className={`rounded-full p-2 transition ${isDarkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
              >
                <X size={18} />
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={(e) => {
              e.preventDefault();
              if (authMode === 'signup') {
                executeSignUp();
              } else {
                executeLogin();
              }
            }}>
              {authMode === 'signup' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>First name</span>
                    <input
                      required
                      value={profileForm.firstName}
                      onChange={(event) => setProfileForm((prev) => ({ ...prev, firstName: event.target.value }))}
                      className={`w-full rounded-2xl border px-3 py-2.5 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                      placeholder="First name"
                    />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Surname</span>
                    <input
                      required
                      value={profileForm.surname}
                      onChange={(event) => setProfileForm((prev) => ({ ...prev, surname: event.target.value }))}
                      className={`w-full rounded-2xl border px-3 py-2.5 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                      placeholder="Surname"
                    />
                  </label>
                </div>
              )}

              <label className="space-y-2 text-sm">
                <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Email</span>
                <input
                  required
                  type="email"
                  value={profileForm.email}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, email: event.target.value }))}
                  className={`w-full rounded-2xl border px-3 py-2.5 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                  placeholder="your@email.com"
                />
              </label>

              {authMode === 'signup' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Default currency</span>
                    <select
                      value={profileForm.currency}
                      onChange={(event) => setProfileForm((prev) => ({ ...prev, currency: event.target.value }))}
                      className={`w-full rounded-2xl border px-3 py-2.5 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                    >
                      {currencyOptions.map((currency) => {
                        const meta = getCurrencyMeta(currency);
                        return (
                          <option key={currency} value={currency}>
                            {currency} ({meta.symbol})
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  <label className="space-y-2 text-sm">
                    <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Password</span>
                    <input
                      required
                      type="password"
                      value={profileForm.password}
                      onChange={(event) => setProfileForm((prev) => ({ ...prev, password: event.target.value }))}
                      className={`w-full rounded-2xl border px-3 py-2.5 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                      placeholder="Create password"
                    />
                  </label>
                </div>
              )}

              {authMode === 'login' && (
                <label className="space-y-2 text-sm">
                  <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Password</span>
                  <input
                    required
                    type="password"
                    value={profileForm.password}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, password: event.target.value }))}
                    className={`w-full rounded-2xl border px-3 py-2.5 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                    placeholder="Create password"
                  />
                </label>
              )}

              {authMode === 'signup' && (
                <label className="space-y-2 text-sm">
                  <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Business name (optional)</span>
                  <input
                    value={profileForm.businessName}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, businessName: event.target.value }))}
                    className={`w-full rounded-2xl border px-3 py-2.5 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                    placeholder="Your business name"
                  />
                </label>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <p className={`text-sm ${getPromptToneClasses(profileMessage, isDarkMode ? 'text-slate-400' : 'text-slate-600')}`}>{profileMessage || (authMode === 'signup' ? 'Your data will sync to Supabase.' : 'Sign in to access your synced workspace.')}</p>
                  {authMode === 'login' && (
                    <button
                      type="button"
                      onClick={openSignupFromLogin}
                      className={`text-sm font-medium underline-offset-2 hover:underline ${isDarkMode ? 'text-indigo-300' : 'text-indigo-600'}`}
                    >
                      Don't have an account? Sign up
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  {authMode === 'signup' ? 'Create Account' : 'Sign In'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
