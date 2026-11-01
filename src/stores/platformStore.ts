import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { calculateOrderPricing } from '../utils/fulfillment';

export interface IndicatorItem {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  category: string;
  platforms: string[];
  priceMonthly: number;
  priceAnnual: number;
  priceLifetime: number;
  winRatePct: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  signalsPerDay: string;
  timeframes: string;
  markets: string;
  version: string;
  tosShareLink: string;
  tosStudyFilename: string;
  tvScriptId: string;
  description: string;
  thinkScriptCode: string;
  pineScriptPreview: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: 'customer' | 'admin' | string;
  tradingViewUsername: string;
  thinkorswimAccountId: string;
  createdAt: string;
}

export interface LicenseRecord {
  id: string;
  licenseKey: string;
  userId: string;
  customerEmail: string;
  customerName: string;
  indicatorId: string;
  indicatorName: string;
  billingCycle: 'Monthly' | 'Annual' | 'Lifetime';
  amountPaid: number;
  tradingViewUsername: string;
  tvAccessStatus: 'Provisioned' | 'Pending Username' | 'Revoked';
  tosDownloadCount: number;
  tosShareLink: string;
  tosStudyFilename: string;
  provisionedAt: string;
  expiresAt: string;
}

export interface WebhookLogItem {
  id: string;
  eventType: string;
  licenseKey: string;
  customerEmail: string;
  tradingViewUsername: string;
  platformTarget: string;
  status: string;
  latencyMs: number;
  payloadSummary: string;
  createdAt: string;
}

export interface DashboardMetrics {
  totalRevenue: number;
  mrr: number;
  totalLicenses: number;
  activeProvisioned: number;
  totalTosDownloads: number;
  totalCustomers: number;
}

export interface CartItem {
  indicatorId: string;
  billingCycle: 'Monthly' | 'Annual' | 'Lifetime';
}

