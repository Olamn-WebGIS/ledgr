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

    if (['dashboard', 'inventory', 'pnl', 'expenses', 'settings'].includes(activeView)) {
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
      setDashboardData(refres