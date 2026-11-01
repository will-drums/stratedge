import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  calculateOrderPricing,
  buildDefaultTicketMessages,
  type SupportTicketRecord,
  type SupportTicketInput,
  type SupportTicketMessageInput,
} from '../utils/fulfillment';

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
  emailAlertsEnabled?: boolean;
  smsAlertsEnabled?: boolean;
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

export interface ProductSalesBreakdown {
  indicatorId: string;
  indicatorName: string;
  category: string;
  version: string;
  unitsSold: number;
  activeSeats: number;
  grossRevenue: number;
  revenueSharePct: number;
  tosDownloads: number;
}

export interface TierSalesBreakdown {
  tier: 'Monthly' | 'Annual' | 'Lifetime';
  licensesCount: number;
  grossRevenue: number;
  sharePct: number;
}

export interface MonthlyCohortPoint {
  month: string;
  grossRevenue: number;
  mrr: number;
  orders: number;
}

export interface SalesReportData {
  totalRevenue: number;
  mrr: number;
  arrRunRate: number;
  averageOrderValue: number;
  totalLicenses: number;
  activeProvisioned: number;
  totalTosDownloads: number;
  netRetentionPct: number;
  productBreakdown: ProductSalesBreakdown[];
  tierBreakdown: TierSalesBreakdown[];
  monthlyCohortSeries: MonthlyCohortPoint[];
}

export interface PlatformSettings {
  announcementEnabled: boolean;
  announcementBannerText: string;
  announcementPromoCode: string;
  announcementDiscountPct: number;
  featuredIndicatorId: string;
  supportEmail: string;
  discordWebhookUrl: string;
  requireStrictTvHandleVerification: boolean;
  watermarkTosDownloads: boolean;
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
  const supportTickets = ref<SupportTicketRecord[]>(
    [
      {
        id: 'tkt-9041',
        ticketNumber: 'TKT-9041',
        customerName: 'Marcus Vance',
        customerEmail: 'marcus.vance@apexquant.io',
        tradingViewUsername: 'MarcusVance_ES',
        platformTarget: 'TradingView' as const,
        category: 'TradingView ACL Sync' as const,
        priority: 'Critical' as const,
        status: 'Open' as const,
        subject: 'Sub-account Pine v6 Invite-Only ACL whitelist propagation for NQ desk terminal',
        description:
          'Upgraded to Full Institutional Bundle for our primary CME ES/NQ desk. Requesting immediate Invite-Only ACL sync verification on backup chart handle @MarcusVance_ES.',
        licenseKey: 'SE-BUND-8841-A9C2',
        adminResolutionNote:
          'Awaiting automated TradingView Pine v6 ACL verification ping on primary & backup desk handles.',
        createdAt: '2026-10-31 14:12:00 UTC',
        updatedAt: '2026-10-31 14:18:00 UTC',
      },
      {
        id: 'tkt-9039',
        ticketNumber: 'TKT-9039',
        customerName: 'Marcus Vance',
        customerEmail: 'marcus.vance@apexquant.io',
        tradingViewUsername: 'MarcusVance_ES',
        platformTarget: 'thinkorswim' as const,
        category: 'thinkorswim Study Import' as const,
        priority: 'High' as const,
        status: 'In Progress' as const,
        subject: 'thinkorswim Desktop v5.4 Cumulative Volume Delta lower study memory buffer tuning',
        description:
          'Running StratEdge_Algo_Flow_v54.ts across 6 linked CME /ES and /NQ charts on Charles Schwab thinkorswim Desktop. Seeking recommended max-bars lookback parameter to minimize JVM heap usage during RTH open.',
        licenseKey: 'SE-FLOW-4419-D8A1',
        adminResolutionNote:
          'Senior Quant Engineer Dr. Julian Vance: Set input institutionalLookbackBars = 1440 on 1-minute RTH charts to cap JVM heap allocation under 420MB while preserving full session CVD anchor parity.',
        createdAt: '2026-10-30 21:05:00 UTC',
        updatedAt: '2026-10-31 10:42:00 UTC',
      },
      {
        id: 'tkt-9038',
        ticketNumber: 'TKT-9038',
        customerName: 'Elena Rostova',
        customerEmail: 'elena.rostova@zurichprop.ch',
        tradingViewUsername: 'Elena_ZurichQuant',
        platformTarget: 'thinkorswim' as const,
        category: 'thinkorswim Study Import' as const,
        priority: 'High' as const,
        status: 'In Progress' as const,
        subject: 'Charles Schwab thinkorswim v5.4 Gamma Exposure .ts study aggregation alert',
        description:
          'Imported StratEdge_Gamma_v5_4.ts into Schwab thinkorswim desktop on 2-minute /ES chart. Need confirmation on recommended secondary aggregation period for 0DTE dealer gamma flip zones.',
        licenseKey: 'SE-GAMM-7721-B4E9',
        adminResolutionNote:
          'Assigned to Senior Quant Engineer: Provided 15-min secondary aggregation parameter preset for 0DTE SPX/ES.',
        createdAt: '2026-10-30 19:45:00 UTC',
        updatedAt: '2026-10-31 09:20:00 UTC',
      },
      {
        id: 'tkt-9035',
        ticketNumber: 'TKT-9035',
        customerName: 'Marcus Vance',
        customerEmail: 'marcus.vance@apexquant.io',
        tradingViewUsername: 'MarcusVance_ES',
        platformTarget: 'Dual-Platform' as const,
        category: 'Webhook / Alert Setup' as const,
        priority: 'Normal' as const,
        status: 'Resolved' as const,
        subject: '0DTE Zero-Gamma Flip JSON webhook signature verification for Apex execution router',
        description:
          'Configured TradingView server-side webhook alerts on SPX 1m chart using our signing token. Requesting verification of the `regime` and `invalidationAtrStop` payload fields.',
        licenseKey: 'SE-GAMM-8841-A9C2',
        adminResolutionNote:
          'Verified 38ms round-trip webhook payload delivery to your execution bridge. Confirmed `invalidationAtrStop: 1.5` and `schema: stratedge.v6.signal` match production spec.',
        createdAt: '2026-10-29 18:10:00 UTC',
        updatedAt: '2026-10-29 18:34:00 UTC',
      },
      {
        id: 'tkt-9034',
        ticketNumber: 'TKT-9034',
        customerName: 'David Chen',
        customerEmail: 'david.chen@pacificcap.com',
        tradingViewUsername: 'DChen_SwingMacro',
        platformTarget: 'Dual-Platform' as const,
        category: 'License Key Re-binding' as const,
        priority: 'Normal' as const,
        status: 'Open' as const,
        subject: 'Re-bind thinkorswim account ID after Charles Schwab institutional migration',
        description:
          'Our Pacific Cap macro desk migrated TD Ameritrade accounts to Charles Schwab Institutional ID TOS-552901. Please update watermark binding on our Liquidity Matrix license.',
        licenseKey: 'SE-LIQM-5529-C1D8',
        adminResolutionNote: '',
        createdAt: '2026-10-29 16:08:00 UTC',
        updatedAt: '2026-10-29 16:08:00 UTC',
      },
    ].map((t) => ({
      ...t,
      messages: buildDefaultTicketMessages(t),
    }))
  );
  const metrics = ref<DashboardMetrics>({
    totalRevenue: 0,
    mrr: 0,
    totalLicenses: 0,
    activeProvisioned: 0,
    totalTosDownloads: 0,
    totalCustomers: 0,
  });