export const usePlatformStore = defineStore('platform', () => {
  const indicators = ref<IndicatorItem[]>([]);
  const customerLicenses = ref<LicenseRecord[]>([]);
  const allLicenses = ref<LicenseRecord[]>([]);
  const allUsers = ref<UserProfile[]>([]);
  const webhookLogs = ref<WebhookLogItem[]>([]);
  const metrics = ref<DashboardMetrics>({
    totalRevenue: 0,
    mrr: 0,
    totalLicenses: 0,
    activeProvisioned: 0,
    totalTosDownloads: 0,
    totalCustomers: 0,
  });

  const loading = ref(false);

  // Authenticated User Session State
  const isAuthenticated = ref(true);
  const activeCustomerEmail = ref('marcus.vance@apexquant.io');
  const activeCustomerName = ref('Marcus Vance');
  const activeTradingViewHandle = ref('MarcusVance_ES');
  const activeTosAccountId = ref('TOS-994182');
  const activeUserRole = ref<'customer' | 'admin'>('customer');

  // Auth Modal State
  const isAuthModalOpen = ref(false);
  const authModalTab = ref<'login' | 'register'>('login');

  // E-Commerce Shopping Cart State
  const cartItems = ref<CartItem[]>([
    {
      indicatorId: 'se-algo-gamma',
      billingCycle: 'Annual',
    },
  ]);
  const isCartDrawerOpen = ref(false);
  const cartCouponCode = ref('PROP15');

  const selectedIndicatorId = ref('se-institutional-bundle');
  const selectedBillingCycle = ref<'Monthly' | 'Annual' | 'Lifetime'>('Annual');
  const lastProvisionedLicense = ref<LicenseRecord | null>(null);
  const notificationBanner = ref<{
    type: 'success' | 'error' | 'info';
    title: string;
    detail: string;
  } | null>(null);

  const selectedIndicator = computed(() => {
    return (
      indicators.value.find((i) => i.id === selectedIndicatorId.value) ||
      indicators.value[0] ||
      null
    );
  });

  // Detailed Cart Items with pricing breakdown
  const detailedCartItems = computed(() => {
    return cartItems.value
      .map((ci, index) => {
        const ind = indicators.value.find((i) => i.id === ci.indicatorId);
        if (!ind) return null;
        const pricing = calculateOrderPricing(
          {
            monthly: ind.priceMonthly,
            annual: ind.priceAnnual,
            lifetime: ind.priceLifetime,
          },
          ci.billingCycle,
          cartCouponCode.value
        );
        return {
          index,
          indicator: ind,
          billingCycle: ci.billingCycle,
          basePrice: pricing.basePrice,
          discountPct: pricing.discountPct,
          discountAmount: pricing.discountAmount,
          finalPrice: pricing.finalPrice,
          expiresAt: pricing.expiresAt,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  });

  const cartTotals = computed(() => {
    const subtotal = detailedCartItems.value.reduce((acc, i) => acc + i.basePrice, 0);
    const discountTotal = detailedCartItems.value.reduce(
      (acc, i) => acc + i.discountAmount,
      0
    );
    const finalTotal = detailedCartItems.value.reduce((acc, i) => acc + i.finalPrice, 0);
    return {
      subtotal,
      discountTotal,
      finalTotal,
      itemCount: detailedCartItems.value.length,
    };
  });

  function showNotification(
    type: 'success' | 'error' | 'info',
    title: string,
    detail: string
  ) {
    notificationBanner.value = { type, title, detail };
    setTimeout(() => {
      if (notificationBanner.value?.title === title) {
        notificationBanner.value = null;
      }
    }, 7000);
  }

  function openAuthModal(tab: 'login' | 'register' = 'login') {
    authModalTab.value = tab;
    isAuthModalOpen.value = true;
  }

  function addToCart(
    indicatorId: string,
    billingCycle: 'Monthly' | 'Annual' | 'Lifetime' = 'Annual',
    openDrawer = true
  ) {
    const existingIdx = cartItems.value.findIndex(
      (c) => c.indicatorId === indicatorId
    );
    if (existingIdx >= 0) {
      cartItems.value[existingIdx].billingCycle = billingCycle;
    } else {
      cartItems.value.push({ indicatorId, billingCycle });
    }
    const ind = indicators.value.find((i) => i.id === indicatorId);
    showNotification(
      'success',
      `Added to Cart: ${ind?.name || indicatorId}`,
      `${billingCycle} license queued in your shopping cart.`
    );
    if (openDrawer) {
      isCartDrawerOpen.value = true;
    }
  }

  function removeFromCart(index: number) {
    cartItems.value.splice(index, 1);
  }

  function updateCartItemCycle(
    index: number,
    billingCycle: 'Monthly' | 'Annual' | 'Lifetime'
  ) {
    if (cartItems.value[index]) {
      cartItems.value[index].billingCycle = billingCycle;
    }
  }

  function clearCart() {
    cartItems.value = [];
  }

  async function fetchAllData() {
    loading.value = true;
    try {
      const [indRes, dashRes] = await Promise.all([
        fetch('/api/indicators'),
        fetch(
          `/api/dashboard?email=${encodeURIComponent(activeCustomerEmail.value)}`
        ),
      ]);
      if (indRes.ok) {
        const indData = await indRes.json();
        indicators.value = indData.indicators || [];
      }
      if (dashRes.ok) {
        const dashData = await dashRes.json();
        customerLicenses.value = dashData.customerLicenses || [];
        allLicenses.value = dashData.allLicenses || [];
        allUsers.value = dashData.allUsers || [];
        webhookLogs.value = dashData.webhookLogs || [];
        if (dashData.currentUser) {
          activeCustomerName.value = dashData.currentUser.name;
          activeTradingViewHandle.value = dashData.currentUser.tradingViewUsername;
          activeTosAccountId.value =
            dashData.currentUser.thinkorswimAccountId || 'TOS-994182';
          activeUserRole.value =
            dashData.currentUser.role === 'admin' ? 'admin' : 'customer';
        }
        metrics.value = dashData.metrics || {
          totalRevenue: 0,
          mrr: 0,
          totalLicenses: 0,
          activeProvisioned: 0,
          totalTosDownloads: 0,
          totalCustomers: 0,
        };
      }
    } finally {
      loading.value = false;
    }
  }

  async function switchCustomerProfile(email: string) {
    activeCustomerEmail.value = email;
    isAuthenticated.value = true;
    await fetchAllData();
    const matchedUser = allUsers.value.find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );
    if (matchedUser) {
      activeCustomerName.value = matchedUser.name;
      activeTradingViewHandle.value = matchedUser.tradingViewUsername;
      activeTosAccountId.value = matchedUser.thinkorswimAccountId;
      activeUserRole.value = matchedUser.role === 'admin' ? 'admin' : 'customer';
    } else {
      const matchedLic = allLicenses.value.find(
        (l) => l.customerEmail.toLowerCase() === email.toLowerCase()
      );
      if (matchedLic) {
        activeCustomerName.value = matchedLic.customerName;
        activeTradingViewHandle.value = matchedLic.tradingViewUsername;
      }
    }
  }

  function signOut() {
    isAuthenticated.value = false;
    showNotification(
      'info',
      'Signed Out',
      'You have been signed out of your StratEdge Algo session.'
    );
  }

  return {
    indicators,
    customerLicenses,
    allLicenses,
    allUsers,
    webhookLogs,
    metrics,
    loading,
    isAuthenticated,
    activeCustomerEmail,
    activeCustomerName,
    activeTradingViewHandle,
    activeTosAccountId,
    activeUserRole,
    isAuthModalOpen,
    authModalTab,
    cartItems,
    detailedCartItems,
    cartTotals,
    isCartDrawerOpen,
    cartCouponCode,
    selectedIndicatorId,
    selectedBillingCycle,
    selectedIndicator,
    lastProvisionedLicense,
    notificationBanner,
    showNotification,
    openAuthModal,
    addToCart,
    removeFromCart,
    updateCartItemCycle,
    clearCart,
    fetchAllData,
    switchCustomerProfile,
    signOut,
  };
});
