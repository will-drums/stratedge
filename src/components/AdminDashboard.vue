<script setup lang="ts">
import {
  ref,
  reactive,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from 'vue';
import {
  useVueTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  FlexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/vue-table';
import { useForm } from '@tanstack/vue-form';
import {
  usePlatformStore,
  type LicenseRecord,
  type IndicatorItem,
} from '../stores/platformStore';
import {
  AdminProvisionSchema,
  SupportTicketSchema,
  type SupportTicketRecord,
  buildDailyRevenueGrowthSeries,
  computeRevenuePeriodMetrics,
  computeCustomerLicenseDistribution,
  filterSupportTickets,
} from '../utils/fulfillment';
import { DailyRevenueRechartsMount } from '../utils/rechartsMount';

const emit = defineEmits<{
  (e: 'navigate', view: 'storefront' | 'checkout' | 'dashboard' | 'admin'): void;
}>();

const store = usePlatformStore();

// Admin Dashboard 7-Tab Enterprise Navigation
const activeAdminTab = ref<
  | 'sales'
  | 'tickets'
  | 'catalog'
  | 'licenses'
  | 'customers'
  | 'customization'
  | 'webhooks'
>('sales');

// ============================================================================
// 1. DAILY REVENUE GROWTH CHART (RECHARTS) WITH INTERACTIVE TIME-RANGE FILTERING
// ============================================================================
const revenueRangeDays = ref<7 | 14 | 30 | 90 | 180>(14);
const revenueStartDate = ref('');
const revenueEndDate = ref('');
const revenueTierSlice = ref<'All' | 'Monthly' | 'Annual' | 'Lifetime'>('All');
const revenueIndicatorSlice = ref('All');
const revenueChartMode = ref<'combined' | 'daily' | 'cumulative'>('combined');
const showMovingAverage = ref(true);
const enableBrushZoom = ref(false);
const rechartsContainerRef = ref<HTMLElement | null>(null);
const rechartsMounter = new DailyRevenueRechartsMount();

function selectPresetRange(days: 7 | 14 | 30 | 90 | 180) {
  revenueRangeDays.value = days;
  revenueStartDate.value = '';
  revenueEndDate.value = '';
  if (days >= 90) {
    enableBrushZoom.value = true;
  }
}

function resetRevenueFilters() {
  revenueRangeDays.value = 14;
  revenueStartDate.value = '';
  revenueEndDate.value = '';
  revenueTierSlice.value = 'All';
  revenueIndicatorSlice.value = 'All';
  revenueChartMode.value = 'combined';
  showMovingAverage.value = true;
  enableBrushZoom.value = false;
}

const hasActiveCustomRevenueFilter = computed(
  () =>
    Boolean(revenueStartDate.value) ||
    Boolean(revenueEndDate.value) ||
    revenueTierSlice.value !== 'All' ||
    revenueIndicatorSlice.value !== 'All'
);

const dailyRevenueSeries = computed(() => {
  // When custom dates are set, generate a 180-day historical horizon so custom date slices have full data
  const baseHorizon =
    revenueStartDate.value || revenueEndDate.value
      ? Math.max(revenueRangeDays.value, 180)
      : revenueRangeDays.value;

  return buildDailyRevenueGrowthSeries(store.allLicenses, baseHorizon, {
    startDate: revenueStartDate.value,
    endDate: revenueEndDate.value,
    billingCycle: revenueTierSlice.value,
    indicatorId: revenueIndicatorSlice.value,
  });
});

const periodRevenueMetrics = computed(() =>
  computeRevenuePeriodMetrics(dailyRevenueSeries.value)
);

const dailyRevenueHighlights = computed(() => {
  const m = periodRevenueMetrics.value;
  return {
    latestDaily: m.latestDailyRevenue,
    averageDaily: m.averageDailyRevenue,
    peakDaily: m.peakDailyRevenue,
    peakDateLabel: m.peakDateLabel,
    periodGrowthPct: m.periodGrowthPct,
    cumulativeTotal: m.periodTotalRevenue,
    totalOrders: m.totalOrders,
    daysInPeriod: m.daysInPeriod,
    activeWindowLabel:
      dailyRevenueSeries.value.length > 0
        ? `${dailyRevenueSeries.value[0].dateLabel} → ${
            dailyRevenueSeries.value[dailyRevenueSeries.value.length - 1].dateLabel
          }`
        : '—',
  };
});

function syncRechartsView() {
  if (activeAdminTab.value === 'sales' && rechartsContainerRef.value) {
    rechartsMounter.mount(rechartsContainerRef.value, {
      data: dailyRevenueSeries.value,
      chartMode: revenueChartMode.value,
      showMovingAverage: showMovingAverage.value,
      enableBrush: enableBrushZoom.value,
    });
  } else {
    rechartsMounter.unmount();
  }
}

watch(
  [
    activeAdminTab,
    dailyRevenueSeries,
    revenueChartMode,
    showMovingAverage,
    enableBrushZoom,
  ],
  async () => {
    await nextTick();
    syncRechartsView();
  },
  { deep: true }
);

onMounted(async () => {
  await nextTick();
  syncRechartsView();
});

onBeforeUnmount(() => {
  rechartsMounter.unmount();
});

// ============================================================================
// 2. CUSTOMER LICENSE DISTRIBUTION ANALYTICS
// ============================================================================
const licenseDistribution = computed(() =>
  computeCustomerLicenseDistribution(store.allLicenses)
);

// ============================================================================
// 3. TOTAL SALES DATA TABLE (TANSTACK TABLE)
// ============================================================================
const licenseFilter = ref('');
const salesTierFilter = ref<'ALL' | 'Lifetime' | 'Annual' | 'Monthly'>('ALL');
const sorting = ref<SortingState>([{ id: 'amountPaid', desc: true }]);

const filteredSalesData = computed(() => {
  if (salesTierFilter.value === 'ALL') {
    return store.allLicenses;
  }
  return store.allLicenses.filter(
    (lic) => lic.billingCycle === salesTierFilter.value
  );
});

const filteredSalesRevenueSum = computed(() =>
  filteredSalesData.value.reduce((acc, lic) => acc + lic.amountPaid, 0)
);

const columnHelper = createColumnHelper<LicenseRecord>();

const licenseColumns = [
  columnHelper.accessor('licenseKey', {
    header: 'Order / License Key',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('customerName', {
    header: 'Customer',
    cell: (info) => `${info.getValue()} (${info.row.original.customerEmail})`,
  }),
  columnHelper.accessor('indicatorName', {
    header: 'Provisioned Model',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('tradingViewUsername', {
    header: 'TradingView Handle',
    cell: (info) => `@${info.getValue()}`,
  }),
  columnHelper.accessor('billingCycle', {
    header: 'License Tier',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('amountPaid', {
    header: 'Sale Revenue (USD)',
    cell: (info) => `$${info.getValue().toLocaleString()}`,
  }),
  columnHelper.accessor('tosDownloadCount', {
    header: 'TOS .ts Pulls',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('tvAccessStatus', {
    header: 'ACL Status',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('provisionedAt', {
    header: 'Sale Date',
    cell: (info) => info.getValue(),
  }),
];

const adminTable = useVueTable({
  get data() {
    return filteredSalesData.value;
  },
  columns: licenseColumns,
  state: {
    get sorting() {
      return sorting.value;
    },
    get globalFilter() {
      return licenseFilter.value;
    },
  },
  onSortingChange: (updater) => {
    sorting.value =
      typeof updater === 'function' ? updater(sorting.value) : updater;
  },
  onGlobalFilterChange: (updater) => {
    licenseFilter.value =
      typeof updater === 'function' ? updater(licenseFilter.value) : updater;
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
});

async function toggleLicenseStatus(lic: LicenseRecord) {
  const res = await fetch('/api/admin/toggle-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ licenseId: lic.id }),
  });
  if (res.ok) {
    const data = await res.json();
    await store.fetchAllData();
    store.showNotification(
      'info',
      `License ${lic.licenseKey} Updated`,
      `TradingView Invite-Only ACL status set to ${data.tvAccessStatus} for @${lic.tradingViewUsername}.`
    );
  }
}

async function inspectCustomerVault(email: string) {
  await store.switchCustomerProfile(email);
  emit('navigate', 'dashboard');
}

// ============================================================================
// SALES REPORT EXPORT UTILITIES (CSV & JSON)
// ============================================================================
function exportSalesReportCsv() {
  const rows = [
    [
      'License Key',
      'Customer Name',
      'Customer Email',
      'Indicator Product',
      'Billing Tier',
      'Amount Paid (USD)',
      'TradingView Handle',
      'ACL Status',
      'TOS Downloads',
      'Provisioned At',
      'Expires At',
    ],
    ...store.allLicenses.map((lic) => [
      lic.licenseKey,
      `"${lic.customerName.replace(/"/g, '""')}"`,
      lic.customerEmail,
      `"${lic.indicatorName.replace(/"/g, '""')}"`,
      lic.billingCycle,
      String(lic.amountPaid),
      lic.tradingViewUsername,
      lic.tvAccessStatus,
      String(lic.tosDownloadCount),
      lic.provisionedAt,
      lic.expiresAt,
    ]),
  ];

  const csvContent = rows.map((r) => r.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `StratEdge_Algo_Sales_Report_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  store.showNotification(
    'success',
    'Sales Report CSV Exported',
    `Downloaded ${store.allLicenses.length} license records ($${store.salesReport.totalRevenue.toLocaleString()} gross volume).`
  );
}

function exportSalesReportJson() {
  const payload = {
    generatedAt: new Date().toISOString(),
    brand: 'StratEdge Algo (stratedgealgo.com)',
    executiveSummary: store.salesReport,
    dailyRevenueSeries: dailyRevenueSeries.value,
    customerLicenseDistribution: licenseDistribution.value,
    licensesLedger: store.allLicenses,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `StratEdge_Algo_Executive_Ledger_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  store.showNotification(
    'success',
    'Executive JSON Ledger Exported',
    'Full revenue analytics, daily revenue growth series, and license entitlement ledger downloaded.'
  );
}

// ============================================================================
// PRODUCT CATALOG MANAGER: CREATE NEW INDICATOR OR EDIT EXISTING
// ============================================================================
const catalogFormMode = ref<'create' | 'edit'>('create');

const newProductForm = reactive({
  name: '',
  category: 'Gamma Exposure & Dealer Positioning',
  tagline: 'Institutional Quantitative Execution & Order-Flow Model',
  priceMonthly: 229,
  priceAnnual: 1690,
  priceLifetime: 2890,
  version: 'v5.4.0',
  winRatePct: 79.4,
  profitFactor: 3.12,
  sharpeRatio: 3.35,
  maxDrawdownPct: 3.8,
  markets: 'ES, NQ, SPX, QQQ, NVDA, TSLA, CL, GC',
  timeframes: '1m, 5m, 15m, 1H, 4H, Daily',
  description:
    'Non-repainting institutional volatility & dealer positioning model engineered for TradingView Pine Script v6 and Charles Schwab thinkorswim.',
  thinkScriptCode: `# StratEdge Algo — Custom Institutional Study
declare upper;
input sensitivity = 2.25;
def vwapBasis = reference VWAP();
plot InstitutionalAnchor = vwapBasis;
InstitutionalAnchor.SetDefaultColor(Color.UPTICK);`,
  pineScriptPreview: `//@version=6
indicator("StratEdge Custom Institutional Model", overlay=true)
float basis = ta.vwap(hlc3)
plot(basis, "Institutional Anchor", color=color.new(#10B981, 0), linewidth=2)`,
});

const creatingProduct = ref(false);
const createProductError = ref('');

async function handleCreateNewIndicator() {
  createProductError.value = '';
  if (!newProductForm.name || newProductForm.name.trim().length < 3) {
    createProductError.value =
      'Please enter an indicator name (at least 3 characters).';
    return;
  }

  creatingProduct.value = true;
  try {
    const res = await fetch('/api/admin/create-indicator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProductForm),
    });
    const data = await res.json();
    if (!res.ok) {
      createProductError.value = data.error || 'Failed to create indicator.';
      return;
    }

    await store.fetchAllData();
    store.showNotification(
      'success',
      `Published New Indicator: ${data.indicator.name}`,
      `Now live on the Storefront & Checkout ($${data.indicator.priceMonthly}/mo · $${data.indicator.priceAnnual}/yr · $${data.indicator.priceLifetime} life).`
    );
    newProductForm.name = '';
  } finally {
    creatingProduct.value = false;
  }
}

const editingProduct = reactive<{
  id: string;
  name: string;
  tagline: string;
  category: string;
  priceMonthly: number;
  priceAnnual: number;
  priceLifetime: number;
  version: string;
  winRatePct: number;
  profitFactor: number;
  sharpeRatio: number;
  markets: string;
  timeframes: string;
}>({
  id: '',
  name: '',
  tagline: '',
  category: 'Gamma Exposure & Dealer Positioning',
  priceMonthly: 199,
  priceAnnual: 1490,
  priceLifetime: 2490,
  version: 'v5.4.0',
  winRatePct: 76.4,
  profitFactor: 2.8,
  sharpeRatio: 3.1,
  markets: 'ES, NQ, SPX, QQQ, NVDA',
  timeframes: '1m, 5m, 15m, 1H, Daily',
});
const savingProduct = ref(false);

function selectProductForEdit(ind: IndicatorItem) {
  catalogFormMode.value = 'edit';
  editingProduct.id = ind.id;
  editingProduct.name = ind.name;
  editingProduct.tagline = ind.tagline;
  editingProduct.category = ind.category;
  editingProduct.priceMonthly = ind.priceMonthly;
  editingProduct.priceAnnual = ind.priceAnnual;
  editingProduct.priceLifetime = ind.priceLifetime;
  editingProduct.version = ind.version;
  editingProduct.winRatePct = ind.winRatePct;
  editingProduct.profitFactor = ind.profitFactor;
  editingProduct.sharpeRatio = ind.sharpeRatio;
  editingProduct.markets = ind.markets;
  editingProduct.timeframes = ind.timeframes;
}

async function saveProductPricing() {
  if (!editingProduct.id) return;
  savingProduct.value = true;
  try {
    const res = await fetch('/api/admin/update-indicator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        indicatorId: editingProduct.id,
        name: editingProduct.name,
        tagline: editingProduct.tagline,
        category: editingProduct.category,
        priceMonthly: Number(editingProduct.priceMonthly),
        priceAnnual: Number(editingProduct.priceAnnual),
        priceLifetime: Number(editingProduct.priceLifetime),
        version: editingProduct.version,
        winRatePct: Number(editingProduct.winRatePct),
        profitFactor: Number(editingProduct.profitFactor),
        sharpeRatio: Number(editingProduct.sharpeRatio),
        markets: editingProduct.markets,
        timeframes: editingProduct.timeframes,
      }),
    });
    if (res.ok) {
      await store.fetchAllData();
      store.showNotification(
        'success',
        `Updated ${editingProduct.name}`,
        `Storefront catalog pricing ($${editingProduct.priceMonthly}/mo · $${editingProduct.priceAnnual}/yr · $${editingProduct.priceLifetime} life) updated live.`
      );
    }
  } finally {
    savingProduct.value = false;
  }
}

async function deleteIndicatorProduct(ind: IndicatorItem) {
  const res = await fetch('/api/admin/delete-indicator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ indicatorId: ind.id }),
  });
  const data = await res.json();
  if (!res.ok) {
    store.showNotification(
      'error',
      'Cannot Remove Indicator',
      data.error || 'Error'
    );
    return;
  }
  await store.fetchAllData();
  store.showNotification('info', 'Removed Indicator', data.message);
}

// ============================================================================
// CUSTOMIZABLE PLATFORM & STOREFRONT SETTINGS
// ============================================================================
const settingsForm = reactive({
  announcementEnabled: store.platformSettings.announcementEnabled,
  announcementBannerText: store.platformSettings.announcementBannerText,
  announcementPromoCode: store.platformSettings.announcementPromoCode,
  announcementDiscountPct: store.platformSettings.announcementDiscountPct,
  featuredIndicatorId: store.platformSettings.featuredIndicatorId,
  supportEmail: store.platformSettings.supportEmail,
  discordWebhookUrl: store.platformSettings.discordWebhookUrl,
  requireStrictTvHandleVerification:
    store.platformSettings.requireStrictTvHandleVerification,
  watermarkTosDownloads: store.platformSettings.watermarkTosDownloads,
});

watch(
  () => store.platformSettings,
  (next) => {
    settingsForm.announcementEnabled = next.announcementEnabled;
    settingsForm.announcementBannerText = next.announcementBannerText;
    settingsForm.announcementPromoCode = next.announcementPromoCode;
    settingsForm.announcementDiscountPct = next.announcementDiscountPct;
    settingsForm.featuredIndicatorId = next.featuredIndicatorId;
    settingsForm.supportEmail = next.supportEmail;
    settingsForm.discordWebhookUrl = next.discordWebhookUrl;
    settingsForm.requireStrictTvHandleVerification =
      next.requireStrictTvHandleVerification;
    settingsForm.watermarkTosDownloads = next.watermarkTosDownloads;
  },
  { deep: true, immediate: true }
);

const savingSettings = ref(false);

async function savePlatformSettings() {
  savingSettings.value = true;
  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsForm),
    });
    if (res.ok) {
      await store.fetchAllData();
      store.showNotification(
        'success',
        'Platform & Promo Settings Updated',
        `Announcement bar & promo code (${settingsForm.announcementPromoCode} · ${settingsForm.announcementDiscountPct}% off) synced across Storefront.`
      );
    }
  } finally {
    savingSettings.value = false;
  }
}

// ============================================================================
// MANUAL DESK PROVISIONING FORM (TANSTACK FORM + ZOD)
// ============================================================================
const adminFormError = ref('');
const adminSubmitting = ref(false);

const adminProvisionForm = useForm({
  defaultValues: {
    customerName: '',
    customerEmail: '',
    tradingViewUsername: '',
    indicatorId: 'se-algo-gamma',
    billingCycle: 'Annual' as 'Monthly' | 'Annual' | 'Lifetime',
  },
  onSubmit: async ({ value }) => {
    adminFormError.value = '';
    const parsed = AdminProvisionSchema.safeParse(value);
    if (!parsed.success) {
      adminFormError.value =
        parsed.error.issues[0]?.message || 'Check provisioning inputs';
      return;
    }

    adminSubmitting.value = true;
    try {
      const res = await fetch('/api/admin/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json();
      if (!res.ok) {
        adminFormError.value = data.error || 'Provisioning failed';
        return;
      }

      await store.fetchAllData();
      store.showNotification(
        'success',
        `Provisioned ${data.license.licenseKey}`,
        `Granted @${data.license.tradingViewUsername} immediate access to ${data.license.indicatorName}.`
      );
      adminProvisionForm.reset();
    } finally {
      adminSubmitting.value = false;
    }
  },
});

// ============================================================================
// SUPPORT TICKETS MANAGEMENT & DESK ESCALATION WORKFLOW
// ============================================================================
const ticketStatusFilter = ref<'All' | 'Open' | 'In Progress' | 'Resolved'>('All');
const ticketPriorityFilter = ref<'All' | 'Critical' | 'High' | 'Normal'>('All');
const ticketSearchQuery = ref('');

const filteredTickets = computed(() =>
  filterSupportTickets(store.supportTickets, {
    status: ticketStatusFilter.value,
    priority: ticketPriorityFilter.value,
    searchQuery: ticketSearchQuery.value,
  })
);

const ticketSummaryCounts = computed(() => {
  const all = store.supportTickets;
  return {
    total: all.length,
    open: all.filter((t) => t.status === 'Open').length,
    inProgress: all.filter((t) => t.status === 'In Progress').length,
    resolved: all.filter((t) => t.status === 'Resolved').length,
    criticalActive: all.filter(
      (t) => t.priority === 'Critical' && t.status !== 'Resolved'
    ).length,
  };
});

const selectedTicketId = ref<string>('tkt-9041');
const selectedTicket = computed<SupportTicketRecord | null>(() => {
  return (
    store.supportTickets.find((t) => t.id === selectedTicketId.value) ||
    filteredTickets.value[0] ||
    store.supportTickets[0] ||
    null
  );
});

const ticketUpdateForm = reactive<{
  status: 'Open' | 'In Progress' | 'Resolved';
  priority: 'Critical' | 'High' | 'Normal';
  adminResolutionNote: string;
}>({
  status: 'Open',
  priority: 'Critical',
  adminResolutionNote: '',
});

watch(
  selectedTicket,
  (tkt) => {
    if (tkt) {
      ticketUpdateForm.status = tkt.status;
      ticketUpdateForm.priority = tkt.priority;
      ticketUpdateForm.adminResolutionNote = tkt.adminResolutionNote || '';
    }
  },
  { immediate: true }
);

function selectTicketForInspection(tkt: SupportTicketRecord) {
  selectedTicketId.value = tkt.id;
  ticketUpdateForm.status = tkt.status;
  ticketUpdateForm.priority = tkt.priority;
  ticketUpdateForm.adminResolutionNote = tkt.adminResolutionNote || '';
}

const savingTicketUpdate = ref(false);

async function handleUpdateTicketStatus(
  tkt: SupportTicketRecord,
  nextStatus?: 'Open' | 'In Progress' | 'Resolved'
) {
  savingTicketUpdate.value = true;
  try {
    const payload = {
      ticketId: tkt.id,
      status: nextStatus || ticketUpdateForm.status,
      priority:
        tkt.id === selectedTicket.value?.id
          ? ticketUpdateForm.priority
          : tkt.priority,
      adminResolutionNote:
        tkt.id === selectedTicket.value?.id
          ? ticketUpdateForm.adminResolutionNote
          : tkt.adminResolutionNote,
    };

    const res = await fetch('/api/admin/tickets/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.tickets)) {
        store.supportTickets = data.tickets;
      } else {
        await store.fetchAllData();
      }
      store.showNotification(
        'success',
        `Support Ticket ${tkt.ticketNumber} Updated`,
        `Status set to ${payload.status} (${payload.priority} Priority).`
      );
    }
  } finally {
    savingTicketUpdate.value = false;
  }
}

const newTicketForm = reactive({
  customerName: '',
  customerEmail: '',
  tradingViewUsername: '',
  platformTarget: 'TradingView' as 'TradingView' | 'thinkorswim' | 'Dual-Platform',
  category: 'TradingView ACL Sync' as
    | 'TradingView ACL Sync'
    | 'thinkorswim Study Import'
    | 'License Key Re-binding'
    | 'Prop Desk Billing'
    | 'Webhook / Alert Setup',
  priority: 'High' as 'Critical' | 'High' | 'Normal',
  licenseKey: '',
  subject: '',
  description: '',
});

const creatingTicket = ref(false);
const createTicketError = ref('');

async function handleCreateSupportTicket() {
  createTicketError.value = '';
  const parsed = SupportTicketSchema.safeParse(newTicketForm);
  if (!parsed.success) {
    createTicketError.value =
      parsed.error.issues[0]?.message ||
      'Please complete all required support ticket fields.';
    return;
  }

  creatingTicket.value = true;
  try {
    const res = await fetch('/api/admin/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });
    const data = await res.json();
    if (!res.ok) {
      createTicketError.value = data.error || 'Failed to create support ticket.';
      return;
    }

    if (Array.isArray(data.tickets)) {
      store.supportTickets = data.tickets;
    } else {
      await store.fetchAllData();
    }

    if (data.ticket?.id) {
      selectedTicketId.value = data.ticket.id;
    }

    store.showNotification(
      'success',
      `Created Ticket ${data.ticket.ticketNumber}`,
      `Assigned to ${data.ticket.platformTarget} Support Queue (${data.ticket.priority}).`
    );

    newTicketForm.customerName = '';
    newTicketForm.customerEmail = '';
    newTicketForm.tradingViewUsername = '';
    newTicketForm.licenseKey = '';
    newTicketForm.subject = '';
    newTicketForm.description = '';
  } finally {
    creatingTicket.value = false;
  }
}
</script>

<template>
  <section class="workspace-shell" data-testid="admin-dashboard-root">
    <div class="container">
      <div class="workspace-header">
        <div>
          <div class="meta-line">
            <span class="meta-accent">
              StratEdge Enterprise E-Commerce, Revenue &amp; Catalog Console
            </span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span>Recharts Analytics + TanStack Table + Drizzle SQLite Ledger</span>
          </div>
          <h1 class="section-title" style="margin-top: 6px;">
            Enterprise Admin Dashboard — Sales, License Distribution &amp; Revenue Growth
          </h1>
          <p class="section-subtitle">
            Monitor daily revenue growth with interactive Recharts visualizations, inspect customer
            license distribution across tiers and models, audit total sales transactions, and manage
            storefront products.
          </p>
        </div>

        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button
            type="button"
            class="btn-secondary"
            data-testid="export-sales-csv-btn"
            @click="exportSalesReportCsv"
          >
            Export Sales CSV (.csv)
          </button>
          <button
            type="button"
            class="btn-secondary"
            data-testid="quick-open-tickets-btn"
            @click="activeAdminTab = 'tickets'"
          >
            Support Desk ({{ ticketSummaryCounts.open }} Open)
          </button>
          <button
            type="button"
            class="btn-primary"
            data-testid="quick-add-indicator-btn"
            @click="
              activeAdminTab = 'catalog';
              catalogFormMode = 'create';
            "
          >
            + Add New Indicator for Sale
          </button>
        </div>
      </div>

      <!-- Executive Operations KPI Strip -->
      <div class="kpi-strip" style="margin-top: 0; margin-bottom: 28px;">
        <div class="kpi-item">
          <span class="kpi-number">${{ store.metrics.totalRevenue.toLocaleString() }}</span>
          <span class="kpi-label">Gross E-Commerce Sales Revenue</span>
          <span class="kpi-context">
            AOV: ${{ store.salesReport.averageOrderValue.toLocaleString() }} / license
          </span>
        </div>
        <div class="kpi-item">
          <span class="kpi-number">${{ store.metrics.mrr.toLocaleString() }}/mo</span>
          <span class="kpi-label">Monthly Recurring Revenue (MRR)</span>
          <span class="kpi-context">
            ARR Run-Rate: ${{ store.salesReport.arrRunRate.toLocaleString() }}/yr
          </span>
        </div>
        <div class="kpi-item">
          <span class="kpi-number">
            {{ store.metrics.activeProvisioned }} / {{ store.metrics.totalLicenses }}
          </span>
          <span class="kpi-label">Customer License Distribution</span>
          <span class="kpi-context">
            Across {{ store.metrics.totalCustomers }} registered accounts ({{
              store.salesReport.netRetentionPct
            }}% retention)
          </span>
        </div>
        <div class="kpi-item">
          <span class="kpi-number">{{ store.metrics.totalTosDownloads }}</span>
          <span class="kpi-label">thinkorswim .ts Artifacts Pulled</span>
          <span class="kpi-context">
            {{ store.indicators.length }} active indicators · {{ ticketSummaryCounts.open }} open tickets
          </span>
        </div>
      </div>

      <!-- Admin 7-Tab Sub-Navigation -->
      <div
        style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 28px;
          flex-wrap: wrap;
        "
      >
        <div class="segmented-group" role="tablist" aria-label="Admin Dashboard Sections">
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: activeAdminTab === 'sales' }"
            data-testid="admin-tab-sales-reports"
            @click="activeAdminTab = 'sales'"
          >
            1. Sales, Distribution &amp; Daily Revenue
          </button>
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: activeAdminTab === 'tickets' }"
            data-testid="admin-tab-tickets"
            @click="activeAdminTab = 'tickets'"
          >
            2. Support Tickets ({{ store.supportTickets.length }})
          </button>
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: activeAdminTab === 'catalog' }"
            data-testid="admin-tab-catalog"
            @click="activeAdminTab = 'catalog'"
          >
            3. Add &amp; Edit Indicators ({{ store.indicators.length }})
          </button>
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: activeAdminTab === 'licenses' }"
            data-testid="admin-tab-licenses"
            @click="activeAdminTab = 'licenses'"
          >
            4. Licenses &amp; Desk Provisioning ({{ store.allLicenses.length }})
          </button>
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: activeAdminTab === 'customers' }"
            data-testid="admin-tab-customers"
            @click="activeAdminTab = 'customers'"
          >
            5. Customers &amp; Memberships ({{ store.allUsers.length }})
          </button>
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: activeAdminTab === 'customization' }"
            data-testid="admin-tab-customization"
            @click="activeAdminTab = 'customization'"
          >
            6. Storefront &amp; Promo Customization
          </button>
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: activeAdminTab === 'webhooks' }"
            data-testid="admin-tab-webhooks"
            @click="activeAdminTab = 'webhooks'"
          >
            7. Webhook Audit Ledger ({{ store.webhookLogs.length }})
          </button>
        </div>
      </div>

      <!-- ======================================================================= -->
      <!-- TAB 1: DAILY REVENUE GROWTH (RECHARTS), LICENSE DISTRIBUTION & SALES    -->
      <!-- ======================================================================= -->
      <div v-if="activeAdminTab === 'sales'" data-testid="sales-report-section">
        <!-- SECTION A: RECHARTS DAILY REVENUE GROWTH VISUALIZATION -->
        <div
          class="form-panel"
          style="margin-bottom: 32px;"
          data-testid="daily-revenue-recharts-card"
        >
          <div
            style="
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 16px;
              margin-bottom: 16px;
              flex-wrap: wrap;
            "
          >
            <div>
              <div class="meta-line">
                <span class="meta-accent">Recharts Financial Time-Series Engine</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span>Interactive Historical Sales &amp; Cumulative Growth Trajectory</span>
              </div>
              <h2
                style="
                  font-family: var(--font-display);
                  font-size: 1.35rem;
                  font-weight: 700;
                  margin-top: 4px;
                "
              >
                Daily Revenue Growth ({{ dailyRevenueHighlights.daysInPeriod }}-Day Historical Window)
              </h2>
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 2px;">
                Filter historical sales inflow by preset horizon (7D–180D), custom calendar dates,
                billing tier, or indicator model. Active window:
                <strong class="mono" style="color: var(--accent-emerald-bright);">
                  {{ dailyRevenueHighlights.activeWindowLabel }}
                </strong>
              </p>
            </div>

            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <!-- Preset Time-Range Selector (7D, 14D, 30D, 90D, 180D) -->
              <div class="segmented-group" aria-label="Revenue Timeframe Window">
                <button
                  type="button"
                  class="segmented-btn"
                  :class="{
                    active:
                      revenueRangeDays === 7 && !revenueStartDate && !revenueEndDate,
                  }"
                  data-testid="recharts-range-7d"
                  @click="selectPresetRange(7)"
                >
                  7D
                </button>
                <button
                  type="button"
                  class="segmented-btn"
                  :class="{
                    active:
                      revenueRangeDays === 14 && !revenueStartDate && !revenueEndDate,
                  }"
                  data-testid="recharts-range-14d"
                  @click="selectPresetRange(14)"
                >
                  14 Days
                </button>
                <button
                  type="button"
                  class="segmented-btn"
                  :class="{
                    active:
                      revenueRangeDays === 30 && !revenueStartDate && !revenueEndDate,
                  }"
                  data-testid="recharts-range-30d"
                  @click="selectPresetRange(30)"
                >
                  30 Days
                </button>
                <button
                  type="button"
                  class="segmented-btn"
                  :class="{
                    active:
                      revenueRangeDays === 90 && !revenueStartDate && !revenueEndDate,
                  }"
                  data-testid="recharts-range-90d"
                  @click="selectPresetRange(90)"
                >
                  90D (Quarter)
                </button>
                <button
                  type="button"
                  class="segmented-btn"
                  :class="{
                    active:
                      revenueRangeDays === 180 && !revenueStartDate && !revenueEndDate,
                  }"
                  data-testid="recharts-range-180d"
                  @click="selectPresetRange(180)"
                >
                  180D (6M)
                </button>
              </div>

              <!-- Chart Mode Selector -->
              <div class="segmented-group" aria-label="Chart Display Mode">
                <button
                  type="button"
                  class="segmented-btn"
                  :class="{ active: revenueChartMode === 'combined' }"
                  data-testid="recharts-mode-combined"
                  @click="revenueChartMode = 'combined'"
                >
                  Daily + Cumulative
                </button>
                <button
                  type="button"
                  class="segmented-btn"
                  :class="{ active: revenueChartMode === 'daily' }"
                  data-testid="recharts-mode-daily"
                  @click="revenueChartMode = 'daily'"
                >
                  Daily Bars Only
                </button>
                <button
                  type="button"
                  class="segmented-btn"
                  :class="{ active: revenueChartMode === 'cumulative' }"
                  data-testid="recharts-mode-cumulative"
                  @click="revenueChartMode = 'cumulative'"
                >
                  Cumulative Curve
                </button>
              </div>

              <button
                type="button"
                class="btn-ghost"
                data-testid="export-sales-json-btn"
                @click="exportSalesReportJson"
              >
                Export JSON Ledger (.json)
              </button>
            </div>
          </div>

          <!-- Interactive Date-Range & Cohort Slice Filter Bar -->
          <div
            data-testid="recharts-interactive-filter-bar"
            style="
              display: flex;
              align-items: flex-end;
              justify-content: space-between;
              gap: 12px;
              flex-wrap: wrap;
              padding: 12px 14px;
              margin-bottom: 18px;
              background: rgba(5, 8, 16, 0.65);
              border: 1px solid var(--border-subtle);
              border-radius: var(--radius-md);
            "
          >
            <div style="display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap;">
              <div>
                <label
                  for="recharts-start-date-input"
                  style="
                    display: block;
                    font-size: 0.72rem;
                    color: var(--text-muted);
                    margin-bottom: 4px;
                  "
                >
                  Custom Start Date
                </label>
                <input
                  id="recharts-start-date-input"
                  v-model="revenueStartDate"
                  type="date"
                  min="2026-05-05"
                  max="2026-10-31"
                  class="form-input mono"
                  data-testid="recharts-start-date"
                  style="min-height: 34px; padding: 4px 10px; font-size: 0.78rem; width: 148px;"
                />
              </div>

              <div>
                <label
                  for="recharts-end-date-input"
                  style="
                    display: block;
                    font-size: 0.72rem;
                    color: var(--text-muted);
                    margin-bottom: 4px;
                  "
                >
                  Custom End Date
                </label>
                <input
                  id="recharts-end-date-input"
                  v-model="revenueEndDate"
                  type="date"
                  min="2026-05-05"
                  max="2026-10-31"
                  class="form-input mono"
                  data-testid="recharts-end-date"
                  style="min-height: 34px; padding: 4px 10px; font-size: 0.78rem; width: 148px;"
                />
              </div>

              <div>
                <label
                  for="recharts-tier-filter-select"
                  style="
                    display: block;
                    font-size: 0.72rem;
                    color: var(--text-muted);
                    margin-bottom: 4px;
                  "
                >
                  License Tier Slice
                </label>
                <select
                  id="recharts-tier-filter-select"
                  v-model="revenueTierSlice"
                  class="form-select"
                  data-testid="recharts-tier-filter"
                  style="min-height: 34px; padding: 4px 10px; font-size: 0.78rem; width: 145px;"
                >
                  <option value="All">All Tiers</option>
                  <option value="Lifetime">Lifetime Only</option>
                  <option value="Annual">Annual Only</option>
                  <option value="Monthly">Monthly Only</option>
                </select>
              </div>

              <div>
                <label
                  for="recharts-indicator-filter-select"
                  style="
                    display: block;
                    font-size: 0.72rem;
                    color: var(--text-muted);
                    margin-bottom: 4px;
                  "
                >
                  Indicator Model Slice
                </label>
                <select
                  id="recharts-indicator-filter-select"
                  v-model="revenueIndicatorSlice"
                  class="form-select"
                  data-testid="recharts-indicator-filter"
                  style="min-height: 34px; padding: 4px 10px; font-size: 0.78rem; width: 205px;"
                >
                  <option value="All">All Storefront Indicators</option>
                  <option v-for="ind in store.indicators" :key="ind.id" :value="ind.id">
                    {{ ind.name }}
                  </option>
                </select>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <button
                type="button"
                class="btn-ghost"
                data-testid="recharts-toggle-ma"
                :style="{
                  minHeight: '34px',
                  padding: '4px 10px',
                  fontSize: '0.76rem',
                  borderColor: showMovingAverage ? 'rgba(245, 158, 11, 0.5)' : undefined,
                  color: showMovingAverage ? 'var(--accent-amber)' : undefined,
                }"
                @click="showMovingAverage = !showMovingAverage"
              >
                {{ showMovingAverage ? '7D Avg Line: ON' : '7D Avg Line: OFF' }}
              </button>

              <button
                type="button"
                class="btn-ghost"
                data-testid="recharts-toggle-brush"
                :style="{
                  minHeight: '34px',
                  padding: '4px 10px',
                  fontSize: '0.76rem',
                  borderColor: enableBrushZoom ? 'rgba(16, 185, 129, 0.5)' : undefined,
                  color: enableBrushZoom ? 'var(--accent-emerald-bright)' : undefined,
                }"
                @click="enableBrushZoom = !enableBrushZoom"
              >
                {{ enableBrushZoom ? 'Timeline Brush: ON' : 'Timeline Brush: OFF' }}
              </button>

              <button
                v-if="hasActiveCustomRevenueFilter || revenueRangeDays !== 14"
                type="button"
                class="btn-ghost"
                data-testid="recharts-reset-filter"
                style="min-height: 34px; padding: 4px 10px; font-size: 0.76rem;"
                @click="resetRevenueFilters"
              >
                Reset Range
              </button>
            </div>
          </div>

          <!-- Daily Revenue Telemetry Callouts -->
          <div
            style="
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
              gap: 14px;
              margin-bottom: 18px;
            "
          >
            <div
              data-testid="recharts-kpi-latest"
              style="
                background: rgba(5, 8, 16, 0.72);
                border: 1px solid var(--border-subtle);
                border-radius: var(--radius-md);
                padding: 12px 16px;
              "
            >
              <div style="font-size: 0.75rem; color: var(--text-muted);">
                Latest Daily Revenue
              </div>
              <div
                class="mono"
                style="
                  font-size: 1.25rem;
                  font-weight: 700;
                  color: var(--accent-sky);
                  margin-top: 4px;
                "
              >
                ${{ dailyRevenueHighlights.latestDaily.toLocaleString() }}
              </div>
            </div>

            <div
              data-testid="recharts-kpi-avg"
              style="
                background: rgba(5, 8, 16, 0.72);
                border: 1px solid var(--border-subtle);
                border-radius: var(--radius-md);
                padding: 12px 16px;
              "
            >
              <div style="font-size: 0.75rem; color: var(--text-muted);">
                Avg Daily Revenue ({{ dailyRevenueHighlights.daysInPeriod }}d)
              </div>
              <div
                class="mono"
                style="
                  font-size: 1.25rem;
                  font-weight: 700;
                  color: var(--accent-amber);
                  margin-top: 4px;
                "
              >
                ${{ dailyRevenueHighlights.averageDaily.toLocaleString() }}
              </div>
            </div>

            <div
              data-testid="recharts-kpi-peak"
              style="
                background: rgba(5, 8, 16, 0.72);
                border: 1px solid var(--border-subtle);
                border-radius: var(--radius-md);
                padding: 12px 16px;
              "
            >
              <div style="font-size: 0.75rem; color: var(--text-muted);">
                Peak Daily Sales ({{ dailyRevenueHighlights.peakDateLabel }})
              </div>
              <div
                class="mono"
                style="
                  font-size: 1.25rem;
                  font-weight: 700;
                  color: var(--text-primary);
                  margin-top: 4px;
                "
              >
                ${{ dailyRevenueHighlights.peakDaily.toLocaleString() }}
              </div>
            </div>

            <div
              data-testid="recharts-kpi-growth"
              style="
                background: rgba(5, 8, 16, 0.72);
                border: 1px solid var(--border-subtle);
                border-radius: var(--radius-md);
                padding: 12px 16px;
              "
            >
              <div style="font-size: 0.75rem; color: var(--text-muted);">
                Daily Revenue Growth ({{ dailyRevenueHighlights.daysInPeriod }}d)
              </div>
              <div
                class="mono"
                style="
                  font-size: 1.25rem;
                  font-weight: 700;
                  color: var(--accent-emerald-bright);
                  margin-top: 4px;
                "
              >
                {{ dailyRevenueHighlights.periodGrowthPct >= 0 ? '+' : '' }}{{
                  dailyRevenueHighlights.periodGrowthPct
                }}%
              </div>
            </div>

            <div
              data-testid="recharts-kpi-cumulative"
              style="
                background: rgba(5, 8, 16, 0.72);
                border: 1px solid var(--border-subtle);
                border-radius: var(--radius-md);
                padding: 12px 16px;
              "
            >
              <div style="font-size: 0.75rem; color: var(--text-muted);">
                Cumulative Period Revenue ({{ dailyRevenueHighlights.totalOrders }} orders)
              </div>
              <div
                class="mono"
                style="
                  font-size: 1.25rem;
                  font-weight: 700;
                  color: var(--accent-emerald-bright);
                  margin-top: 4px;
                "
              >
                ${{ dailyRevenueHighlights.cumulativeTotal.toLocaleString() }}
              </div>
            </div>
          </div>

          <!-- Dedicated Recharts Mount Surface -->
          <div
            ref="rechartsContainerRef"
            data-testid="daily-revenue-recharts-container"
            :style="{
              width: '100%',
              height: enableBrushZoom ? '320px' : '290px',
              background: 'rgba(5, 8, 16, 0.82)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 12px 4px 4px',
            }"
          ></div>
        </div>

        <!-- SECTION B: CUSTOMER LICENSE DISTRIBUTION (BY TIER, STATUS & INDICATOR) -->
        <div
          class="checkout-grid"
          style="margin-bottom: 32px;"
          data-testid="customer-license-distribution"
        >
          <!-- Left: Distribution by Membership Tier & ACL Status -->
          <div class="form-panel">
            <div class="meta-line">
              <span class="meta-accent">Customer License Distribution</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Cadence &amp; Entitlement Breakdown</span>
            </div>
            <h2
              style="
                font-family: var(--font-display);
                font-size: 1.25rem;
                font-weight: 700;
                margin-top: 4px;
                margin-bottom: 16px;
              "
            >
              License Distribution by Membership Tier
            </h2>

            <!-- Active Provisioned vs Revoked Summary Bar -->
            <div
              style="
                background: rgba(5, 8, 16, 0.72);
                border: 1px solid var(--border-subtle);
                border-radius: var(--radius-md);
                padding: 12px 16px;
                margin-bottom: 16px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 10px;
              "
            >
              <div>
                <div style="font-size: 0.78rem; color: var(--text-secondary);">
                  TradingView Invite-Only ACL Entitlement Health
                </div>
                <div class="mono" style="font-size: 0.92rem; font-weight: 700; margin-top: 2px;">
                  <span style="color: var(--accent-emerald-bright);">
                    {{ licenseDistribution.activeProvisioned }} Provisioned
                  </span>
                  <span style="color: var(--text-muted); margin: 0 8px;">·</span>
                  <span style="color: var(--accent-amber);">
                    {{ licenseDistribution.revokedCount }} Revoked / Paused
                  </span>
                </div>
              </div>
              <div class="mono" style="font-size: 0.85rem; color: var(--text-primary);">
                Total: <strong>{{ licenseDistribution.totalLicenses }}</strong> Licenses
              </div>
            </div>

            <div class="step-list">
              <div
                v-for="tierItem in store.salesReport.tierBreakdown"
                :key="tierItem.tier"
                class="step-item"
                style="padding: 14px 16px;"
              >
                <div
                  style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                  "
                >
                  <div>
                    <strong style="font-size: 0.95rem; color: var(--text-primary);">
                      {{ tierItem.tier }} Tier Licenses
                    </strong>
                    <span
                      class="mono"
                      style="
                        margin-left: 8px;
                        font-size: 0.78rem;
                        color: var(--text-secondary);
                      "
                    >
                      ({{ tierItem.licensesCount }} of {{ licenseDistribution.totalLicenses }} seats)
                    </span>
                  </div>
                  <div class="mono" style="font-weight: 700; color: var(--accent-emerald-bright);">
                    ${{ tierItem.grossRevenue.toLocaleString() }} ({{ tierItem.sharePct }}%)
                  </div>
                </div>
                <div
                  style="
                    width: 100%;
                    height: 7px;
                    background: rgba(148, 163, 184, 0.14);
                    border-radius: 4px;
                    overflow: hidden;
                  "
                >
                  <div
                    :style="{
                      width: `${Math.max(4, tierItem.sharePct)}%`,
                      height: '100%',
                      background:
                        tierItem.tier === 'Lifetime'
                          ? 'var(--accent-amber)'
                          : tierItem.tier === 'Annual'
                          ? 'var(--accent-emerald-bright)'
                          : 'var(--accent-sky)',
                    }"
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Customer License Distribution by Indicator Product -->
          <div class="form-panel">
            <div class="meta-line">
              <span class="meta-accent">Quantitative Model Allocation</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Active Seats per Indicator</span>
            </div>
            <h2
              style="
                font-family: var(--font-display);
                font-size: 1.25rem;
                font-weight: 700;
                margin-top: 4px;
                margin-bottom: 16px;
              "
            >
              Customer License Distribution by Indicator
            </h2>

            <div class="step-list">
              <div
                v-for="prod in store.salesReport.productBreakdown"
                :key="prod.indicatorId"
                class="step-item"
                style="padding: 12px 16px;"
              >
                <div
                  style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 6px;
                  "
                >
                  <div>
                    <strong style="font-size: 0.92rem; color: var(--text-primary);">
                      {{ prod.indicatorName }}
                    </strong>
                    <span
                      class="mono"
                      style="margin-left: 8px; font-size: 0.75rem; color: var(--text-muted);"
                    >
                      {{ prod.version }}
                    </span>
                  </div>
                  <div class="mono" style="font-size: 0.82rem; color: var(--accent-emerald-bright);">
                    {{ prod.unitsSold }} licenses · {{ prod.activeSeats }} active ACLs ({{
                      prod.revenueSharePct
                    }}%)
                  </div>
                </div>
                <div
                  style="
                    width: 100%;
                    height: 6px;
                    background: rgba(148, 163, 184, 0.14);
                    border-radius: 3px;
                    overflow: hidden;
                  "
                >
                  <div
                    :style="{
                      width: `${Math.max(5, prod.revenueSharePct)}%`,
                      height: '100%',
                      background:
                        'linear-gradient(90deg, var(--accent-emerald-bright), var(--accent-sky))',
                    }"
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- SECTION C: DATA TABLE OF TOTAL SALES (TANSTACK TABLE) -->
        <div class="table-wrapper" data-testid="total-sales-data-table">
          <div
            style="
              padding: 18px 20px;
              border-bottom: 1px solid var(--border-subtle);
              display: flex;
              justify-content: space-between;
              align-items: center;
              flex-wrap: wrap;
              gap: 14px;
            "
          >
            <div>
              <div class="meta-line">
                <span class="meta-accent">Master E-Commerce Sales Ledger</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span>{{ filteredSalesData.length }} Transactions Shown</span>
              </div>
              <h3
                style="
                  font-family: var(--font-display);
                  font-size: 1.2rem;
                  font-weight: 700;
                  margin-top: 4px;
                "
              >
                Total Sales &amp; Customer License Transactions
              </h3>
            </div>

            <div
              style="
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
              "
            >
              <!-- Tier Filter -->
              <div class="segmented-group" aria-label="Filter Sales by License Tier">
                <button
                  type="button"
                  class="segmented-btn"
                  :class="{ active: salesTierFilter === 'ALL' }"
                  data-testid="filter-sales-tier-all"
                  @click="salesTierFilter = 'ALL'"
                >
                  All ({{ store.allLicenses.length }})
                </button>
                <button
                  type="button"
                  class="segmented-btn"
                  :class="{ active: salesTierFilter === 'Lifetime' }"
                  data-testid="filter-sales-tier-lifetime"
                  @click="salesTierFilter = 'Lifetime'"
                >
                  Lifetime
                </button>
                <button
                  type="button"
                  class="segmented-btn"
                  :class="{ active: salesTierFilter === 'Annual' }"
                  data-testid="filter-sales-tier-annual"
                  @click="salesTierFilter = 'Annual'"
                >
                  Annual
                </button>
                <button
                  type="button"
                  class="segmented-btn"
                  :class="{ active: salesTierFilter === 'Monthly' }"
                  data-testid="filter-sales-tier-monthly"
                  @click="salesTierFilter = 'Monthly'"
                >
                  Monthly
                </button>
              </div>

              <!-- Global Search Input -->
              <div style="min-width: 250px;">
                <input
                  v-model="licenseFilter"
                  type="search"
                  class="search-input"
                  data-testid="sales-table-search-input"
                  aria-label="Search total sales table"
                  placeholder="Search order key, customer, @handle..."
                />
              </div>
            </div>
          </div>

          <table class="data-table">
            <thead>
              <tr v-for="hg in adminTable.getHeaderGroups()" :key="hg.id">
                <th
                  v-for="header in hg.headers"
                  :key="header.id"
                  class="sortable"
                  @click="header.column.getToggleSortingHandler()?.($event)"
                >
                  <FlexRender
                    v-if="!header.isPlaceholder"
                    :render="header.column.columnDef.header"
                    :props="header.getContext()"
                  />
                </th>
                <th>ACL &amp; Vault Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in adminTable.getRowModel().rows" :key="row.id">
                <td
                  v-for="cell in row.getVisibleCells()"
                  :key="cell.id"
                  :class="{
                    mono: [
                      'licenseKey',
                      'tradingViewUsername',
                      'amountPaid',
                      'tosDownloadCount',
                      'provisionedAt',
                    ].includes(cell.column.id),
                  }"
                >
                  <template v-if="cell.column.id === 'tvAccessStatus'">
                    <span
                      :style="{
                        color:
                          row.original.tvAccessStatus === 'Provisioned'
                            ? 'var(--accent-emerald-bright)'
                            : 'var(--accent-crimson)',
                        fontWeight: 600,
                      }"
                    >
                      {{ row.original.tvAccessStatus }}
                    </span>
                  </template>
                  <template v-else-if="cell.column.id === 'customerName'">
                    <div style="font-weight: 600; color: var(--text-primary);">
                      {{ row.original.customerName }}
                    </div>
                    <div class="mono" style="font-size: 0.74rem; color: var(--text-muted);">
                      {{ row.original.customerEmail }}
                    </div>
                  </template>
                  <template v-else-if="cell.column.id === 'amountPaid'">
                    <strong style="color: var(--text-primary);">
                      ${{ row.original.amountPaid.toLocaleString() }}
                    </strong>
                    <div class="mono" style="font-size: 0.72rem; color: var(--text-muted);">
                      {{ row.original.tosDownloadCount }} TOS pulls
                    </div>
                  </template>
                  <template v-else>
                    <FlexRender
                      :render="cell.column.columnDef.cell"
                      :props="cell.getContext()"
                    />
                  </template>
                </td>
                <td>
                  <div style="display: flex; gap: 6px; flex-wrap: nowrap;">
                    <button
                      type="button"
                      class="btn-ghost"
                      style="padding: 4px 10px; min-height: 28px; font-size: 0.75rem;"
                      @click="toggleLicenseStatus(row.original)"
                    >
                      {{
                        row.original.tvAccessStatus === 'Provisioned'
                          ? 'Revoke ACL'
                          : 'Reinstate ACL'
                      }}
                    </button>
                    <button
                      type="button"
                      class="btn-ghost"
                      style="padding: 4px 10px; min-height: 28px; font-size: 0.75rem;"
                      @click="inspectCustomerVault(row.original.customerEmail)"
                    >
                      Vault →
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr
                style="
                  background: rgba(16, 185, 129, 0.06);
                  border-top: 1px solid var(--border-subtle);
                  font-weight: 700;
                "
              >
                <td colspan="5" style="color: var(--text-primary);">
                  Total Sales Summary ({{ filteredSalesData.length }} Licenses ·
                  {{ store.metrics.totalTosDownloads }} TOS .ts Pulls)
                </td>
                <td class="mono" style="color: var(--accent-emerald-bright);">
                  ${{ filteredSalesRevenueSum.toLocaleString() }}
                </td>
                <td colspan="2" class="mono" style="color: var(--text-secondary);">
                  AOV: ${{ store.salesReport.averageOrderValue.toLocaleString() }} · MRR: ${{
                    store.metrics.mrr.toLocaleString()
                  }}/mo
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- ======================================================================= -->
      <!-- SUPPORT TICKETS & INSTITUTIONAL DESK ESCALATION QUEUE                   -->
      <!-- Rendered both in Tab 1 (Executive Overview) and Tab 2 (Support Tickets) -->
      <!-- ======================================================================= -->
      <div
        v-if="activeAdminTab === 'sales' || activeAdminTab === 'tickets'"
        data-testid="support-tickets-section"
        style="margin-top: 32px; margin-bottom: 32px;"
      >
        <div class="form-panel" style="margin-bottom: 24px;">
          <div
            style="
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 16px;
              margin-bottom: 18px;
              flex-wrap: wrap;
            "
          >
            <div>
              <div class="meta-line">
                <span class="meta-accent">Institutional Trader Support &amp; SLA Queue</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span>TradingView ACL · thinkorswim Study Import · Prop Desk Billing</span>
              </div>
              <h2
                style="
                  font-family: var(--font-display);
                  font-size: 1.35rem;
                  font-weight: 700;
                  margin-top: 4px;
                "
              >
                Support Tickets &amp; Technical Fulfillment Desk
              </h2>
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 2px;">
                Track, triage, and resolve customer support tickets across TradingView Invite-Only
                ACL syncs, Charles Schwab thinkorswim `.ts` study imports, and license re-bindings.
              </p>
            </div>

            <!-- Support Ticket SLA Summary Strip -->
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
              <div
                style="
                  background: rgba(5, 8, 16, 0.72);
                  border: 1px solid var(--border-subtle);
                  border-radius: var(--radius-md);
                  padding: 8px 14px;
                "
              >
                <div style="font-size: 0.72rem; color: var(--text-muted);">Open Queue</div>
                <div
                  class="mono"
                  data-testid="support-tickets-open-count"
                  style="font-size: 1.1rem; font-weight: 700; color: var(--accent-amber);"
                >
                  {{ ticketSummaryCounts.open }}
                </div>
              </div>

              <div
                style="
                  background: rgba(5, 8, 16, 0.72);
                  border: 1px solid var(--border-subtle);
                  border-radius: var(--radius-md);
                  padding: 8px 14px;
                "
              >
                <div style="font-size: 0.72rem; color: var(--text-muted);">In Progress</div>
                <div
                  class="mono"
                  data-testid="support-tickets-progress-count"
                  style="font-size: 1.1rem; font-weight: 700; color: var(--accent-sky);"
                >
                  {{ ticketSummaryCounts.inProgress }}
                </div>
              </div>

              <div
                style="
                  background: rgba(5, 8, 16, 0.72);
                  border: 1px solid var(--border-subtle);
                  border-radius: var(--radius-md);
                  padding: 8px 14px;
                "
              >
                <div style="font-size: 0.72rem; color: var(--text-muted);">Resolved</div>
                <div
                  class="mono"
                  data-testid="support-tickets-resolved-count"
                  style="font-size: 1.1rem; font-weight: 700; color: var(--accent-emerald-bright);"
                >
                  {{ ticketSummaryCounts.resolved }}
                </div>
              </div>

              <div
                style="
                  background: rgba(5, 8, 16, 0.72);
                  border: 1px solid var(--border-subtle);
                  border-radius: var(--radius-md);
                  padding: 8px 14px;
                "
              >
                <div style="font-size: 0.72rem; color: var(--text-muted);">Critical Active</div>
                <div
                  class="mono"
                  style="font-size: 1.1rem; font-weight: 700; color: var(--accent-crimson);"
                >
                  {{ ticketSummaryCounts.criticalActive }}
                </div>
              </div>
            </div>
          </div>

          <!-- Ticket Filter & Search Toolbar -->
          <div
            style="
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 12px;
              margin-bottom: 16px;
              flex-wrap: wrap;
            "
          >
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <div class="segmented-group" aria-label="Filter Tickets by Status">
                <button
                  type="button"
                  class="segmented-btn"
                  :class="{ active: ticketStatusFilter === 'All' }"
                  data-testid="ticket-filter-status-all"
                  @click="ticketStatusFilter = 'All'"
                >
                  All ({{ store.supportTickets.length }})
                </button>
                <button
                  type="button"
                  class="segmented-btn"
                  :class="{ active: ticketStatusFilter === 'Open' }"
                  data-testid="ticket-filter-status-open"
                  @click="ticketStatusFilter = 'Open'"
                >
                  Open ({{ ticketSummaryCounts.open }})
                </button>
                <button
                  type="button"
                  class="segmented-btn"
                  :class="{ active: ticketStatusFilter === 'In Progress' }"
                  data-testid="ticket-filter-status-progress"
                  @click="ticketStatusFilter = 'In Progress'"
                >
                  In Progress ({{ ticketSummaryCounts.inProgress }})
                </button>
                <button
                  type="button"
                  class="segmented-btn"
                  :class="{ active: ticketStatusFilter === 'Resolved' }"
                  data-testid="ticket-filter-status-resolved"
                  @click="ticketStatusFilter = 'Resolved'"
                >
                  Resolved ({{ ticketSummaryCounts.resolved }})
                </button>
              </div>

              <select
                v-model="ticketPriorityFilter"
                class="form-select"
                aria-label="Filter Tickets by Priority"
                data-testid="ticket-filter-priority"
                style="min-height: 36px; padding: 6px 12px; font-size: 0.8rem; width: 165px;"
              >
                <option value="All">All Priorities</option>
                <option value="Critical">Critical Priority</option>
                <option value="High">High Priority</option>
                <option value="Normal">Normal Priority</option>
              </select>
            </div>

            <div style="max-width: 320px; width: 100%;">
              <input
                v-model="ticketSearchQuery"
                type="search"
                class="search-input"
                aria-label="Search support tickets"
                data-testid="ticket-search-input"
                placeholder="Search TKT-#, trader, @handle, license..."
              />
            </div>
          </div>

          <!-- Support Tickets Table -->
          <div class="table-wrapper" data-testid="support-tickets-table">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Ticket #</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Trader &amp; Handle</th>
                  <th>Platform &amp; Category</th>
                  <th>Subject &amp; License Reference</th>
                  <th>Desk Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="tkt in filteredTickets"
                  :key="tkt.id"
                  :data-testid="`ticket-row-${tkt.ticketNumber}`"
                  :style="{
                    background:
                      selectedTicket?.id === tkt.id
                        ? 'rgba(16, 185, 129, 0.06)'
                        : undefined,
                  }"
                >
                  <td class="mono" style="font-weight: 700; color: var(--text-primary);">
                    {{ tkt.ticketNumber }}
                  </td>
                  <td class="mono">
                    <span
                      :style="{
                        color:
                          tkt.priority === 'Critical'
                            ? 'var(--accent-crimson)'
                            : tkt.priority === 'High'
                            ? 'var(--accent-amber)'
                            : 'var(--text-secondary)',
                        fontWeight: 600,
                      }"
                    >
                      {{ tkt.priority }}
                    </span>
                  </td>
                  <td class="mono">
                    <span
                      :style="{
                        color:
                          tkt.status === 'Resolved'
                            ? 'var(--accent-emerald-bright)'
                            : tkt.status === 'In Progress'
                            ? 'var(--accent-sky)'
                            : 'var(--accent-amber)',
                        fontWeight: 600,
                      }"
                    >
                      {{ tkt.status }}
                    </span>
                  </td>
                  <td>
                    <div style="font-weight: 600; color: var(--text-primary);">
                      {{ tkt.customerName }}
                    </div>
                    <div class="mono" style="font-size: 0.74rem; color: var(--text-muted);">
                      @{{ tkt.tradingViewUsername }} · {{ tkt.customerEmail }}
                    </div>
                  </td>
                  <td>
                    <div style="font-weight: 600; color: var(--text-primary);">
                      {{ tkt.category }}
                    </div>
                    <div class="mono" style="font-size: 0.74rem; color: var(--accent-sky);">
                      {{ tkt.platformTarget }}
                    </div>
                  </td>
                  <td>
                    <div style="font-weight: 600; color: var(--text-primary);">
                      {{ tkt.subject }}
                    </div>
                    <div class="mono" style="font-size: 0.73rem; color: var(--text-muted);">
                      License: {{ tkt.licenseKey || 'N/A' }} · {{ tkt.createdAt }}
                    </div>
                    <div
                      v-if="tkt.adminResolutionNote"
                      style="
                        font-size: 0.76rem;
                        color: var(--accent-emerald-bright);
                        margin-top: 3px;
                      "
                    >
                      Desk Note: {{ tkt.adminResolutionNote }}
                    </div>
                  </td>
                  <td>
                    <div style="display: flex; gap: 6px; flex-wrap: nowrap;">
                      <button
                        type="button"
                        class="btn-ghost"
                        style="padding: 4px 10px; min-height: 28px; font-size: 0.74rem;"
                        :data-testid="`inspect-ticket-btn-${tkt.ticketNumber}`"
                        @click="selectTicketForInspection(tkt)"
                      >
                        Inspect / Reply
                      </button>
                      <button
                        v-if="tkt.status !== 'Resolved'"
                        type="button"
                        class="btn-ghost"
                        style="
                          padding: 4px 10px;
                          min-height: 28px;
                          font-size: 0.74rem;
                          color: var(--accent-emerald-bright);
                        "
                        :data-testid="`resolve-ticket-btn-${tkt.ticketNumber}`"
                        @click="handleUpdateTicketStatus(tkt, 'Resolved')"
                      >
                        Mark Resolved
                      </button>
                      <button
                        v-else
                        type="button"
                        class="btn-ghost"
                        style="padding: 4px 10px; min-height: 28px; font-size: 0.74rem;"
                        @click="handleUpdateTicketStatus(tkt, 'In Progress')"
                      >
                        Reopen
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Two-Column Support Desk Operations: Left = Create New Support Ticket, Right = Inspect & Resolve Selected Ticket -->
        <div class="checkout-grid">
          <!-- Left Panel: Create / Add New Support Ticket -->
          <form
            class="form-panel"
            data-testid="create-support-ticket-form"
            @submit.prevent="handleCreateSupportTicket"
          >
            <div class="meta-line">
              <span class="meta-accent">New Support Ticket Dispatch</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Zod Validated · Instant Webhook Audit</span>
            </div>
            <h3
              style="
                font-family: var(--font-display);
                font-size: 1.2rem;
                font-weight: 700;
                margin-top: 6px;
                margin-bottom: 14px;
              "
            >
              + Open New Trader Support Ticket
            </h3>

            <div class="form-row-2">
              <div class="form-field">
                <label class="form-label" for="new-tkt-name">Trader / Client Name</label>
                <input
                  id="new-tkt-name"
                  v-model="newTicketForm.customerName"
                  type="text"
                  class="form-input"
                  data-testid="new-ticket-name-input"
                  placeholder="e.g. Liam O'Connor"
                />
              </div>
              <div class="form-field">
                <label class="form-label" for="new-tkt-email">Customer Email</label>
                <input
                  id="new-tkt-email"
                  v-model="newTicketForm.customerEmail"
                  type="email"
                  class="form-input"
                  data-testid="new-ticket-email-input"
                  placeholder="l.oconnor@dublinprop.ie"
                />
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-field">
                <label class="form-label" for="new-tkt-handle">
                  TradingView Handle / TOS ID
                </label>
                <input
                  id="new-tkt-handle"
                  v-model="newTicketForm.tradingViewUsername"
                  type="text"
                  class="form-input mono"
                  data-testid="new-ticket-handle-input"
                  placeholder="Liam_DublinES"
                />
              </div>
              <div class="form-field">
                <label class="form-label" for="new-tkt-license">
                  License Key Reference (Optional)
                </label>
                <input
                  id="new-tkt-license"
                  v-model="newTicketForm.licenseKey"
                  type="text"
                  class="form-input mono"
                  data-testid="new-ticket-license-input"
                  placeholder="SE-GAMM-8841-A7F2"
                />
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-field">
                <label class="form-label" for="new-tkt-platform">Platform Target</label>
                <select
                  id="new-tkt-platform"
                  v-model="newTicketForm.platformTarget"
                  class="form-select"
                  data-testid="new-ticket-platform-select"
                >
                  <option value="TradingView">TradingView (Pine Script v6)</option>
                  <option value="thinkorswim">Charles Schwab thinkorswim (.ts)</option>
                  <option value="Dual-Platform">Dual-Platform (TV + TOS)</option>
                </select>
              </div>
              <div class="form-field">
                <label class="form-label" for="new-tkt-category">Support Category</label>
                <select
                  id="new-tkt-category"
                  v-model="newTicketForm.category"
                  class="form-select"
                  data-testid="new-ticket-category-select"
                >
                  <option value="TradingView ACL Sync">TradingView ACL Sync</option>
                  <option value="thinkorswim Study Import">thinkorswim Study Import</option>
                  <option value="License Key Re-binding">License Key Re-binding</option>
                  <option value="Prop Desk Billing">Prop Desk Billing</option>
                  <option value="Webhook / Alert Setup">Webhook / Alert Setup</option>
                </select>
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-field">
                <label class="form-label" for="new-tkt-priority">SLA Priority</label>
                <select
                  id="new-tkt-priority"
                  v-model="newTicketForm.priority"
                  class="form-select"
                  data-testid="new-ticket-priority-select"
                >
                  <option value="Critical">Critical (15m Institutional SLA)</option>
                  <option value="High">High (2h Desk SLA)</option>
                  <option value="Normal">Normal (Same-Day SLA)</option>
                </select>
              </div>
              <div class="form-field">
                <label class="form-label" for="new-tkt-subject">Ticket Subject</label>
                <input
                  id="new-tkt-subject"
                  v-model="newTicketForm.subject"
                  type="text"
                  class="form-input"
                  data-testid="new-ticket-subject-input"
                  placeholder="e.g. Requesting Pine v6 ACL sync on NQ chart handle"
                />
              </div>
            </div>

            <div class="form-field">
              <label class="form-label" for="new-tkt-desc">
                Diagnostic Context &amp; Request Details
              </label>
              <textarea
                id="new-tkt-desc"
                v-model="newTicketForm.description"
                rows="3"
                class="form-input"
                data-testid="new-ticket-description-input"
                placeholder="Describe TradingView handle ACL status, thinkorswim .ts study import behavior, or license re-binding details..."
              ></textarea>
            </div>

            <div
              v-if="createTicketError"
              class="form-error"
              style="margin-bottom: 12px;"
              role="alert"
            >
              {{ createTicketError }}
            </div>

            <button
              type="submit"
              class="btn-primary"
              style="width: 100%;"
              data-testid="submit-support-ticket-btn"
              :disabled="creatingTicket"
            >
              {{
                creatingTicket
                  ? 'Dispatching Support Ticket...'
                  : 'Create & Route Support Ticket'
              }}
            </button>
          </form>

          <!-- Right Panel: Selected Ticket Inspector & Desk Resolution Console -->
          <div
            v-if="selectedTicket"
            class="form-panel"
            data-testid="ticket-resolution-panel"
          >
            <div class="meta-line">
              <span class="meta-accent">Active Ticket Inspector</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span class="mono">{{ selectedTicket.ticketNumber }}</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span class="mono">{{ selectedTicket.platformTarget }}</span>
            </div>
            <h3
              style="
                font-family: var(--font-display);
                font-size: 1.2rem;
                font-weight: 700;
                margin-top: 6px;
                margin-bottom: 10px;
              "
            >
              {{ selectedTicket.subject }}
            </h3>

            <div
              style="
                background: rgba(5, 8, 16, 0.72);
                border: 1px solid var(--border-subtle);
                border-radius: var(--radius-md);
                padding: 12px 14px;
                margin-bottom: 14px;
              "
            >
              <div
                style="
                  display: flex;
                  justify-content: space-between;
                  gap: 8px;
                  flex-wrap: wrap;
                  font-size: 0.78rem;
                  color: var(--text-muted);
                  margin-bottom: 6px;
                "
              >
                <span>
                  Trader:
                  <strong style="color: var(--text-primary);">{{
                    selectedTicket.customerName
                  }}</strong>
                  ({{ selectedTicket.customerEmail }})
                </span>
                <span class="mono" style="color: var(--accent-emerald-bright);">
                  @{{ selectedTicket.tradingViewUsername }}
                </span>
              </div>
              <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.55;">
                {{ selectedTicket.description }}
              </p>
              <div
                class="mono"
                style="font-size: 0.74rem; color: var(--text-muted); margin-top: 8px;"
              >
                License Key: {{ selectedTicket.licenseKey || 'N/A' }} · Opened:
                {{ selectedTicket.createdAt }}
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-field">
                <label class="form-label" for="upd-tkt-status">Ticket Status</label>
                <select
                  id="upd-tkt-status"
                  v-model="ticketUpdateForm.status"
                  class="form-select"
                  data-testid="ticket-update-status-select"
                >
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                </select>
              </div>
              <div class="form-field">
                <label class="form-label" for="upd-tkt-priority">SLA Priority</label>
                <select
                  id="upd-tkt-priority"
                  v-model="ticketUpdateForm.priority"
                  class="form-select"
                  data-testid="ticket-update-priority-select"
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Normal">Normal</option>
                </select>
              </div>
            </div>

            <div class="form-field">
              <label class="form-label" for="upd-tkt-note">
                Admin Resolution / Engineering Dispatch Note
              </label>
              <textarea
                id="upd-tkt-note"
                v-model="ticketUpdateForm.adminResolutionNote"
                rows="3"
                class="form-input"
                data-testid="ticket-resolution-note-input"
                placeholder="Enter ACL sync verification result, thinkorswim .ts study guidance, or billing resolution note..."
              ></textarea>
            </div>

            <button
              type="button"
              class="btn-primary"
              style="width: 100%;"
              data-testid="save-ticket-update-btn"
              :disabled="savingTicketUpdate"
              @click="handleUpdateTicketStatus(selectedTicket)"
            >
              {{
                savingTicketUpdate
                  ? 'Updating Support Ticket...'
                  : `Save Desk Response & Update ${selectedTicket.ticketNumber}`
              }}
            </button>
          </div>
        </div>
      </div>

      <!-- ======================================================================= -->
      <!-- TAB 2: ADD & EDIT INDICATORS FOR SALE (CATALOG MANAGER)                 -->
      <!-- ======================================================================= -->
      <div v-else-if="activeAdminTab === 'catalog'">
        <div
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            flex-wrap: wrap;
            gap: 12px;
          "
        >
          <div>
            <h2 style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 700;">
              Storefront Indicator Catalog &amp; Pricing Engine
            </h2>
            <p style="font-size: 0.875rem; color: var(--text-secondary);">
              Create brand-new indicators for sale or update pricing, versions, and quantitative
              backtest metrics on existing models.
            </p>
          </div>
          <div class="segmented-group">
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: catalogFormMode === 'create' }"
              data-testid="mode-create-indicator-btn"
              @click="catalogFormMode = 'create'"
            >
              + Create New Indicator for Sale
            </button>
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: catalogFormMode === 'edit' }"
              data-testid="mode-edit-indicator-btn"
              @click="
                catalogFormMode = 'edit';
                if (!editingProduct.id && store.indicators[0]) {
                  selectProductForEdit(store.indicators[0]);
                }
              "
            >
              Edit Existing Indicator Specs
            </button>
          </div>
        </div>

        <div class="checkout-grid">
          <!-- Left: Active Storefront Catalog Table -->
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Indicator Product</th>
                  <th>Version</th>
                  <th>Win Rate</th>
                  <th>Monthly</th>
                  <th>Annual</th>
                  <th>Lifetime</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="ind in store.indicators" :key="ind.id">
                  <td>
                    <div style="font-weight: 600; color: var(--text-primary);">
                      {{ ind.name }}
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">
                      {{ ind.category }}
                    </div>
                  </td>
                  <td class="mono">{{ ind.version }}</td>
                  <td class="mono" style="color: var(--accent-emerald-bright);">
                    {{ ind.winRatePct }}%
                  </td>
                  <td class="mono">${{ ind.priceMonthly }}</td>
                  <td class="mono">${{ ind.priceAnnual.toLocaleString() }}</td>
                  <td class="mono">${{ ind.priceLifetime.toLocaleString() }}</td>
                  <td>
                    <div style="display: flex; gap: 6px;">
                      <button
                        type="button"
                        class="btn-ghost"
                        style="padding: 5px 10px; min-height: 28px; font-size: 0.75rem;"
                        @click="selectProductForEdit(ind)"
                      >
                        Edit Specs
                      </button>
                      <button
                        v-if="store.indicators.length > 6"
                        type="button"
                        class="btn-ghost"
                        style="
                          padding: 5px 10px;
                          min-height: 28px;
                          font-size: 0.75rem;
                          color: var(--accent-crimson);
                        "
                        @click="deleteIndicatorProduct(ind)"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Right Panel Mode A: CREATE NEW INDICATOR FOR SALE -->
          <form
            v-if="catalogFormMode === 'create'"
            class="form-panel"
            data-testid="create-indicator-form"
            @submit.prevent="handleCreateNewIndicator"
          >
            <div class="meta-line">
              <span class="meta-accent">New Storefront Product Launch</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>TradingView + thinkorswim</span>
            </div>
            <h2
              style="
                font-family: var(--font-display);
                font-size: 1.3rem;
                font-weight: 700;
                margin-top: 6px;
                margin-bottom: 16px;
              "
            >
              Add New Indicator for Sale
            </h2>

            <div class="form-row-2">
              <div class="form-field">
                <label class="form-label" for="new-ind-name">Indicator Product Name</label>
                <input
                  id="new-ind-name"
                  v-model="newProductForm.name"
                  type="text"
                  class="form-input"
                  data-testid="new-indicator-name-input"
                  placeholder="e.g. StratEdge Algo Volatility Matrix"
                />
              </div>
              <div class="form-field">
                <label class="form-label" for="new-ind-category">Quantitative Pillar</label>
                <select
                  id="new-ind-category"
                  v-model="newProductForm.category"
                  class="form-select"
                >
                  <option value="Gamma Exposure & Dealer Positioning">
                    Gamma Exposure &amp; Dealer Positioning
                  </option>
                  <option value="Institutional Order Flow & CVD">
                    Institutional Order Flow &amp; CVD
                  </option>
                  <option value="Market Structure & Liquidity Sweeps">
                    Market Structure &amp; Liquidity Sweeps
                  </option>
                  <option value="Full Institutional Suite">Full Institutional Suite</option>
                </select>
              </div>
            </div>

            <div class="form-field">
              <label class="form-label" for="new-ind-tagline">Storefront Tagline</label>
              <input
                id="new-ind-tagline"
                v-model="newProductForm.tagline"
                type="text"
                class="form-input"
                placeholder="Real-Time Dealer Gamma Flip & Volatility Regime Engine"
              />
            </div>

            <div class="form-row-2">
              <div class="form-field">
                <label class="form-label" for="new-ind-monthly">Monthly Price (USD)</label>
                <input
                  id="new-ind-monthly"
                  v-model.number="newProductForm.priceMonthly"
                  type="number"
                  class="form-input mono"
                  data-testid="new-indicator-monthly-input"
                />
              </div>
              <div class="form-field">
                <label class="form-label" for="new-ind-annual">Annual Price (USD)</label>
                <input
                  id="new-ind-annual"
                  v-model.number="newProductForm.priceAnnual"
                  type="number"
                  class="form-input mono"
                  data-testid="new-indicator-annual-input"
                />
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-field">
                <label class="form-label" for="new-ind-lifetime">Lifetime Price (USD)</label>
                <input
                  id="new-ind-lifetime"
                  v-model.number="newProductForm.priceLifetime"
                  type="number"
                  class="form-input mono"
                  data-testid="new-indicator-lifetime-input"
                />
              </div>
              <div class="form-field">
                <label class="form-label" for="new-ind-version">Release Version</label>
                <input
                  id="new-ind-version"
                  v-model="newProductForm.version"
                  type="text"
                  class="form-input mono"
                />
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-field">
                <label class="form-label" for="new-ind-winrate">Verified Win Rate (%)</label>
                <input
                  id="new-ind-winrate"
                  v-model.number="newProductForm.winRatePct"
                  type="number"
                  step="0.1"
                  class="form-input mono"
                />
              </div>
              <div class="form-field">
                <label class="form-label" for="new-ind-pf">Profit Factor</label>
                <input
                  id="new-ind-pf"
                  v-model.number="newProductForm.profitFactor"
                  type="number"
                  step="0.01"
                  class="form-input mono"
                />
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-field">
                <label class="form-label" for="new-ind-markets">Supported Markets</label>
                <input
                  id="new-ind-markets"
                  v-model="newProductForm.markets"
                  type="text"
                  class="form-input mono"
                />
              </div>
              <div class="form-field">
                <label class="form-label" for="new-ind-tf">Supported Timeframes</label>
                <input
                  id="new-ind-tf"
                  v-model="newProductForm.timeframes"
                  type="text"
                  class="form-input mono"
                />
              </div>
            </div>

            <div
              v-if="createProductError"
              class="form-error"
              style="margin-bottom: 12px;"
              role="alert"
            >
              {{ createProductError }}
            </div>

            <button
              type="submit"
              class="btn-primary"
              style="width: 100%;"
              data-testid="submit-create-indicator-btn"
              :disabled="creatingProduct"
            >
              {{
                creatingProduct
                  ? 'Publishing Indicator to Storefront...'
                  : 'Create & Publish New Indicator for Sale'
              }}
            </button>
          </form>

          <!-- Right Panel Mode B: EDIT EXISTING INDICATOR SPECS & PRICING -->
          <form
            v-else
            class="form-panel"
            data-testid="edit-indicator-form"
            @submit.prevent="saveProductPricing"
          >
            <div class="meta-line">
              <span class="meta-accent">E-Commerce Catalog Pricing Engine</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Instant Storefront Sync</span>
            </div>
            <h2
              style="
                font-family: var(--font-display);
                font-size: 1.3rem;
                font-weight: 700;
                margin-top: 6px;
                margin-bottom: 16px;
              "
            >
              {{
                editingProduct.id
                  ? `Editing: ${editingProduct.name}`
                  : 'Select an Indicator on the Left to Edit'
              }}
            </h2>

            <div class="form-row-2">
              <div class="form-field">
                <label class="form-label">Product Display Name</label>
                <input
                  v-model="editingProduct.name"
                  type="text"
                  class="form-input"
                  :disabled="!editingProduct.id"
                />
              </div>
              <div class="form-field">
                <label class="form-label">Release Version</label>
                <input
                  v-model="editingProduct.version"
                  type="text"
                  class="form-input mono"
                  :disabled="!editingProduct.id"
                />
              </div>
            </div>

            <div class="form-field">
              <label class="form-label">Storefront Tagline</label>
              <input
                v-model="editingProduct.tagline"
                type="text"
                class="form-input"
                :disabled="!editingProduct.id"
              />
            </div>

            <div class="form-row-2">
              <div class="form-field">
                <label class="form-label">Monthly Price (USD)</label>
                <input
                  v-model.number="editingProduct.priceMonthly"
                  type="number"
                  class="form-input mono"
                  :disabled="!editingProduct.id"
                />
              </div>
              <div class="form-field">
                <label class="form-label">Annual Price (USD)</label>
                <input
                  v-model.number="editingProduct.priceAnnual"
                  type="number"
                  class="form-input mono"
                  :disabled="!editingProduct.id"
                />
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-field">
                <label class="form-label">Lifetime Price (USD)</label>
                <input
                  v-model.number="editingProduct.priceLifetime"
                  type="number"
                  class="form-input mono"
                  :disabled="!editingProduct.id"
                />
              </div>
              <div class="form-field">
                <label class="form-label">Verified Win Rate (%)</label>
                <input
                  v-model.number="editingProduct.winRatePct"
                  type="number"
                  step="0.1"
                  class="form-input mono"
                  :disabled="!editingProduct.id"
                />
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-field">
                <label class="form-label">Profit Factor</label>
                <input
                  v-model.number="editingProduct.profitFactor"
                  type="number"
                  step="0.01"
                  class="form-input mono"
                  :disabled="!editingProduct.id"
                />
              </div>
              <div class="form-field">
                <label class="form-label">Sharpe Ratio</label>
                <input
                  v-model.number="editingProduct.sharpeRatio"
                  type="number"
                  step="0.01"
                  class="form-input mono"
                  :disabled="!editingProduct.id"
                />
              </div>
            </div>

            <button
              type="submit"
              class="btn-primary"
              style="width: 100%;"
              :disabled="!editingProduct.id || savingProduct"
            >
              {{
                savingProduct
                  ? 'Updating Storefront Catalog...'
                  : 'Save Product Specs & Publish Live'
              }}
            </button>
          </form>
        </div>
      </div>

      <!-- ======================================================================= -->
      <!-- TAB 3: LICENSES TABLE + MANUAL DESK PROVISIONING                        -->
      <!-- ======================================================================= -->
      <div v-else-if="activeAdminTab === 'licenses'">
        <div style="margin-bottom: 48px;">
          <div class="table-toolbar">
            <div>
              <h2 style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 700;">
                Customer Entitlement &amp; License Directory
              </h2>
              <p style="font-size: 0.875rem; color: var(--text-secondary);">
                Powered by TanStack Table. Search by license key, customer email, or TradingView
                handle.
              </p>
            </div>

            <div style="max-width: 340px; width: 100%;">
              <input
                v-model="licenseFilter"
                type="search"
                class="search-input"
                aria-label="Search customer licenses"
                placeholder="Search license key, email, @handle..."
              />
            </div>
          </div>

          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr v-for="hg in adminTable.getHeaderGroups()" :key="hg.id">
                  <th
                    v-for="header in hg.headers"
                    :key="header.id"
                    class="sortable"
                    @click="header.column.getToggleSortingHandler()?.($event)"
                  >
                    <FlexRender
                      v-if="!header.isPlaceholder"
                      :render="header.column.columnDef.header"
                      :props="header.getContext()"
                    />
                  </th>
                  <th>ACL Control</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in adminTable.getRowModel().rows" :key="row.id">
                  <td
                    v-for="cell in row.getVisibleCells()"
                    :key="cell.id"
                    :class="{
                      mono: [
                        'licenseKey',
                        'tradingViewUsername',
                        'amountPaid',
                        'tosDownloadCount',
                        'provisionedAt',
                      ].includes(cell.column.id),
                    }"
                  >
                    <template v-if="cell.column.id === 'tvAccessStatus'">
                      <span
                        :style="{
                          color:
                            row.original.tvAccessStatus === 'Provisioned'
                              ? 'var(--accent-emerald-bright)'
                              : 'var(--accent-crimson)',
                          fontWeight: 600,
                        }"
                      >
                        {{ row.original.tvAccessStatus }}
                      </span>
                    </template>
                    <template v-else>
                      <FlexRender
                        :render="cell.column.columnDef.cell"
                        :props="cell.getContext()"
                      />
                    </template>
                  </td>
                  <td>
                    <button
                      type="button"
                      class="btn-ghost"
                      @click="toggleLicenseStatus(row.original)"
                    >
                      {{
                        row.original.tvAccessStatus === 'Provisioned'
                          ? 'Revoke ACL'
                          : 'Reinstate ACL'
                      }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Manual Desk Provisioning Form + Live Webhook Event Stream -->
        <div class="checkout-grid">
          <form
            class="form-panel"
            novalidate
            @submit.prevent.stop="adminProvisionForm.handleSubmit()"
          >
            <div class="meta-line">
              <span class="meta-accent">Direct Institutional Desk Grant</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>TanStack Form + Zod</span>
            </div>
            <h2
              style="
                font-family: var(--font-display);
                font-size: 1.3rem;
                font-weight: 700;
                margin-top: 6px;
                margin-bottom: 16px;
              "
            >
              Provision New Customer or Prop Desk Seat
            </h2>

            <adminProvisionForm.Field name="customerName">
              <template #default="{ field }">
                <div class="form-field">
                  <label :for="`adm-${field.name}`" class="form-label">
                    Customer / Trader Name
                  </label>
                  <input
                    :id="`adm-${field.name}`"
                    :value="field.state.value"
                    type="text"
                    class="form-input"
                    placeholder="e.g. Jordan Sterling"
                    @input="(e) => field.handleChange((e.target as HTMLInputElement).value)"
                  />
                </div>
              </template>
            </adminProvisionForm.Field>

            <adminProvisionForm.Field name="customerEmail">
              <template #default="{ field }">
                <div class="form-field">
                  <label :for="`adm-${field.name}`" class="form-label">Customer Email</label>
                  <input
                    :id="`adm-${field.name}`"
                    :value="field.state.value"
                    type="email"
                    class="form-input"
                    placeholder="j.sterling@citadeldesk.io"
                    @input="(e) => field.handleChange((e.target as HTMLInputElement).value)"
                  />
                </div>
              </template>
            </adminProvisionForm.Field>

            <adminProvisionForm.Field name="tradingViewUsername">
              <template #default="{ field }">
                <div class="form-field">
                  <label :for="`adm-${field.name}`" class="form-label">TradingView Username</label>
                  <input
                    :id="`adm-${field.name}`"
                    :value="field.state.value"
                    type="text"
                    class="form-input mono"
                    placeholder="Sterling_NQFlow"
                    @input="(e) => field.handleChange((e.target as HTMLInputElement).value)"
                  />
                </div>
              </template>
            </adminProvisionForm.Field>

            <div class="form-row-2">
              <adminProvisionForm.Field name="indicatorId">
                <template #default="{ field }">
                  <div class="form-field">
                    <label :for="`adm-${field.name}`" class="form-label">Indicator Model</label>
                    <select
                      :id="`adm-${field.name}`"
                      :value="field.state.value"
                      class="form-select"
                      @change="(e) => field.handleChange((e.target as HTMLSelectElement).value)"
                    >
                      <option v-for="ind in store.indicators" :key="ind.id" :value="ind.id">
                        {{ ind.name }}
                      </option>
                    </select>
                  </div>
                </template>
              </adminProvisionForm.Field>

              <adminProvisionForm.Field name="billingCycle">
                <template #default="{ field }">
                  <div class="form-field">
                    <label :for="`adm-${field.name}`" class="form-label">License Tier</label>
                    <select
                      :id="`adm-${field.name}`"
                      :value="field.state.value"
                      class="form-select"
                      @change="
                        (e) =>
                          field.handleChange(
                            (e.target as HTMLSelectElement).value as
                              | 'Monthly'
                              | 'Annual'
                              | 'Lifetime'
                          )
                      "
                    >
                      <option value="Monthly">Monthly</option>
                      <option value="Annual">Annual</option>
                      <option value="Lifetime">Lifetime</option>
                    </select>
                  </div>
                </template>
              </adminProvisionForm.Field>
            </div>

            <div
              v-if="adminFormError"
              class="form-error"
              style="margin-bottom: 12px;"
              role="alert"
            >
              {{ adminFormError }}
            </div>

            <button
              type="submit"
              class="btn-primary"
              style="width: 100%;"
              :disabled="adminSubmitting"
            >
              {{
                adminSubmitting
                  ? 'Provisioning...'
                  : 'Issue License & Whitelist TradingView Handle'
              }}
            </button>
          </form>

          <!-- Right: Recent Webhook Dispatches -->
          <div class="form-panel">
            <div class="meta-line">
              <span class="meta-accent">Automated Delivery Audit Trail</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Real-Time Webhook Ledger</span>
            </div>
            <h2
              style="
                font-family: var(--font-display);
                font-size: 1.3rem;
                font-weight: 700;
                margin-top: 6px;
                margin-bottom: 16px;
              "
            >
              Recent Fulfillment &amp; ACL Dispatches
            </h2>

            <div class="step-list">
              <div
                v-for="wh in store.webhookLogs.slice(0, 5)"
                :key="wh.id"
                class="step-item"
              >
                <div class="meta-line">
                  <span class="mono" style="color: var(--accent-emerald-bright); font-weight: 600;">
                    {{ wh.eventType }}
                  </span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span class="mono">{{ wh.licenseKey }}</span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span class="mono">{{ wh.latencyMs }}ms</span>
                </div>
                <p style="font-size: 0.875rem; color: var(--text-primary); margin-top: 4px;">
                  {{ wh.payloadSummary }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ======================================================================= -->
      <!-- TAB 4: CUSTOMERS & MEMBERSHIPS DIRECTORY                                -->
      <!-- ======================================================================= -->
      <div v-else-if="activeAdminTab === 'customers'">
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Customer Name</th>
                <th>Email Address</th>
                <th>Role</th>
                <th>TradingView Handle</th>
                <th>thinkorswim ID</th>
                <th>Active Licenses</th>
                <th>Total Spend</th>
                <th>Customer Vault</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in store.allUsers" :key="u.id">
                <td style="font-weight: 600;">{{ u.name }}</td>
                <td class="mono">{{ u.email }}</td>
                <td>
                  <span
                    class="mono"
                    :style="{
                      color:
                        u.role === 'admin'
                          ? 'var(--accent-sky)'
                          : 'var(--accent-emerald-bright)',
                    }"
                  >
                    {{ u.role.toUpperCase() }}
                  </span>
                </td>
                <td class="mono">@{{ u.tradingViewUsername }}</td>
                <td class="mono">{{ u.thinkorswimAccountId }}</td>
                <td class="mono">
                  {{
                    store.allLicenses.filter(
                      (l) => l.customerEmail.toLowerCase() === u.email.toLowerCase()
                    ).length
                  }}
                </td>
                <td class="mono" style="font-weight: 700;">
                  ${{
                    store.allLicenses
                      .filter((l) => l.customerEmail.toLowerCase() === u.email.toLowerCase())
                      .reduce((sum, l) => sum + l.amountPaid, 0)
                      .toLocaleString()
                  }}
                </td>
                <td>
                  <button
                    type="button"
                    class="btn-secondary"
                    style="padding: 6px 12px; min-height: 32px; font-size: 0.75rem;"
                    @click="inspectCustomerVault(u.email)"
                  >
                    Impersonate / Open Vault →
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ======================================================================= -->
      <!-- TAB 5: STOREFRONT & PROMO CUSTOMIZATION                                 -->
      <!-- ======================================================================= -->
      <div v-else-if="activeAdminTab === 'customization'" data-testid="customization-section">
        <div class="checkout-grid">
          <form class="form-panel" @submit.prevent="savePlatformSettings">
            <div class="meta-line">
              <span class="meta-accent">Global Storefront &amp; Campaign Controls</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Live Sync</span>
            </div>
            <h2
              style="
                font-family: var(--font-display);
                font-size: 1.3rem;
                font-weight: 700;
                margin-top: 6px;
                margin-bottom: 16px;
              "
            >
              Customize Storefront Banner, Promo Codes &amp; Security Policy
            </h2>

            <div class="form-field">
              <label
                style="
                  display: flex;
                  align-items: center;
                  gap: 10px;
                  cursor: pointer;
                  font-size: 0.9rem;
                  color: var(--text-primary);
                "
              >
                <input
                  v-model="settingsForm.announcementEnabled"
                  type="checkbox"
                  style="width: 16px; height: 16px; accent-color: #10b981;"
                />
                <span>Display Global Institutional Announcement &amp; Promo Banner</span>
              </label>
            </div>

            <div class="form-field">
              <label class="form-label" for="cfg-banner-text">Announcement Banner Copy</label>
              <input
                id="cfg-banner-text"
                v-model="settingsForm.announcementBannerText"
                type="text"
                class="form-input"
                data-testid="custom-banner-text-input"
              />
            </div>

            <div class="form-row-2">
              <div class="form-field">
                <label class="form-label" for="cfg-promo-code">Active Promo Code</label>
                <input
                  id="cfg-promo-code"
                  v-model="settingsForm.announcementPromoCode"
                  type="text"
                  class="form-input mono"
                  data-testid="custom-promo-code-input"
                />
              </div>
              <div class="form-field">
                <label class="form-label" for="cfg-promo-pct">Promo Discount (%)</label>
                <input
                  id="cfg-promo-pct"
                  v-model.number="settingsForm.announcementDiscountPct"
                  type="number"
                  min="0"
                  max="80"
                  class="form-input mono"
                />
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-field">
                <label class="form-label" for="cfg-featured-ind">Default Featured Indicator</label>
                <select
                  id="cfg-featured-ind"
                  v-model="settingsForm.featuredIndicatorId"
                  class="form-select"
                >
                  <option v-for="ind in store.indicators" :key="ind.id" :value="ind.id">
                    {{ ind.name }}
                  </option>
                </select>
              </div>
              <div class="form-field">
                <label class="form-label" for="cfg-support-email">Desk Support Email</label>
                <input
                  id="cfg-support-email"
                  v-model="settingsForm.supportEmail"
                  type="email"
                  class="form-input mono"
                />
              </div>
            </div>

            <div class="form-field">
              <label class="form-label" for="cfg-webhook-url">
                Outbound Discord / Operations Webhook Endpoint
              </label>
              <input
                id="cfg-webhook-url"
                v-model="settingsForm.discordWebhookUrl"
                type="url"
                class="form-input mono"
              />
            </div>

            <div class="form-field" style="display: flex; flex-direction: column; gap: 10px;">
              <label
                style="
                  display: flex;
                  align-items: center;
                  gap: 10px;
                  cursor: pointer;
                  font-size: 0.85rem;
                  color: var(--text-secondary);
                "
              >
                <input
                  v-model="settingsForm.watermarkTosDownloads"
                  type="checkbox"
                  style="width: 16px; height: 16px; accent-color: #10b981;"
                />
                <span>
                  Embed cryptographic customer email &amp; license key watermark in `.ts`
                  thinkorswim downloads
                </span>
              </label>
              <label
                style="
                  display: flex;
                  align-items: center;
                  gap: 10px;
                  cursor: pointer;
                  font-size: 0.85rem;
                  color: var(--text-secondary);
                "
              >
                <input
                  v-model="settingsForm.requireStrictTvHandleVerification"
                  type="checkbox"
                  style="width: 16px; height: 16px; accent-color: #10b981;"
                />
                <span>
                  Enforce strict Zod TradingView handle regex (`^[a-zA-Z0-9_]{3,25}$`) prior to ACL
                  provisioning
                </span>
              </label>
            </div>

            <button
              type="submit"
              class="btn-primary"
              style="width: 100%; margin-top: 8px;"
              data-testid="save-customization-btn"
              :disabled="savingSettings"
            >
              {{
                savingSettings
                  ? 'Syncing Storefront Configuration...'
                  : 'Save & Publish Storefront Customization'
              }}
            </button>
          </form>

          <!-- Live Preview of Customized Banner & Policy State -->
          <div class="form-panel">
            <div class="meta-line">
              <span class="meta-accent">Live Enterprise Configuration Preview</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>stratedgealgo.com</span>
            </div>
            <h2
              style="
                font-family: var(--font-display);
                font-size: 1.3rem;
                font-weight: 700;
                margin-top: 6px;
                margin-bottom: 16px;
              "
            >
              Active Storefront &amp; Fulfillment Policy
            </h2>

            <div class="step-list">
              <div class="step-item">
                <div class="meta-line">
                  <span class="mono" style="color: var(--accent-emerald-bright);">
                    ANNOUNCEMENT BAR
                  </span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span class="mono">
                    {{ settingsForm.announcementEnabled ? 'VISIBLE' : 'HIDDEN' }}
                  </span>
                </div>
                <p style="font-size: 0.875rem; color: var(--text-primary); margin-top: 6px;">
                  {{ settingsForm.announcementBannerText }}
                </p>
              </div>

              <div class="step-item">
                <div class="meta-line">
                  <span class="mono" style="color: var(--accent-amber);">PROMO ENGINE</span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span class="mono">{{ settingsForm.announcementPromoCode }}</span>
                </div>
                <p style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 6px;">
                  Grants {{ settingsForm.announcementDiscountPct }}% off at Checkout &amp;
                  Slide-Over Cart Drawer.
                </p>
              </div>

              <div class="step-item">
                <div class="meta-line">
                  <span class="mono" style="color: var(--accent-sky);">
                    FULFILLMENT SECURITY
                  </span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span class="mono">{{ settingsForm.supportEmail }}</span>
                </div>
                <p style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 6px;">
                  thinkorswim Watermarking:
                  <strong>{{
                    settingsForm.watermarkTosDownloads ? 'Enabled' : 'Disabled'
                  }}</strong>
                  · Strict TV Handle Validation:
                  <strong>{{
                    settingsForm.requireStrictTvHandleVerification ? 'Active' : 'Permissive'
                  }}</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ======================================================================= -->
      <!-- TAB 6: FULL WEBHOOK AUDIT LEDGER                                        -->
      <!-- ======================================================================= -->
      <div v-else-if="activeAdminTab === 'webhooks'">
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Event Type</th>
                <th>License Key</th>
                <th>Customer / Handle</th>
                <th>Target System</th>
                <th>Latency</th>
                <th>Payload Summary</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="wh in store.webhookLogs" :key="wh.id">
                <td class="mono" style="color: var(--accent-emerald-bright); font-weight: 600;">
                  {{ wh.eventType }}
                </td>
                <td class="mono">{{ wh.licenseKey }}</td>
                <td class="mono">@{{ wh.tradingViewUsername }}</td>
                <td>{{ wh.platformTarget }}</td>
                <td class="mono">{{ wh.latencyMs }}ms</td>
                <td>{{ wh.payloadSummary }}</td>
                <td class="mono">{{ wh.createdAt }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>