  const salesReport = ref<SalesReportData>({
    totalRevenue: 0,
    mrr: 0,
    arrRunRate: 0,
    averageOrderValue: 0,
    totalLicenses: 0,
    activeProvisioned: 0,
    totalTosDownloads: 0,
    netRetentionPct: 98.4,
    productBreakdown: [],
    tierBreakdown: [],
    monthlyCohortSeries: [],
  });

  const platformSettings = ref<PlatformSettings>({
    announcementEnabled: true,
    announcementBannerText:
      'Q2 Institutional Release: StratEdge Algo v5.4 Pine v6 & thinkorswim Study Suite Live — Take 15% Off Prop Desk & Annual Licenses',
    announcementPromoCode: 'PROP15',
    announcementDiscountPct: 15,
    featuredIndicatorId: 'se-institutional-bundle',
    supportEmail: 'desk-ops@stratedgealgo.com',
    discordWebhookUrl: 'https://discord.com/api/webhooks/stratedge-desk-ops',
    requireStrictTvHandleVerification: true,
    watermarkTosDownloads: true,
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
        if (Array.isArray(dashData.supportTickets)) {
          supportTickets.value = dashData.supportTickets.map(
            (t: SupportTicketRecord) => ({
              ...t,
              messages: buildDefaultTicketMessages(t),
            })
          );
        }
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
        if (dashData.salesReport) {
          salesReport.value = dashData.salesReport;
        }
        if (dashData.platformSettings) {
          platformSettings.value = dashData.platformSettings;
        }
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

  async function submitSupportTicket(payload: SupportTicketInput) {
    const res = await fetch('/api/admin/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to submit support ticket.');
    }
    if (Array.isArray(data.tickets)) {
      supportTickets.value = data.tickets.map((t: SupportTicketRecord) => ({
        ...t,
        messages: buildDefaultTicketMessages(t),
      }));
    }
    await fetchAllData();
    return data.ticket as SupportTicketRecord;
  }

  async function sendSupportTicketMessage(payload: SupportTicketMessageInput) {
    const res = await fetch('/api/support-tickets/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to send message.');
    }
    if (Array.isArray(data.tickets)) {
      supportTickets.value = data.tickets.map((t: SupportTicketRecord) => ({
        ...t,
        messages: buildDefaultTicketMessages(t),
      }));
    }
    return data.ticket as SupportTicketRecord;
  }

  async function updateSupportTicketStatus(
    ticketId: string,
    status: 'Open' | 'In Progress' | 'Resolved',
    adminResolutionNote?: string
  ) {
    const res = await fetch('/api/admin/tickets/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketId,
        status,
        adminResolutionNote,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update ticket status.');
    }
    if (Array.isArray(data.tickets)) {
      supportTickets.value = data.tickets.map((t: SupportTicketRecord) => ({
        ...t,
        messages: buildDefaultTicketMessages(t),
      }));
    }
    return data.ticket as SupportTicketRecord;
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
    supportTickets,
    metrics,
    salesReport,
    platformSettings,
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
    submitSupportTicket,
    sendSupportTicketMessage,
    updateSupportTicketStatus,
    signOut,
  };
});
