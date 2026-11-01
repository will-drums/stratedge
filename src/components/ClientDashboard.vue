<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { usePlatformStore, type LicenseRecord } from '../stores/platformStore';
import {
  TvSyncSchema,
  PriceAlertDeliveryConfigSchema,
  hydrateIndicatorPriceAlerts,
  toggleIndicatorPriceAlert,
  setAllIndicatorPriceAlerts,
  computePriceAlertSummary,
  BacktestTickerInputSchema,
  simulatePurchasedIndicatorBacktest,
  QUICK_LOOK_TIMEFRAMES,
  buildIndicatorMultiTimeframeQuickLook,
  type PriceAlertChannel,
  type IndicatorPriceAlertOverride,
  type IndicatorPriceAlertPreference,
  type BacktestTimeframe,
  type BacktestLookbackWindow,
  type PurchasedIndicatorBacktestResult,
  type IndicatorMultiTimeframeQuickLook,
  type TimeframeQuickLookStat,
} from '../utils/fulfillment';
import SupportTicketing from './SupportTicketing.vue';

const emit = defineEmits<{
  (e: 'navigate', view: 'storefront' | 'checkout' | 'dashboard' | 'admin'): void;
}>();

const store = usePlatformStore();

// Inline Authentication Gate State (when !store.isAuthenticated)
const gateMode = ref<'login' | 'register'>('login');
const gateEmail = ref('marcus.vance@apexquant.io');
const gatePassword = ref('StratEdge#2026');
const gateName = ref('');
const gateTvUsername = ref('');
const gateTosId = ref('');
const gateError = ref('');
const gateSubmitting = ref(false);

// Private Client Dashboard Sub-Navigation Tabs
const activePortalTab = ref<
  | 'indicators'
  | 'alerts'
  | 'backtest'
  | 'guides'
  | 'support'
  | 'subscriptions'
  | 'invoices'
  | 'settings'
>('indicators');

// TradingView Username Re-Sync per License
const editingLicenseId = ref<string | null>(null);
const tvHandleDraft = ref('');
const syncError = ref('');
const syncingId = ref<string | null>(null);
const upgradingLicenseId = ref<string | null>(null);

// Downloaded ThinkScript Artifact Preview Drawer
const activeArtifactPreview = ref<{
  licenseKey: string;
  filename: string;
  tosShareLink: string;
  content: string;
} | null>(null);

// Interactive Documentation / Installation Guide Preview Drawer
const activeGuidePreview = ref<{
  title: string;
  filename: string;
  content: string;
} | null>(null);

const copiedToken = ref<string | null>(null);

// Account Settings Form State
const profileNameDraft = ref(store.activeCustomerName);
const profileTvDraft = ref(store.activeTradingViewHandle);
const profileTosDraft = ref(store.activeTosAccountId);
const savingProfile = ref(false);

// Deterministic Member Support Key & Webhook Signing Token
const memberSupportKey = computed(() => {
  const emailSeed = store.activeCustomerEmail
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6)
    .padEnd(6, 'X');
  const tvSeed = store.activeTradingViewHandle
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)
    .padEnd(4, 'Q');
  const licCount = String(store.customerLicenses.length).padStart(2, '0');
  return `SUP-SE-${emailSeed}-${tvSeed}-${licCount}94`;
});

const webhookSigningToken = computed(() => {
  const handleClean = store.activeTradingViewHandle
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return `whsec_stratedge_${handleClean}_v6_994182a8f`;
});

// Priority Quant Support Ticket State
const supportSubject = ref('');
const supportCategory = ref('TradingView Invite-Only Script ACL');
const supportLicenseKey = ref('');
const supportMessage = ref('');
const supportTicketConfirmation = ref<{
  ticketId: string;
  supportKey: string;
  subject: string;
  createdAt: string;
} | null>(null);

// Subscribed Indicator Email & SMS Price Alert State (using store.customerLicenses)
const priceAlertOverrides = ref<Record<string, IndicatorPriceAlertOverride>>({});
const alertEmailDestination = ref(store.activeCustomerEmail);
const alertSmsDestination = ref('+1 (212) 555-0194');
const alertDeliveryError = ref('');
const lastDispatchedAlertBanner = ref<{
  indicatorName: string;
  licenseKey: string;
  channelsLabel: string;
  triggerLabel: string;
  timestamp: string;
} | null>(null);

const hydratedPriceAlerts = computed<IndicatorPriceAlertPreference[]>(() =>
  hydrateIndicatorPriceAlerts(store.customerLicenses, priceAlertOverrides.value)
);

const priceAlertSummary = computed(() =>
  computePriceAlertSummary(hydratedPriceAlerts.value)
);

watch(
  () => [
    store.activeCustomerName,
    store.activeTradingViewHandle,
    store.activeTosAccountId,
    store.activeCustomerEmail,
  ],
  ([name, tv, tos, email]) => {
    profileNameDraft.value = name;
    profileTvDraft.value = tv;
    profileTosDraft.value = tos;
    if (email) {
      alertEmailDestination.value = email;
    }
  }
);

function handleTogglePriceAlert(lic: LicenseRecord, channel: PriceAlertChannel) {
  const nowStamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  priceAlertOverrides.value = toggleIndicatorPriceAlert(
    priceAlertOverrides.value,
    lic,
    channel,
    undefined,
    nowStamp
  );
  const updated = priceAlertOverrides.value[lic.id];
  if (updated) {
    lic.emailAlertsEnabled = updated.emailEnabled;
    lic.smsAlertsEnabled = updated.smsEnabled;
  }
  const channelLabel = channel === 'email' ? 'Email' : 'SMS';
  const nextState =
    channel === 'email' ? updated?.emailEnabled : updated?.smsEnabled;
  store.showNotification(
    'info',
    `${channelLabel} Price Alerts ${nextState ? 'Enabled' : 'Disabled'}`,
    `${lic.indicatorName} (${lic.licenseKey}) ${channelLabel} alerts are now ${nextState ? 'ON' : 'OFF'}.`
  );
}

function handleBulkPriceAlerts(channel: PriceAlertChannel | 'all', enabled: boolean) {
  const nowStamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  priceAlertOverrides.value = setAllIndicatorPriceAlerts(
    store.customerLicenses,
    priceAlertOverrides.value,
    channel,
    enabled,
    nowStamp
  );
  for (const lic of store.customerLicenses) {
    const ov = priceAlertOverrides.value[lic.id];
    if (ov) {
      lic.emailAlertsEnabled = ov.emailEnabled;
      lic.smsAlertsEnabled = ov.smsEnabled;
    }
  }
  const label =
    channel === 'all'
      ? 'All Email & SMS Price Alerts'
      : channel === 'email'
      ? 'All Email Price Alerts'
      : 'All SMS Price Alerts';
  store.showNotification(
    'success',
    `${label} ${enabled ? 'Enabled' : 'Muted'}`,
    `Updated ${store.customerLicenses.length} subscribed indicator license(s) for ${store.activeCustomerEmail}.`
  );
}

function saveAlertDeliveryEndpoints() {
  alertDeliveryError.value = '';
  const parsed = PriceAlertDeliveryConfigSchema.safeParse({
    emailDestination: alertEmailDestination.value,
    smsPhoneDestination: alertSmsDestination.value,
  });
  if (!parsed.success) {
    alertDeliveryError.value =
      parsed.error.issues[0]?.message || 'Invalid alert delivery destination.';
    return;
  }
  alertEmailDestination.value = parsed.data.emailDestination;
  alertSmsDestination.value = parsed.data.smsPhoneDestination;
  store.showNotification(
    'success',
    'Price Alert Delivery Endpoints Saved',
    `Routing subscribed indicator alerts to ${parsed.data.emailDestination} and ${parsed.data.smsPhoneDestination}.`
  );
}

function dispatchTestPriceAlert(pref: IndicatorPriceAlertPreference) {
  const activeChannels: string[] = [];
  if (pref.emailEnabled) activeChannels.push(`Email (${alertEmailDestination.value})`);
  if (pref.smsEnabled) activeChannels.push(`SMS (${alertSmsDestination.value})`);

  if (activeChannels.length === 0) {
    store.showNotification(
      'error',
      'All Channels Muted for Indicator',
      `Enable Email or SMS price alerts on ${pref.indicatorName} (${pref.licenseKey}) before dispatching a test alert.`
    );
    return;
  }

  const nowStamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const channelsLabel = activeChannels.join(' + ');
  lastDispatchedAlertBanner.value = {
    indicatorName: pref.indicatorName,
    licenseKey: pref.licenseKey,
    channelsLabel,
    triggerLabel: pref.signalTriggerLabel,
    timestamp: nowStamp,
  };
  store.showNotification(
    'success',
    `Test Price Alert Dispatched: ${pref.indicatorName}`,
    `Delivered "${pref.signalTriggerLabel}" test signal via ${channelsLabel}.`
  );
}

// Historical Ticker Performance Backtest State (Mapped to Purchased Indicators)
const backtestTickerInput = ref('ES1!');
const backtestAppliedTicker = ref('ES1!');
const backtestSelectedLicenseId = ref('');
const backtestTimeframe = ref<BacktestTimeframe>('5m');
const backtestLookbackWindow = ref<BacktestLookbackWindow>('90D');
const backtestStartingCapital = ref(100000);
const backtestError = ref('');
const selectedEquityPointIndex = ref<number | null>(null);

const backtestPresetTickers = [
  'ES1!',
  'NQ1!',
  'SPX',
  'NVDA',
  'TSLA',
  'SPY',
  'QQQ',
  'GC1!',
] as const;

const activeBacktestLicense = computed<LicenseRecord | null>(() => {
  if (store.customerLicenses.length === 0) return null;
  if (backtestSelectedLicenseId.value) {
    const found = store.customerLicenses.find(
      (l) => l.id === backtestSelectedLicenseId.value
    );
    if (found) return found;
  }
  return store.customerLicenses[0];
});

const activeBacktestResult = computed<PurchasedIndicatorBacktestResult | null>(() => {
  const lic = activeBacktestLicense.value;
  if (!lic) return null;
  return simulatePurchasedIndicatorBacktest(lic, {
    ticker: backtestAppliedTicker.value,
    timeframe: backtestTimeframe.value,
    lookbackWindow: backtestLookbackWindow.value,
    startingCapital: backtestStartingCapital.value,
  });
});

const inspectedEquityPoint = computed(() => {
  const res = activeBacktestResult.value;
  if (!res || res.equityCurve.length === 0) return null;
  const idx =
    selectedEquityPointIndex.value !== null &&
    res.equityCurve[selectedEquityPointIndex.value]
      ? selectedEquityPointIndex.value
      : res.equityCurve.length - 1;
  return res.equityCurve[idx];
});

const backtestChartGeometry = computed(() => {
  const res = activeBacktestResult.value;
  const width = 760;
  const height = 220;
  const padX = 24;
  const padY = 22;

  if (!res || res.equityCurve.length === 0) {
    return {
      width,
      height,
      strategyPolyline: '',
      strategyAreaPath: '',
      benchmarkPolyline: '',
      minEquity: 100000,
      maxEquity: 120000,
      nodes: [] as Array<{
        stepIndex: number;
        x: number;
        y: number;
        benchY: number;
        dateLabel: string;
        strategyEquity: number;
        benchmarkEquity: number;
        cumulativeReturnPct: number;
        drawdownPct: number;
        signalRegime: string;
      }>,
    };
  }

  const allValues = res.equityCurve.flatMap((p) => [
    p.strategyEquity,
    p.benchmarkEquity,
  ]);
  const minVal = Math.min(...allValues) * 0.992;
  const maxVal = Math.max(...allValues) * 1.008;
  const range = Math.max(1, maxVal - minVal);
  const count = res.equityCurve.length;
  const usableW = width - padX * 2;
  const usableH = height - padY * 2;

  const nodes = res.equityCurve.map((pt, idx) => {
    const x = Number(
      (padX + (idx / Math.max(1, count - 1)) * usableW).toFixed(1)
    );
    const y = Number(
      (
        height -
        padY -
        ((pt.strategyEquity - minVal) / range) * usableH
      ).toFixed(1)
    );
    const benchY = Number(
      (
        height -
        padY -
        ((pt.benchmarkEquity - minVal) / range) * usableH
      ).toFixed(1)
    );
    return {
      stepIndex: pt.stepIndex,
      x,
      y,
      benchY,
      dateLabel: pt.dateLabel,
      strategyEquity: pt.strategyEquity,
      benchmarkEquity: pt.benchmarkEquity,
      cumulativeReturnPct: pt.cumulativeReturnPct,
      drawdownPct: pt.drawdownPct,
      signalRegime: pt.signalRegime,
    };
  });

  const strategyPolyline = nodes.map((n) => `${n.x},${n.y}`).join(' ');
  const benchmarkPolyline = nodes.map((n) => `${n.x},${n.benchY}`).join(' ');
  const firstNode = nodes[0];
  const lastNode = nodes[nodes.length - 1];
  const baselineY = height - padY;
  const strategyAreaPath = `M ${firstNode.x},${baselineY} L ${nodes
    .map((n) => `${n.x},${n.y}`)
    .join(' L ')} L ${lastNode.x},${baselineY} Z`;

  return {
    width,
    height,
    strategyPolyline,
    strategyAreaPath,
    benchmarkPolyline,
    minEquity: Math.round(minVal),
    maxEquity: Math.round(maxVal),
    nodes,
  };
});

function runHistoricalTickerBacktest(presetTicker?: string) {
  backtestError.value = '';
  if (presetTicker) {
    backtestTickerInput.value = presetTicker;
  }
  const lic = activeBacktestLicense.value;
  if (!lic) {
    backtestError.value = 'No purchased StratEdge Algo indicator license available.';
    return;
  }

  const parsed = BacktestTickerInputSchema.safeParse({
    ticker: backtestTickerInput.value,
    licenseId: lic.id,
    timeframe: backtestTimeframe.value,
    lookbackWindow: backtestLookbackWindow.value,
    startingCapital: Number(backtestStartingCapital.value) || 100000,
  });

  if (!parsed.success) {
    backtestError.value =
      parsed.error.issues[0]?.message || 'Enter a valid historical ticker symbol.';
    return;
  }

  backtestTickerInput.value = parsed.data.ticker;
  backtestAppliedTicker.value = parsed.data.ticker;
  selectedEquityPointIndex.value = null;

  const result = activeBacktestResult.value;
  store.showNotification(
    'success',
    `Backtest Complete: ${parsed.data.ticker} (${parsed.data.timeframe} · ${parsed.data.lookbackWindow})`,
    `${lic.indicatorName} (${lic.licenseKey}) achieved +${result?.netReturnPct.toFixed(1)}% net return (${result?.winRatePct}% win rate).`
  );
}

function selectBacktestPurchasedLicense(licenseId: string) {
  backtestSelectedLicenseId.value = licenseId;
  selectedEquityPointIndex.value = null;
}

// Hover-Interactive Multi-Timeframe Quick-Look Tooltip State (Purchased Indicators List)
const hoveredQuickLookLicenseId = ref<string | null>(null);
const pinnedQuickLookLicenseId = ref<string | null>(null);
const selectedQuickLookTimeframeByLicense = ref<Record<string, BacktestTimeframe>>({});

const quickLookByLicenseId = computed<Record<string, IndicatorMultiTimeframeQuickLook>>(
  () => {
    const map: Record<string, IndicatorMultiTimeframeQuickLook> = {};
    for (const lic of store.customerLicenses) {
      map[lic.id] = buildIndicatorMultiTimeframeQuickLook(lic);
    }
    return map;
  }
);

function isQuickLookTooltipOpen(licenseId: string): boolean {
  return (
    hoveredQuickLookLicenseId.value === licenseId ||
    pinnedQuickLookLicenseId.value === licenseId
  );
}

function openQuickLookOnHover(licenseId: string) {
  hoveredQuickLookLicenseId.value = licenseId;
}

function closeQuickLookOnLeave(licenseId: string) {
  if (hoveredQuickLookLicenseId.value === licenseId) {
    hoveredQuickLookLicenseId.value = null;
  }
}

function togglePinQuickLookTooltip(licenseId: string) {
  if (pinnedQuickLookLicenseId.value === licenseId) {
    pinnedQuickLookLicenseId.value = null;
    hoveredQuickLookLicenseId.value = null;
  } else {
    pinnedQuickLookLicenseId.value = licenseId;
    hoveredQuickLookLicenseId.value = licenseId;
  }
}

function dismissQuickLookTooltip(licenseId: string) {
  if (pinnedQuickLookLicenseId.value === licenseId) {
    pinnedQuickLookLicenseId.value = null;
  }
  if (hoveredQuickLookLicenseId.value === licenseId) {
    hoveredQuickLookLicenseId.value = null;
  }
}

function setQuickLookTimeframe(licenseId: string, tf: BacktestTimeframe) {
  selectedQuickLookTimeframeByLicense.value = {
    ...selectedQuickLookTimeframeByLicense.value,
    [licenseId]: tf,
  };
}

function getHighlightedQuickLookStat(
  licenseId: string
): TimeframeQuickLookStat | null {
  const summary = quickLookByLicenseId.value[licenseId];
  if (!summary || summary.timeframes.length === 0) return null;
  const preferredTf =
    selectedQuickLookTimeframeByLicense.value[licenseId] ||
    summary.bestTimeframe;
  return (
    summary.timeframes.find((t) => t.timeframe === preferredTf) ||
    summary.timeframes[0]
  );
}

function launchFullBacktestFromTooltip(
  lic: LicenseRecord,
  timeframe?: BacktestTimeframe
) {
  const summary = quickLookByLicenseId.value[lic.id];
  backtestSelectedLicenseId.value = lic.id;
  if (summary?.benchmarkTicker) {
    backtestTickerInput.value = summary.benchmarkTicker;
    backtestAppliedTicker.value = summary.benchmarkTicker;
  }
  if (timeframe) {
    backtestTimeframe.value = timeframe;
  }
  selectedEquityPointIndex.value = null;
  dismissQuickLookTooltip(lic.id);
  activePortalTab.value = 'backtest';
}

async function handleGateLogin() {
  gateError.value = '';
  gateSubmitting.value = true;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: gateEmail.value,
        password: gatePassword.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      gateError.value = data.error || 'Authentication failed';
      return;
    }

    await store.switchCustomerProfile(data.user.email);
    store.isAuthenticated = true;
    store.showNotification(
      'success',
      `Client Dashboard Unlocked: ${data.user.name}`,
      `Authenticated session active for ${data.user.email} (@${data.user.tradingViewUsername})`
    );
  } catch (err) {
    gateError.value =
      err instanceof Error ? err.message : 'Network error during sign in';
  } finally {
    gateSubmitting.value = false;
  }
}

async function handleGateRegister() {
  gateError.value = '';
  gateSubmitting.value = true;
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: gateName.value,
        email: gateEmail.value,
        password: gatePassword.value,
        tradingViewUsername: gateTvUsername.value,
        thinkorswimAccountId: gateTosId.value,
        role: 'customer',
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      gateError.value = data.error || 'Account registration failed';
      return;
    }

    await store.switchCustomerProfile(data.user.email);
    store.isAuthenticated = true;
    store.showNotification(
      'success',
      `Welcome, ${data.user.name}!`,
      `Your private Client Dashboard and @${data.user.tradingViewUsername} handle are now active.`
    );
  } catch (err) {
    gateError.value =
      err instanceof Error ? err.message : 'Network error during registration';
  } finally {
    gateSubmitting.value = false;
  }
}

async function quickUnlockSession(email: string) {
  gateEmail.value = email;
  await store.switchCustomerProfile(email);
  store.isAuthenticated = true;
  store.showNotification(
    'success',
    `Authenticated Session Restored`,
    `Unlocked Client Dashboard for ${store.activeCustomerName} (${email}).`
  );
}

function startEditingTvHandle(lic: LicenseRecord) {
  editingLicenseId.value = lic.id;
  tvHandleDraft.value = lic.tradingViewUsername;
  syncError.value = '';
}

async function saveTvHandleSync(lic: LicenseRecord) {
  syncError.value = '';
  const parsed = TvSyncSchema.safeParse({
    licenseId: lic.id,
    tradingViewUsername: tvHandleDraft.value,
  });

  if (!parsed.success) {
    syncError.value =
      parsed.error.issues[0]?.message || 'Invalid TradingView username';
    return;
  }

  syncingId.value = lic.id;
  try {
    const res = await fetch('/api/licenses/sync-tv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });
    const data = await res.json();
    if (!res.ok) {
      syncError.value = data.error || 'Failed to sync TradingView username';
      return;
    }

    editingLicenseId.value = null;
    await store.fetchAllData();
    store.showNotification(
      'success',
      'TradingView Invite-Only Access Re-Synced',
      `Permission server updated ACL to @${parsed.data.tradingViewUsername} for ${lic.indicatorName}.`
    );
  } finally {
    syncingId.value = null;
  }
}

async function changeSubscriptionTier(
  lic: LicenseRecord,
  newBillingCycle: 'Monthly' | 'Annual' | 'Lifetime'
) {
  upgradingLicenseId.value = lic.id;
  try {
    const res = await fetch('/api/subscriptions/change-tier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseId: lic.id,
        newBillingCycle,
      }),
    });
    if (res.ok) {
      await store.fetchAllData();
      store.showNotification(
        'success',
        `Subscription Updated to ${newBillingCycle}`,
        `Your ${lic.indicatorName} license (${lic.licenseKey}) is now on the ${newBillingCycle} plan.`
      );
    }
  } finally {
    upgradingLicenseId.value = null;
  }
}

async function toggleSubscriptionStatus(lic: LicenseRecord) {
  upgradingLicenseId.value = lic.id;
  try {
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
        `Subscription Status: ${data.tvAccessStatus}`,
        `License ${lic.licenseKey} access state changed to ${data.tvAccessStatus}.`
      );
    }
  } finally {
    upgradingLicenseId.value = null;
  }
}

async function saveAccountProfile() {
  savingProfile.value = true;
  try {
    const res = await fetch('/api/auth/update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: store.activeCustomerEmail,
        name: profileNameDraft.value,
        tradingViewUsername: profileTvDraft.value,
        thinkorswimAccountId: profileTosDraft.value,
      }),
    });
    if (res.ok) {
      await store.fetchAllData();
      store.showNotification(
        'success',
        'Account & Trading Handles Saved',
        `Synchronized @${profileTvDraft.value} and ${profileTosDraft.value} across all active licenses.`
      );
    }
  } finally {
    savingProfile.value = false;
  }
}

async function downloadThinkScriptStudy(lic: LicenseRecord) {
  const res = await fetch(`/api/download/tos/${encodeURIComponent(lic.id)}`);
  if (!res.ok) {
    store.showNotification(
      'error',
      'Download Failed',
      'Could not generate thinkorswim study artifact.'
    );
    return;
  }

  const data = await res.json();
  activeArtifactPreview.value = {
    licenseKey: lic.licenseKey,
    filename: data.filename,
    tosShareLink: data.tosShareLink,
    content: data.content,
  };

  const blob = new Blob([data.content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = data.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  await store.fetchAllData();
  store.showNotification(
    'success',
    `Downloaded ${data.filename}`,
    `Your personalized thinkorswim study file (#${data.downloadCount}) has been saved and opened in the inspector below.`
  );
}

// Download Complete All-In-One Installation Bundle for a License
async function downloadCompleteInstallationPackage(lic: LicenseRecord) {
  const res = await fetch(`/api/download/tos/${encodeURIComponent(lic.id)}`);
  let tosCode = '# thinkorswim Study Code';
  if (res.ok) {
    const data = await res.json();
    tosCode = data.content;
  }

  const bundleContent = [
    '================================================================================',
    `STRATEDGE ALGO — COMPLETE INSTALLATION & LICENSE BUNDLE (${lic.indicatorName})`,
    '================================================================================',
    `Member Name:            ${lic.customerName} (${lic.customerEmail})`,
    `Support Key:            ${memberSupportKey.value}`,
    `License Key:            ${lic.licenseKey}`,
    `Subscription Tier:      ${lic.billingCycle} (Valid thru ${lic.expiresAt})`,
    `TradingView Handle:     @${lic.tradingViewUsername} (${lic.tvAccessStatus})`,
    `thinkorswim Share Link: ${lic.tosShareLink}`,
    '================================================================================',
    '',
    '--- PART 1: TRADINGVIEW PINE SCRIPT V6 ACTIVATION ---',
    `1. Confirm your TradingView account is logged in as @${lic.tradingViewUsername}.`,
    '2. Open any chart -> Click "Indicators, Metrics & Strategies" -> "Invite-only scripts".',
    `3. Select "${lic.indicatorName}" to load the study onto your chart.`,
    '',
    '--- PART 2: CHARLES SCHWAB THINKORSWIM (.TS) STUDY SOURCE ---',
    tosCode,
  ].join('\n');

  const filename = `StratEdge_Complete_Package_${lic.licenseKey}.txt`;
  const blob = new Blob([bundleContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  await store.fetchAllData();
  store.showNotification(
    'success',
    `Downloaded Complete Bundle: ${filename}`,
    `Saved license certificate, support key (${memberSupportKey.value}), and thinkorswim study package.`
  );
}

// Personalized Installation Guide & Documentation Generator
function buildInstallationGuideContent(
  guideType: 'tv' | 'tos' | 'playbook' | 'webhook'
) {
  const licenseSummary =
    store.customerLicenses.length > 0
      ? store.customerLicenses
          .map(
            (l) =>
              `  * ${l.indicatorName} — Key: ${l.licenseKey} (${l.billingCycle}, Expires: ${l.expiresAt})`
          )
          .join('\n')
      : '  * No active licenses bound yet — complete checkout to bind your license keys.';

  if (guideType === 'tv') {
    return {
      title: 'TradingView Pine Script v6 Invite-Only Installation & Webhook Guide',
      filename: `StratEdge_TradingView_Installation_Guide_${store.activeTradingViewHandle}.md`,
      content: [
        '# STRATEDGE ALGO — TRADINGVIEW INVITE-ONLY INSTALLATION GUIDE',
        `Account Holder: ${store.activeCustomerName} (${store.activeCustomerEmail})`,
        `Support Key: ${memberSupportKey.value}`,
        `Whitelisted TradingView Username: @${store.activeTradingViewHandle}`,
        '',
        '## Your Provisioned Indicator Licenses',
        licenseSummary,
        '',
        '## Step 1: Refresh Your TradingView Session',
        '1. Confirm your TradingView username above matches your exact TradingView profile handle.',
        '2. If you just completed checkout or updated your handle in the Client Dashboard, refresh your TradingView browser tab or desktop app (Ctrl+R / Cmd+R).',
        '',
        '## Step 2: Load Invite-Only Scripts onto Your Chart',
        '1. Open any TradingView chart (e.g., SPX, ES1!, NQ1!, SPY, QQQ).',
        '2. Click "Indicators, Metrics & Strategies" on the top toolbar (or press "/").',
        '3. Select the "Invite-only scripts" tab on the left sidebar (lock icon).',
        '4. Click "StratEdge Algo Gamma", "StratEdge Algo Flow", or "StratEdge Algo Structure" to add it to your chart.',
        '',
        '## Step 3: Configure Institutional Webhook Alerts',
        '1. Press Alt+A (or click the Alert clock icon) on your TradingView chart.',
        '2. Set Condition to your active StratEdge Algo study and select "Any alert() function call".',
        `3. Authenticate your webhook payload using signing token: ${webhookSigningToken.value}`,
      ].join('\n'),
    };
  }

  if (guideType === 'tos') {
    return {
      title: 'Charles Schwab thinkorswim (.ts Study & tos.mx) Installation Guide',
      filename: `StratEdge_thinkorswim_Installation_Guide_${store.activeTosAccountId}.md`,
      content: [
        '# STRATEDGE ALGO — CHARLES SCHWAB THINKORSWIM INSTALLATION GUIDE',
        `Account Holder: ${store.activeCustomerName} (${store.activeCustomerEmail})`,
        `Support Key: ${memberSupportKey.value}`,
        `thinkorswim Account ID: ${store.activeTosAccountId}`,
        '',
        '## Your Provisioned thinkorswim Study Files',
        licenseSummary,
        '',
        '## Method A: Importing Your Watermarked .ts Study File (Recommended)',
        '1. In the Client Dashboard "Purchased Indicators" tab, click "Download thinkorswim .ts" to save your personalized study file.',
        '2. Launch Charles Schwab thinkorswim Desktop and open the "Charts" tab.',
        '3. Click the beaker icon ("Studies") -> "Edit Studies..." in the top toolbar.',
        '4. In the bottom-left corner of the Edit Studies window, click "Import...".',
        '5. Select the downloaded `StratEdge_Algo_*.ts` file from your computer and click "Open".',
        '6. Click "Apply" and "OK" — your StratEdge Algo levels and signals will render immediately.',
        '',
        '## Method B: Opening via Direct tos.mx Shared Workspace Link',
        '1. Copy the `http://tos.mx/...` link from your license card in the Client Dashboard.',
        '2. In thinkorswim Desktop, click "Setup" (top-right gear icon) -> "Open Shared Item...".',
        '3. Paste the `http://tos.mx/...` URL, click "Preview", and click "Import".',
      ].join('\n'),
    };
  }

  if (guideType === 'webhook') {
    return {
      title: 'StratEdge Algo Automated Webhook & JSON Alert Payload Specification',
      filename: `StratEdge_Webhook_API_Specification_${store.activeTradingViewHandle}.md`,
      content: [
        '# STRATEDGE ALGO — AUTOMATED WEBHOOK & ALERT PAYLOAD DOCUMENTATION',
        `Member Support Key: ${memberSupportKey.value}`,
        `Webhook Signing Secret: ${webhookSigningToken.value}`,
        '',
        '## Standard JSON Alert Payload Format',
        '```json',
        '{',
        '  "schema": "stratedge.v6.signal",',
        `  "supportKey": "${memberSupportKey.value}",`,
        `  "signingToken": "${webhookSigningToken.value}",`,
        '  "ticker": "{{ticker}}",',
        '  "timeframe": "{{interval}}",',
        '  "regime": "NEGATIVE_GAMMA_BREAKOUT",',
        '  "entryPrice": {{close}},',
        '  "invalidationAtrStop": 1.5',
        '}',
        '```',
      ].join('\n'),
    };
  }

  return {
    title: 'StratEdge Algo Trinity (Gamma + Flow + Structure) Execution Playbook',
    filename: 'StratEdge_Institutional_Execution_Playbook_v6.md',
    content: [
      '# STRATEDGE ALGO — INSTITUTIONAL EXECUTION PLAYBOOK (GAMMA + FLOW + STRUCTURE)',
      `Prepared for: ${store.activeCustomerName} (@${store.activeTradingViewHandle})`,
      `Support Key: ${memberSupportKey.value}`,
      '',
      '## 1. Pre-Market Dealer Gamma Mapping (StratEdge Algo Gamma)',
      '- Identify the Net GEX Regime at 09:25 EST:',
      '  * Positive Gamma (> Zero-Gamma Flip): Mean-reversion regime; fade extremes at Call Wall / Put Wall.',
      '  * Negative Gamma (< Zero-Gamma Flip): Volatility expansion regime; trade directional breakouts with dealer hedging momentum.',
      '',
      '## 2. Order-Flow & Dark-Pool Confirmation (StratEdge Algo Flow)',
      '- Never enter a structural level blind. Wait for StratEdge Algo Flow to print:',
      '  * Cumulative Volume Delta (CVD) absorption divergence at the key strike wall.',
      '  * Institutional Block Sweep (> 2.2 Sigma volume z-score) confirming passive limit absorption.',
      '',
      '## 3. Structural Trigger & Risk Placement (StratEdge Algo Structure)',
      '- Execute on confirmed 1m/5m Change of Character (CHoCH) or Break of Structure (BOS).',
      '- Place hard invalidation stops 1.5x Wilders ATR beyond the swept liquidity zone.',
    ].join('\n'),
  };
}

function downloadInstallationGuide(
  guideType: 'tv' | 'tos' | 'playbook' | 'webhook'
) {
  const doc = buildInstallationGuideContent(guideType);
  activeGuidePreview.value = doc;

  const blob = new Blob([doc.content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  store.showNotification(
    'success',
    `Downloaded ${doc.filename}`,
    `Saved ${doc.title} and opened preview below.`
  );
}

function submitPrioritySupportTicket() {
  if (!supportSubject.value.trim()) {
    store.showNotification(
      'error',
      'Subject Required',
      'Please enter a brief subject for your Quant Support ticket.'
    );
    return;
  }

  const ticketId = `TKT-${Math.floor(100000 + Math.random() * 900000)}`;
  const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  supportTicketConfirmation.value = {
    ticketId,
    supportKey: memberSupportKey.value,
    subject: supportSubject.value.trim(),
    createdAt: nowIso,
  };

  store.showNotification(
    'success',
    `Support Ticket Dispatched (${ticketId})`,
    `Authenticated with Support Key ${memberSupportKey.value}. Priority Quant Desk response SLA: < 15 mins.`
  );
  supportSubject.value = '';
  supportMessage.value = '';
}

function downloadInvoiceReceipt(lic: LicenseRecord) {
  const receiptText = [
    '===================================================================',
    'STRATEDGE ALGO (https://stratedgealgo.com)',
    'OFFICIAL INSTITUTIONAL SOFTWARE & PROP-DESK LICENSE INVOICE',
    '===================================================================',
    `Invoice ID:         INV-${lic.id.toUpperCase()}`,
    `Support Key:        ${memberSupportKey.value}`,
    `License Key:        ${lic.licenseKey}`,
    `Issue Date:         ${lic.provisionedAt}`,
    `Customer Name:      ${lic.customerName}`,
    `Customer Email:     ${lic.customerEmail}`,
    `TradingView Handle: @${lic.tradingViewUsername}`,
    '-------------------------------------------------------------------',
    `Product Licensed:   ${lic.indicatorName}`,
    `Membership Tier:    ${lic.billingCycle} Subscription / Entitlement`,
    `Valid Through:      ${lic.expiresAt}`,
    `Total Amount Paid:  $${lic.amountPaid.toLocaleString()} USD (PAID IN FULL)`,
    '===================================================================',
  ].join('\n');

  const blob = new Blob([receiptText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `StratEdge_Invoice_${lic.licenseKey}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  store.showNotification(
    'info',
    `Invoice Downloaded (${lic.licenseKey})`,
    `Saved StratEdge_Invoice_${lic.licenseKey}.txt for prop-desk reimbursement.`
  );
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback if clipboard permission restricted in iframe
  }
  copiedToken.value = label;
  store.showNotification('info', 'Copied to Clipboard', `${label}: ${text}`);
  setTimeout(() => {
    if (copiedToken.value === label) copiedToken.value = null;
  }, 3000);
}
</script>

<template>
  <section class="workspace-shell" data-testid="client-dashboard-shell">
    <div class="container">
      <!-- =====================================================================
           AUTHENTICATION GUARD GATE (Rendered when !store.isAuthenticated)
           Protects purchased indicators, installation files, docs & support keys
           ===================================================================== -->
      <div
        v-if="!store.isAuthenticated"
        class="checkout-grid"
        style="max-width: 960px; margin: 24px auto;"
        data-testid="dashboard-auth-gate"
      >
        <div class="bento-panel" style="justify-content: space-between;">
          <div>
            <div class="meta-line">
              <span class="meta-accent">Private Member &amp; License Vault</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Authentication Required</span>
            </div>
            <h1 class="section-title" style="margin-top: 8px;">
              Sign In to Access Purchased Indicators, Downloads &amp; Support Keys
            </h1>
            <p class="section-subtitle" style="margin-top: 10px;">
              Your StratEdge Algo Client Dashboard is a private member area protected by session
              authentication. Sign in to view purchased indicators, download personalized thinkorswim
              `.ts` installation files, read technical documentation, or retrieve your support keys.
            </p>

            <div
              style="
                margin-top: 24px;
                padding-top: 18px;
                border-top: 1px solid var(--border-hairline);
              "
            >
              <div class="form-label" style="margin-bottom: 10px;">
                Instant 1-Click Verified Trader Sessions:
              </div>
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <button
                  type="button"
                  class="btn-secondary"
                  style="width: 100%; justify-content: space-between;"
                  data-testid="gate-quick-unlock-marcus"
                  @click="quickUnlockSession('marcus.vance@apexquant.io')"
                >
                  <span>Marcus Vance (Gamma + Flow Licenses)</span>
                  <span class="mono" style="color: var(--accent-emerald-bright); font-size: 0.75rem;">
                    Unlock Client Vault →
                  </span>
                </button>
                <button
                  type="button"
                  class="btn-secondary"
                  style="width: 100%; justify-content: space-between;"
                  @click="quickUnlockSession('elena.rostova@zurichprop.ch')"
                >
                  <span>Elena Rostova (Trinity Bundle Lifetime)</span>
                  <span class="mono" style="color: var(--accent-emerald-bright); font-size: 0.75rem;">
                    Unlock Client Vault →
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div class="meta-line" style="padding-top: 16px; border-top: 1px solid var(--border-hairline);">
            <span>256-Bit License &amp; Support Key Encryption</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span>Real-Time TradingView Pine v6 ACL Sync</span>
          </div>
        </div>

        <!-- Right Column: Inline Login / Sign Up Form -->
        <div class="form-panel">
          <div
            class="segmented-group"
            style="width: 100%; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr;"
          >
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: gateMode === 'login' }"
              @click="gateMode = 'login'"
            >
              Member Sign In
            </button>
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: gateMode === 'register' }"
              @click="gateMode = 'register'"
            >
              Create Account
            </button>
          </div>

          <form
            v-if="gateMode === 'login'"
            novalidate
            @submit.prevent="handleGateLogin"
          >
            <div class="form-field">
              <label for="gate-email" class="form-label">Customer Email</label>
              <input
                id="gate-email"
                v-model="gateEmail"
                type="email"
                class="form-input"
                placeholder="marcus.vance@apexquant.io"
                required
              />
            </div>

            <div class="form-field">
              <label for="gate-password" class="form-label">Password</label>
              <input
                id="gate-password"
                v-model="gatePassword"
                type="password"
                class="form-input"
                required
              />
            </div>

            <div
              v-if="gateError"
              class="form-error"
              style="margin-bottom: 12px;"
              role="alert"
            >
              {{ gateError }}
            </div>

            <button
              type="submit"
              class="btn-primary"
              style="width: 100%;"
              :disabled="gateSubmitting"
            >
              {{ gateSubmitting ? 'Verifying Credentials...' : 'Unlock Client Dashboard →' }}
            </button>
          </form>

          <form
            v-else
            novalidate
            @submit.prevent="handleGateRegister"
          >
            <div class="form-field">
              <label for="gate-reg-name" class="form-label">Full Name</label>
              <input
                id="gate-reg-name"
                v-model="gateName"
                type="text"
                class="form-input"
                placeholder="Jordan Sterling"
                required
              />
            </div>

            <div class="form-field">
              <label for="gate-reg-email" class="form-label">Email Address</label>
              <input
                id="gate-reg-email"
                v-model="gateEmail"
                type="email"
                class="form-input"
                placeholder="jordan@sterlingquant.io"
                required
              />
            </div>

            <div class="form-row-2">
              <div class="form-field">
                <label for="gate-reg-tv" class="form-label">TradingView Handle</label>
                <input
                  id="gate-reg-tv"
                  v-model="gateTvUsername"
                  type="text"
                  class="form-input mono"
                  placeholder="Sterling_ES"
                  required
                />
              </div>
              <div class="form-field">
                <label for="gate-reg-tos" class="form-label">thinkorswim ID</label>
                <input
                  id="gate-reg-tos"
                  v-model="gateTosId"
                  type="text"
                  class="form-input mono"
                  placeholder="TOS-551920"
                />
              </div>
            </div>

            <div class="form-field">
              <label for="gate-reg-pw" class="form-label">Password</label>
              <input
                id="gate-reg-pw"
                v-model="gatePassword"
                type="password"
                class="form-input"
                required
              />
            </div>

            <div
              v-if="gateError"
              class="form-error"
              style="margin-bottom: 12px;"
              role="alert"
            >
              {{ gateError }}
            </div>

            <button
              type="submit"
              class="btn-primary"
              style="width: 100%;"
              :disabled="gateSubmitting"
            >
              {{ gateSubmitting ? 'Creating Account...' : 'Register & Open Client Dashboard →' }}
            </button>
          </form>
        </div>
      </div>

      <!-- =====================================================================
           PRIVATE AUTHENTICATED CLIENT DASHBOARD (Rendered when store.isAuthenticated)
           ===================================================================== -->
      <div v-else data-testid="authenticated-dashboard-content">
        <!-- Workspace Header -->
        <div class="workspace-header">
          <div>
            <div class="meta-line">
              <span class="meta-accent">Private Member Area &amp; Entitlement Vault</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span class="mono">{{ store.activeCustomerName }} ({{ store.activeCustomerEmail }})</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span class="mono" style="color: var(--accent-amber);">
                SUPPORT KEY: {{ memberSupportKey }}
              </span>
            </div>
            <h1 class="section-title" style="margin-top: 6px;">
              Client Dashboard — Purchased Indicators, Downloads &amp; Support Keys
            </h1>
            <p class="section-subtitle">
              View your purchased indicators, download personalized thinkorswim `.ts` installation
              files and setup bundles, access technical documentation, and manage your license &amp; support keys.
            </p>
          </div>

          <!-- Account Switcher & Lock / Sign Out Controls -->
          <div class="dashboard-session-switcher">
            <label for="customer-account-select" class="form-label">
              Authenticated Member Session
            </label>
            <div style="display: flex; gap: 8px; align-items: center;">
              <select
                id="customer-account-select"
                :value="store.activeCustomerEmail"
                class="form-select mono"
                @change="(e) => store.switchCustomerProfile((e.target as HTMLSelectElement).value)"
              >
                <option
                  v-for="u in store.allUsers"
                  :key="u.id"
                  :value="u.email"
                >
                  {{ u.email }} ({{ u.name }})
                </option>
              </select>
              <button
                type="button"
                class="btn-ghost"
                data-testid="dashboard-signout-btn"
                title="Lock dashboard and test authentication guard"
                @click="store.signOut()"
              >
                Lock / Sign Out
              </button>
            </div>
          </div>
        </div>

        <!-- Summary KPI Row -->
        <div class="kpi-strip" style="margin-top: 0; margin-bottom: 28px;">
          <div class="kpi-item">
            <span class="kpi-number">{{ store.customerLicenses.length }}</span>
            <span class="kpi-label">Purchased Indicator Licenses</span>
            <span class="kpi-context">Bound to {{ store.activeCustomerEmail }}</span>
          </div>
          <div class="kpi-item">
            <span class="kpi-number">
              @{{ store.customerLicenses[0]?.tradingViewUsername || store.activeTradingViewHandle }}
            </span>
            <span class="kpi-label">Whitelisted TradingView Handle</span>
            <span class="kpi-context">Pine Script v6 Invite-Only ACL Active</span>
          </div>
          <div class="kpi-item">
            <span class="kpi-number">
              {{ store.customerLicenses.reduce((acc, l) => acc + l.tosDownloadCount, 0) }}
            </span>
            <span class="kpi-label">Installation Files Downloaded</span>
            <span class="kpi-context">Watermarked .ts ThinkScript studies</span>
          </div>
          <div class="kpi-item">
            <span
              class="kpi-number"
              style="font-size: 1.25rem; cursor: pointer;"
              title="Click to copy Member Support Key"
              @click="copyText(memberSupportKey, 'Member Support Key')"
            >
              {{ memberSupportKey }}
            </span>
            <span class="kpi-label">Verified Member Support Key</span>
            <span class="kpi-context">Click key to copy for Priority Quant Support</span>
          </div>
        </div>

        <!-- Client Dashboard Sub-Navigation Tabs -->
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
          <div class="segmented-group" role="tablist" aria-label="Client Dashboard Navigation Tabs">
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: activePortalTab === 'indicators' }"
              data-testid="tab-purchased-indicators"
              @click="activePortalTab = 'indicators'"
            >
              1. Purchased Indicators &amp; Downloads ({{ store.customerLicenses.length }})
            </button>
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: activePortalTab === 'alerts' }"
              data-testid="tab-price-alerts"
              @click="activePortalTab = 'alerts'"
            >
              Price Alerts ({{ priceAlertSummary.emailEnabledCount }} Email · {{ priceAlertSummary.smsEnabledCount }} SMS)
            </button>
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: activePortalTab === 'backtest' }"
              data-testid="tab-historical-backtester"
              @click="activePortalTab = 'backtest'"
            >
              Historical Backtester ({{ store.customerLicenses.length }})
            </button>
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: activePortalTab === 'guides' }"
              data-testid="tab-installation-guides"
              @click="activePortalTab = 'guides'"
            >
              2. Documentation &amp; Setup Guides
            </button>
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: activePortalTab === 'support' }"
              data-testid="tab-support-keys"
              @click="activePortalTab = 'support'"
            >
              3. Support Ticketing &amp; Desk Messaging ({{ store.supportTickets.length }})
            </button>
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: activePortalTab === 'subscriptions' }"
              data-testid="tab-memberships"
              @click="activePortalTab = 'subscriptions'"
            >
              4. License Keys &amp; Subscriptions
            </button>
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: activePortalTab === 'invoices' }"
              data-testid="tab-invoices"
              @click="activePortalTab = 'invoices'"
            >
              5. Billing &amp; Invoices
            </button>
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: activePortalTab === 'settings' }"
              data-testid="tab-account-settings"
              @click="activePortalTab = 'settings'"
            >
              6. Account Settings
            </button>
          </div>

          <button
            type="button"
            class="btn-primary"
            @click="store.isCartDrawerOpen = true"
          >
            Shopping Cart ({{ store.cartTotals.itemCount }})
          </button>
        </div>

        <!-- =================================================================
             TAB 1: PURCHASED INDICATORS & INSTALLATION FILE DOWNLOADS
             ================================================================= -->
        <div v-if="activePortalTab === 'indicators'">
          <div v-if="store.customerLicenses.length > 0" class="license-list">
            <article
              v-for="lic in store.customerLicenses"
              :key="lic.id"
              class="license-panel"
              data-testid="customer-license-card"
            >
              <!-- Column 1: Indicator Identity & License Key -->
              <div>
                <div class="meta-line">
                  <span
                    :style="{
                      color:
                        lic.tvAccessStatus === 'Provisioned'
                          ? 'var(--accent-emerald-bright)'
                          : 'var(--accent-crimson)',
                      fontWeight: 600,
                    }"
                  >
                    Status: {{ lic.tvAccessStatus }}
                  </span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span>{{ lic.billingCycle }} Plan</span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span class="mono">Valid thru {{ lic.expiresAt }}</span>
                </div>

                <h2 style="font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; margin-top: 6px;">
                  {{ lic.indicatorName }}
                </h2>

                <div class="meta-line" style="margin-top: 8px;">
                  <span>License Key:</span>
                  <code class="mono" style="color: var(--text-primary); font-weight: 600;">
                    {{ lic.licenseKey }}
                  </code>
                  <button
                    type="button"
                    class="btn-ghost"
                    style="padding: 4px 10px; min-height: 28px;"
                    :aria-label="`Copy license key ${lic.licenseKey}`"
                    @click="copyText(lic.licenseKey, 'License Key')"
                  >
                    Copy Key
                  </button>
                </div>

                <!-- Hover-Interactive Multi-Timeframe Quick-Look Tooltip Module -->
                <div
                  v-if="quickLookByLicenseId[lic.id]"
                  class="quick-look-tooltip-anchor"
                  @mouseenter="openQuickLookOnHover(lic.id)"
                  @mouseleave="closeQuickLookOnLeave(lic.id)"
                >
                  <button
                    type="button"
                    class="quick-look-trigger-btn"
                    :class="{ active: isQuickLookTooltipOpen(lic.id) }"
                    data-testid="quick-look-tooltip-trigger"
                    :data-license-id="lic.id"
                    :aria-expanded="isQuickLookTooltipOpen(lic.id)"
                    :aria-describedby="
                      isQuickLookTooltipOpen(lic.id)
                        ? `quick-look-popover-${lic.id}`
                        : undefined
                    "
                    @focus="openQuickLookOnHover(lic.id)"
                    @click="togglePinQuickLookTooltip(lic.id)"
                  >
                    <span class="quick-look-pulse-dot" aria-hidden="true"></span>
                    <span class="quick-look-trigger-label">
                      Quick-Look Multi-TF Stats
                    </span>
                    <span class="quick-look-trigger-metrics mono">
                      Win {{ quickLookByLicenseId[lic.id].avgWinRatePct.toFixed(1) }}% · PF
                      {{ quickLookByLicenseId[lic.id].avgProfitFactor.toFixed(2) }} ·
                      {{ QUICK_LOOK_TIMEFRAMES.length }} TFs
                    </span>
                  </button>

                  <!-- Floating Multi-Timeframe Quick-Look Performance Popover -->
                  <div
                    v-if="isQuickLookTooltipOpen(lic.id)"
                    :id="`quick-look-popover-${lic.id}`"
                    role="tooltip"
                    class="quick-look-popover"
                    data-testid="quick-look-tooltip-popover"
                    :data-license-id="lic.id"
                  >
                    <!-- Tooltip Header -->
                    <div class="quick-look-popover-header">
                      <div>
                        <div class="meta-line" style="font-size: 0.7rem;">
                          <span class="meta-accent">MULTI-TIMEFRAME QUICK-LOOK</span>
                          <span class="meta-sep" aria-hidden="true">·</span>
                          <span class="mono">
                            BENCHMARK {{ quickLookByLicenseId[lic.id].benchmarkTicker }} ({{
                              quickLookByLicenseId[lic.id].lookbackWindow
                            }})
                          </span>
                        </div>
                        <div class="quick-look-popover-title">
                          {{ lic.indicatorName }}
                        </div>
                      </div>
                      <button
                        type="button"
                        class="btn-ghost quick-look-close-btn"
                        :aria-label="`Close quick-look performance tooltip for ${lic.indicatorName}`"
                        @click.stop="dismissQuickLookTooltip(lic.id)"
                      >
                        {{ pinnedQuickLookLicenseId === lic.id ? 'Unpin ✕' : 'Close ✕' }}
                      </button>
                    </div>

                    <!-- Timeframe Selector Pills inside Tooltip -->
                    <div
                      class="quick-look-tf-Subbar"
                      role="group"
                      aria-label="Inspect Timeframe Performance"
                    >
                      <button
                        v-for="tfStat in quickLookByLicenseId[lic.id].timeframes"
                        :key="`pill-${lic.id}-${tfStat.timeframe}`"
                        type="button"
                        class="quick-look-tf-btn mono"
                        :class="{
                          active:
                            getHighlightedQuickLookStat(lic.id)?.timeframe ===
                            tfStat.timeframe,
                          optimal:
                            quickLookByLicenseId[lic.id].bestTimeframe ===
                            tfStat.timeframe,
                        }"
                        :data-testid="`quick-look-tf-btn-${tfStat.timeframe}`"
                        @mouseenter="setQuickLookTimeframe(lic.id, tfStat.timeframe)"
                        @click.stop="setQuickLookTimeframe(lic.id, tfStat.timeframe)"
                      >
                        {{ tfStat.timeframe }}
                        <span
                          v-if="
                            quickLookByLicenseId[lic.id].bestTimeframe ===
                            tfStat.timeframe
                          "
                          class="quick-look-optimal-star"
                          title="Optimal Edge Timeframe"
                        >
                          ★
                        </span>
                      </button>
                    </div>

                    <!-- Highlighted Timeframe KPI Strip -->
                    <div
                      v-if="getHighlightedQuickLookStat(lic.id)"
                      class="quick-look-kpi-strip"
                      data-testid="quick-look-highlighted-kpis"
                    >
                      <div class="quick-look-kpi-cell">
                        <span class="quick-look-kpi-label">
                          Win Rate ({{ getHighlightedQuickLookStat(lic.id)?.timeframe }})
                        </span>
                        <strong
                          class="quick-look-kpi-val mono"
                          style="color: var(--accent-emerald-bright);"
                          data-testid="quick-look-active-win-rate"
                        >
                          {{ getHighlightedQuickLookStat(lic.id)?.winRatePct.toFixed(1) }}%
                        </strong>
                      </div>
                      <div class="quick-look-kpi-cell">
                        <span class="quick-look-kpi-label">Profit Factor</span>
                        <strong
                          class="quick-look-kpi-val mono"
                          style="color: var(--accent-sky);"
                          data-testid="quick-look-active-profit-factor"
                        >
                          {{ getHighlightedQuickLookStat(lic.id)?.profitFactor.toFixed(2) }}
                        </strong>
                      </div>
                      <div class="quick-look-kpi-cell">
                        <span class="quick-look-kpi-label">Sharpe Ratio</span>
                        <strong class="quick-look-kpi-val mono">
                          {{ getHighlightedQuickLookStat(lic.id)?.sharpeRatio.toFixed(2) }}
                        </strong>
                      </div>
                      <div class="quick-look-kpi-cell">
                        <span class="quick-look-kpi-label">90D Net Return</span>
                        <strong
                          class="quick-look-kpi-val mono"
                          style="color: var(--accent-emerald-bright);"
                        >
                          +{{ getHighlightedQuickLookStat(lic.id)?.netReturnPct.toFixed(1) }}%
                        </strong>
                      </div>
                    </div>

                    <!-- Full 6-Timeframe Matrix Table (1m, 5m, 15m, 1H, 4H, 1D) -->
                    <div class="quick-look-table-wrap">
                      <table
                        class="quick-look-matrix-table"
                        data-testid="quick-look-timeframe-table"
                      >
                        <thead>
                          <tr>
                            <th>TF</th>
                            <th>Regime</th>
                            <th class="num-col">Win Rate</th>
                            <th class="num-col">Profit Factor</th>
                            <th class="num-col">Sharpe</th>
                            <th class="num-col">Net Ret</th>
                            <th class="num-col">Max DD</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            v-for="tfStat in quickLookByLicenseId[lic.id].timeframes"
                            :key="`row-${lic.id}-${tfStat.timeframe}`"
                            :class="{
                              'active-row':
                                getHighlightedQuickLookStat(lic.id)?.timeframe ===
                                tfStat.timeframe,
                            }"
                            :data-testid="`quick-look-row-${tfStat.timeframe}`"
                            @mouseenter="setQuickLookTimeframe(lic.id, tfStat.timeframe)"
                            @click.stop="setQuickLookTimeframe(lic.id, tfStat.timeframe)"
                          >
                            <td class="mono" style="font-weight: 700; color: var(--text-primary);">
                              {{ tfStat.timeframe }}
                              <span
                                v-if="
                                  quickLookByLicenseId[lic.id].bestTimeframe ===
                                  tfStat.timeframe
                                "
                                class="quick-look-best-tag"
                              >
                                BEST
                              </span>
                            </td>
                            <td style="color: var(--text-secondary); font-size: 0.72rem;">
                              {{ tfStat.regimeTag }}
                            </td>
                            <td
                              class="num-col"
                              style="color: var(--accent-emerald-bright); font-weight: 600;"
                            >
                              {{ tfStat.winRatePct.toFixed(1) }}%
                            </td>
                            <td
                              class="num-col"
                              style="color: var(--accent-sky); font-weight: 600;"
                            >
                              {{ tfStat.profitFactor.toFixed(2) }}
                            </td>
                            <td class="num-col">
                              {{ tfStat.sharpeRatio.toFixed(2) }}
                            </td>
                            <td
                              class="num-col"
                              style="color: var(--accent-emerald-bright);"
                            >
                              +{{ tfStat.netReturnPct.toFixed(1) }}%
                            </td>
                            <td
                              class="num-col"
                              style="color: var(--text-secondary);"
                            >
                              -{{ tfStat.maxDrawdownPct.toFixed(2) }}%
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <!-- Tooltip Footer -->
                    <div class="quick-look-popover-footer">
                      <span class="form-hint" style="font-size: 0.72rem;">
                        Optimal TF:
                        <strong class="mono" style="color: var(--accent-emerald-bright);">
                          {{ quickLookByLicenseId[lic.id].bestTimeframe }}
                        </strong>
                        ({{ quickLookByLicenseId[lic.id].bestWinRatePct.toFixed(1) }}% Win ·
                        {{ quickLookByLicenseId[lic.id].bestProfitFactor.toFixed(2) }} PF)
                      </span>
                      <button
                        type="button"
                        class="btn-ghost quick-look-deeplink-btn"
                        data-testid="quick-look-open-backtester-btn"
                        @click.stop="
                          launchFullBacktestFromTooltip(
                            lic,
                            getHighlightedQuickLookStat(lic.id)?.timeframe
                          )
                        "
                      >
                        Open in Full Backtester →
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Column 2: TradingView Invite-Only Handle Sync -->
              <div>
                <div class="form-label" style="margin-bottom: 6px;">
                  TradingView Invite-Only Script Access
                </div>

                <div v-if="editingLicenseId !== lic.id" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                  <span class="mono" style="font-size: 0.9375rem; color: var(--accent-emerald-bright); font-weight: 600;">
                    @{{ lic.tradingViewUsername }}
                  </span>
                  <button
                    type="button"
                    class="btn-ghost"
                    :aria-label="`Change TradingView handle for ${lic.indicatorName}`"
                    @click="startEditingTvHandle(lic)"
                  >
                    Change TradingView Handle
                  </button>
                </div>

                <div v-else style="display: flex; flex-direction: column; gap: 8px;">
                  <div style="display: flex; gap: 8px;">
                    <input
                      v-model="tvHandleDraft"
                      type="text"
                      class="form-input mono"
                      aria-label="New TradingView Username"
                      placeholder="New TradingView Handle"
                    />
                    <button
                      type="button"
                      class="btn-primary"
                      :disabled="syncingId === lic.id"
                      @click="saveTvHandleSync(lic)"
                    >
                      {{ syncingId === lic.id ? 'Syncing...' : 'Sync ACL' }}
                    </button>
                    <button
                      type="button"
                      class="btn-ghost"
                      @click="editingLicenseId = null"
                    >
                      Cancel
                    </button>
                  </div>
                  <span v-if="syncError" class="form-error" role="alert">
                    {{ syncError }}
                  </span>
                </div>

                <div class="form-hint" style="margin-top: 6px;">
                  Available in TradingView under <em>Indicators → Invite-Only Scripts</em>.
                </div>
              </div>

              <!-- Column 3: Installation File Downloads (.ts Study + Complete Package + tos.mx) -->
              <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-end;">
                <button
                  type="button"
                  class="btn-primary"
                  style="width: 100%;"
                  :aria-label="`Download thinkorswim .ts for ${lic.indicatorName}`"
                  @click="downloadThinkScriptStudy(lic)"
                >
                  Download thinkorswim .ts ({{ lic.tosDownloadCount }})
                </button>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%;">
                  <button
                    type="button"
                    class="btn-secondary"
                    style="padding: 8px 10px; min-height: 36px; font-size: 0.75rem;"
                    data-testid="download-complete-bundle-btn"
                    @click="downloadCompleteInstallationPackage(lic)"
                  >
                    Full Install Bundle
                  </button>
                  <button
                    type="button"
                    class="btn-ghost"
                    style="padding: 8px 10px; min-height: 36px; font-size: 0.75rem;"
                    :aria-label="`Copy tos.mx link for ${lic.indicatorName}`"
                    @click="copyText(lic.tosShareLink, 'thinkorswim Shared Link')"
                  >
                    Copy tos.mx Link
                  </button>
                </div>
              </div>
            </article>
          </div>

          <!-- Empty State -->
          <div
            v-else
            class="bento-panel"
            style="text-align: center; padding: 48px 24px; align-items: center;"
          >
            <h2 style="font-family: var(--font-display); font-size: 1.35rem;">
              No Purchased Indicators Found for {{ store.activeCustomerEmail }}
            </h2>
            <p style="color: var(--text-secondary); max-width: 50ch;">
              Add an indicator to your cart or select a membership tier to trigger instant automated
              TradingView and thinkorswim provisioning.
            </p>
            <div style="display: flex; gap: 12px; margin-top: 8px;">
              <button
                type="button"
                class="btn-primary"
                @click="emit('navigate', 'storefront')"
              >
                Browse Indicator Catalog
              </button>
              <button
                type="button"
                class="btn-secondary"
                @click="store.isCartDrawerOpen = true"
              >
                Open Shopping Cart
              </button>
            </div>
          </div>

          <!-- Downloaded ThinkScript Artifact Inspector Drawer -->
          <div
            v-if="activeArtifactPreview"
            class="code-drawer"
            style="margin-top: 32px;"
            data-testid="tos-artifact-inspector"
          >
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 12px; flex-wrap: wrap;">
              <div class="meta-line">
                <span class="meta-accent">Generated thinkorswim Study File</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span class="mono">{{ activeArtifactPreview.filename }}</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span class="mono">License {{ activeArtifactPreview.licenseKey }}</span>
              </div>
              <div style="display: flex; gap: 8px;">
                <button
                  type="button"
                  class="btn-secondary"
                  @click="copyText(activeArtifactPreview.content, 'ThinkScript Study Code')"
                >
                  Copy Full ThinkScript
                </button>
                <button
                  type="button"
                  class="btn-ghost"
                  @click="activeArtifactPreview = null"
                >
                  Close Inspector
                </button>
              </div>
            </div>
            <pre>{{ activeArtifactPreview.content }}</pre>
          </div>
        </div>

        <!-- =================================================================
             SUBSCRIBED INDICATOR PRICE ALERTS SECTION (EMAIL & SMS TOGGLES)
             Uses existing store.customerLicenses (LicenseRecord) data structure.
             Rendered directly in the main Purchased Indicators view AND in the
             dedicated Price Alerts tab for immediate visibility.
             ================================================================= -->
        <section
          v-if="activePortalTab === 'indicators' || activePortalTab === 'alerts'"
          class="bento-panel"
          :style="{ marginTop: activePortalTab === 'indicators' ? '28px' : '0' }"
          data-testid="subscribed-indicator-price-alerts-section"
          aria-labelledby="price-alerts-section-heading"
        >
          <!-- Section Header & Bulk Controls -->
          <div
            style="
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 16px;
              flex-wrap: wrap;
              padding-bottom: 18px;
              border-bottom: 1px solid var(--border-hairline);
            "
          >
            <div>
              <div class="meta-line">
                <span class="meta-accent">Real-Time Signal Routing</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span class="mono">
                  {{ priceAlertSummary.totalSubscribedIndicators }} Subscribed Indicator(s)
                </span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span class="mono" style="color: var(--accent-emerald-bright);">
                  {{ priceAlertSummary.activeCoveragePct }}% Alert Coverage
                </span>
              </div>
              <h2
                id="price-alerts-section-heading"
                style="
                  font-family: var(--font-display);
                  font-size: 1.35rem;
                  font-weight: 700;
                  margin-top: 6px;
                "
              >
                Subscribed Indicator Price Alerts (Email &amp; SMS)
              </h2>
              <p
                style="
                  color: var(--text-secondary);
                  font-size: 0.875rem;
                  margin-top: 4px;
                  max-width: 68ch;
                "
              >
                Toggle automated <strong>Email</strong> or <strong>SMS</strong> price and regime
                alerts for each of your purchased indicators bound to
                <span class="mono" style="color: var(--text-primary);">{{ store.activeCustomerEmail }}</span>.
              </p>
            </div>

            <!-- Bulk Channel Action Buttons -->
            <div
              v-if="store.customerLicenses.length > 0"
              style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;"
            >
              <button
                type="button"
                class="btn-secondary"
                style="padding: 8px 12px; min-height: 36px; font-size: 0.75rem;"
                data-testid="bulk-enable-email-alerts-btn"
                @click="handleBulkPriceAlerts('email', true)"
              >
                Enable All Email
              </button>
              <button
                type="button"
                class="btn-secondary"
                style="padding: 8px 12px; min-height: 36px; font-size: 0.75rem;"
                data-testid="bulk-enable-sms-alerts-btn"
                @click="handleBulkPriceAlerts('sms', true)"
              >
                Enable All SMS
              </button>
              <button
                type="button"
                class="btn-ghost"
                style="padding: 8px 12px; min-height: 36px; font-size: 0.75rem;"
                data-testid="bulk-mute-all-alerts-btn"
                @click="handleBulkPriceAlerts('all', false)"
              >
                Mute All Alerts
              </button>
            </div>
          </div>

          <!-- Price Alert Summary KPI Bar -->
          <div
            class="kpi-strip"
            style="margin-top: 18px; margin-bottom: 18px;"
            data-testid="price-alerts-summary-strip"
          >
            <div class="kpi-item">
              <span class="kpi-number mono" data-testid="kpi-email-alerts-active">
                {{ priceAlertSummary.emailEnabledCount }} / {{ priceAlertSummary.totalSubscribedIndicators }}
              </span>
              <span class="kpi-label">Email Price Alerts Active</span>
              <span class="kpi-context mono">{{ alertEmailDestination }}</span>
            </div>
            <div class="kpi-item">
              <span class="kpi-number mono" data-testid="kpi-sms-alerts-active">
                {{ priceAlertSummary.smsEnabledCount }} / {{ priceAlertSummary.totalSubscribedIndicators }}
              </span>
              <span class="kpi-label">SMS Price Alerts Active</span>
              <span class="kpi-context mono">{{ alertSmsDestination }}</span>
            </div>
            <div class="kpi-item">
              <span class="kpi-number mono" data-testid="kpi-dual-channel-count">
                {{ priceAlertSummary.dualChannelCount }}
              </span>
              <span class="kpi-label">Dual-Channel Indicators</span>
              <span class="kpi-context">Simultaneous Email + SMS dispatch</span>
            </div>
            <div class="kpi-item">
              <span class="kpi-number mono" data-testid="kpi-alert-coverage-pct">
                {{ priceAlertSummary.activeCoveragePct }}%
              </span>
              <span class="kpi-label">Subscribed Coverage</span>
              <span class="kpi-context">
                {{ priceAlertSummary.anyChannelActiveCount }} active · {{ priceAlertSummary.fullyMutedCount }} muted
              </span>
            </div>
          </div>

          <!-- Delivery Endpoint Configuration Row -->
          <form
            novalidate
            style="
              padding: 14px 16px;
              background: var(--bg-obsidian);
              border: 1px solid var(--border-hairline);
              border-radius: var(--radius-md);
              margin-bottom: 18px;
            "
            data-testid="price-alert-delivery-form"
            @submit.prevent="saveAlertDeliveryEndpoints"
          >
            <div
              style="
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                gap: 12px;
                align-items: end;
              "
            >
              <div class="form-field" style="margin-bottom: 0;">
                <label for="alert-email-dest-input" class="form-label">
                  Email Alert Destination
                </label>
                <input
                  id="alert-email-dest-input"
                  v-model="alertEmailDestination"
                  type="email"
                  class="form-input mono"
                  placeholder="marcus.vance@apexquant.io"
                  data-testid="alert-email-destination-input"
                />
              </div>

              <div class="form-field" style="margin-bottom: 0;">
                <label for="alert-sms-dest-input" class="form-label">
                  SMS Mobile Alert Destination
                </label>
                <input
                  id="alert-sms-dest-input"
                  v-model="alertSmsDestination"
                  type="tel"
                  class="form-input mono"
                  placeholder="+1 (212) 555-0194"
                  data-testid="alert-sms-destination-input"
                />
              </div>

              <div style="display: flex; align-items: center; gap: 10px;">
                <button
                  type="submit"
                  class="btn-secondary"
                  style="width: 100%; min-height: 40px;"
                  data-testid="save-alert-endpoints-btn"
                >
                  Save Alert Endpoints
                </button>
              </div>
            </div>

            <div
              v-if="alertDeliveryError"
              class="form-error"
              style="margin-top: 8px;"
              role="alert"
              data-testid="alert-delivery-error"
            >
              {{ alertDeliveryError }}
            </div>
          </form>

          <!-- Live Test Dispatch Confirmation Banner -->
          <div
            v-if="lastDispatchedAlertBanner"
            style="
              padding: 12px 16px;
              margin-bottom: 16px;
              background: var(--bg-obsidian);
              border: 1px solid var(--accent-emerald);
              border-radius: var(--radius-md);
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 12px;
              flex-wrap: wrap;
            "
            role="status"
            data-testid="test-price-alert-confirmation"
          >
            <div class="meta-line">
              <span class="mono" style="color: var(--accent-emerald-bright); font-weight: 700;">
                TEST SIGNAL DISPATCHED
              </span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span style="color: var(--text-primary); font-weight: 600;">
                {{ lastDispatchedAlertBanner.indicatorName }}
              </span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span class="mono">{{ lastDispatchedAlertBanner.licenseKey }}</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>{{ lastDispatchedAlertBanner.triggerLabel }}</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span class="mono" style="color: var(--accent-sky);">
                {{ lastDispatchedAlertBanner.channelsLabel }}
              </span>
            </div>
            <button
              type="button"
              class="btn-ghost"
              style="padding: 4px 10px; min-height: 28px; font-size: 0.75rem;"
              @click="lastDispatchedAlertBanner = null"
            >
              Dismiss
            </button>
          </div>

          <!-- Per-Indicator Price Alert Toggle List (using store.customerLicenses) -->
          <div
            v-if="hydratedPriceAlerts.length > 0"
            class="license-list"
            data-testid="price-alert-indicator-list"
          >
            <div
              v-for="(pref, idx) in hydratedPriceAlerts"
              :key="`alert-row-${pref.licenseId}`"
              class="license-panel"
              :data-testid="`price-alert-row-${pref.licenseId}`"
            >
              <!-- Column 1: Subscribed Product Metadata (from LicenseRecord) -->
              <div>
                <div class="meta-line">
                  <span
                    :style="{
                      color:
                        pref.tvAccessStatus === 'Provisioned'
                          ? 'var(--accent-emerald-bright)'
                          : 'var(--accent-crimson)',
                      fontWeight: 600,
                    }"
                  >
                    {{ pref.tvAccessStatus }}
                  </span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span>{{ pref.billingCycle }} Plan</span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span class="mono">Key: {{ pref.licenseKey }}</span>
                </div>

                <h3
                  style="
                    font-family: var(--font-display);
                    font-size: 1.15rem;
                    font-weight: 700;
                    margin-top: 6px;
                  "
                >
                  {{ pref.indicatorName }}
                </h3>

                <div class="meta-line" style="margin-top: 6px;">
                  <span>Trigger: <strong style="color: var(--text-primary);">{{ pref.signalTriggerLabel }}</strong></span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span class="mono">{{ pref.monitoredTickersLabel }}</span>
                </div>
              </div>

              <!-- Column 2: Email & SMS Price Alert Toggles -->
              <div>
                <div class="form-label" style="margin-bottom: 8px;">
                  Notification Channels (Email &amp; SMS Price Alerts)
                </div>

                <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                  <!-- Email Price Alert Switch -->
                  <button
                    type="button"
                    role="switch"
                    :aria-checked="pref.emailEnabled"
                    :aria-label="`Toggle Email price alerts for ${pref.indicatorName}`"
                    :data-testid="`toggle-email-alert-${pref.licenseId}`"
                    :class="pref.emailEnabled ? 'btn-primary' : 'btn-secondary'"
                    style="
                      min-height: 38px;
                      padding: 8px 14px;
                      font-size: 0.78rem;
                      display: inline-flex;
                      align-items: center;
                      gap: 8px;
                    "
                    @click="handleTogglePriceAlert(store.customerLicenses[idx], 'email')"
                  >
                    <span
                      aria-hidden="true"
                      :style="{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: pref.emailEnabled
                          ? '#ffffff'
                          : 'var(--text-muted)',
                      }"
                    ></span>
                    <span class="mono" style="font-weight: 700;">
                      Email Alerts: {{ pref.emailEnabled ? 'ON' : 'OFF' }}
                    </span>
                  </button>

                  <!-- SMS Price Alert Switch -->
                  <button
                    type="button"
                    role="switch"
                    :aria-checked="pref.smsEnabled"
                    :aria-label="`Toggle SMS price alerts for ${pref.indicatorName}`"
                    :data-testid="`toggle-sms-alert-${pref.licenseId}`"
                    :class="pref.smsEnabled ? 'btn-primary' : 'btn-secondary'"
                    style="
                      min-height: 38px;
                      padding: 8px 14px;
                      font-size: 0.78rem;
                      display: inline-flex;
                      align-items: center;
                      gap: 8px;
                    "
                    @click="handleTogglePriceAlert(store.customerLicenses[idx], 'sms')"
                  >
                    <span
                      aria-hidden="true"
                      :style="{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: pref.smsEnabled
                          ? '#ffffff'
                          : 'var(--text-muted)',
                      }"
                    ></span>
                    <span class="mono" style="font-weight: 700;">
                      SMS Alerts: {{ pref.smsEnabled ? 'ON' : 'OFF' }}
                    </span>
                  </button>
                </div>

                <div class="form-hint mono" style="margin-top: 6px; font-size: 0.75rem;">
                  <span v-if="pref.emailEnabled && pref.smsEnabled">
                    Active Routing: Email ({{ alertEmailDestination }}) + SMS ({{ alertSmsDestination }})
                  </span>
                  <span v-else-if="pref.emailEnabled">
                    Active Routing: Email only ({{ alertEmailDestination }})
                  </span>
                  <span v-else-if="pref.smsEnabled">
                    Active Routing: SMS only ({{ alertSmsDestination }})
                  </span>
                  <span v-else style="color: var(--accent-amber);">
                    Muted: Enable Email or SMS above to receive real-time price alerts
                  </span>
                </div>
              </div>

              <!-- Column 3: Test Dispatch & Sync Timestamp -->
              <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-end; justify-content: center;">
                <button
                  type="button"
                  class="btn-secondary"
                  style="width: 100%; min-height: 36px; font-size: 0.75rem;"
                  :data-testid="`test-price-alert-${pref.licenseId}`"
                  :aria-label="`Send test price alert for ${pref.indicatorName}`"
                  @click="dispatchTestPriceAlert(pref)"
                >
                  Send Test Price Alert
                </button>
                <div class="meta-line mono" style="font-size: 0.72rem;">
                  <span>Handle: @{{ pref.tradingViewUsername }}</span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span>Updated {{ pref.updatedAt }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Empty State when customer has no subscribed indicators -->
          <div
            v-else
            style="text-align: center; padding: 32px 16px;"
            data-testid="price-alerts-empty-state"
          >
            <p style="color: var(--text-secondary);">
              No subscribed indicators found for <span class="mono">{{ store.activeCustomerEmail }}</span>.
              Purchase or bind an indicator license to configure Email and SMS price alerts.
            </p>
          </div>
        </section>

        <!-- =================================================================
             HISTORICAL TICKER PERFORMANCE BACKTESTER MODULE
             Mapped specifically to the user's purchased StratEdge Algo indicators
             (store.customerLicenses). Rendered on 'indicators' & 'backtest' tabs.
             ================================================================= -->
        <section
          v-if="activePortalTab === 'indicators' || activePortalTab === 'backtest'"
          class="bento-panel"
          :style="{ marginTop: activePortalTab === 'indicators' ? '28px' : '0' }"
          data-testid="purchased-indicator-backtest-section"
          aria-labelledby="backtest-module-heading"
        >
          <!-- Module Header -->
          <div
            style="
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 16px;
              flex-wrap: wrap;
              padding-bottom: 18px;
              border-bottom: 1px solid var(--border-hairline);
            "
          >
            <div>
              <div class="meta-line">
                <span class="meta-accent">Quantitative Historical Backtest Engine</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span>Strict Non-Repainting Bar-Close Execution</span>
                <span v-if="activeBacktestResult" class="meta-sep" aria-hidden="true">·</span>
                <span
                  v-if="activeBacktestResult"
                  class="mono"
                  style="color: var(--accent-emerald-bright);"
                >
                  Bound License: {{ activeBacktestResult.licenseKey }}
                </span>
              </div>
              <h2
                id="backtest-module-heading"
                style="
                  font-family: var(--font-display);
                  font-size: 1.35rem;
                  font-weight: 700;
                  margin-top: 6px;
                "
              >
                Purchased Indicator Historical Ticker Backtester
              </h2>
              <p
                style="
                  color: var(--text-secondary);
                  font-size: 0.875rem;
                  margin-top: 4px;
                  max-width: 72ch;
                "
              >
                Input any historical futures, index, equity, or crypto ticker to simulate and
                visualize non-repainting performance backtests mapped directly to the
                <strong>StratEdge Algo</strong> indicators licensed under
                <span class="mono" style="color: var(--text-primary);">{{ store.activeCustomerEmail }}</span>.
              </p>
            </div>

            <!-- Quick Ticker Presets -->
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
              <span class="form-label" style="margin-bottom: 0;">
                Instant Benchmark Tickers
              </span>
              <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                <button
                  v-for="preset in backtestPresetTickers"
                  :key="preset"
                  type="button"
                  :class="backtestAppliedTicker === preset ? 'btn-primary' : 'btn-secondary'"
                  style="padding: 6px 10px; min-height: 32px; font-size: 0.75rem;"
                  :data-testid="`backtest-preset-${preset}`"
                  @click="runHistoricalTickerBacktest(preset)"
                >
                  <span class="mono">{{ preset }}</span>
                </button>
              </div>
            </div>
          </div>

          <div v-if="store.customerLicenses.length > 0 && activeBacktestResult">
            <!-- Step 1: Select Purchased StratEdge Algo Indicator Entitlement -->
            <div style="margin-top: 18px; margin-bottom: 16px;">
              <div class="form-label" style="margin-bottom: 8px;">
                1. Mapped Purchased StratEdge Algo Indicator License ({{ store.customerLicenses.length }} Active Entitlements)
              </div>
              <div
                style="
                  display: grid;
                  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
                  gap: 10px;
                "
                data-testid="backtest-purchased-license-selector"
              >
                <button
                  v-for="lic in store.customerLicenses"
                  :key="`bt-lic-${lic.id}`"
                  type="button"
                  :data-testid="`backtest-select-license-${lic.id}`"
                  :aria-pressed="activeBacktestLicense?.id === lic.id"
                  style="
                    text-align: left;
                    padding: 12px 14px;
                    border-radius: var(--radius-md);
                    background: var(--bg-obsidian);
                    cursor: pointer;
                    transition: border-color 0.15s ease;
                  "
                  :style="{
                    border:
                      activeBacktestLicense?.id === lic.id
                        ? '1px solid var(--accent-emerald)'
                        : '1px solid var(--border-hairline)',
                  }"
                  @click="selectBacktestPurchasedLicense(lic.id)"
                >
                  <div class="meta-line">
                    <span
                      class="mono"
                      :style="{
                        color:
                          activeBacktestLicense?.id === lic.id
                            ? 'var(--accent-emerald-bright)'
                            : 'var(--text-secondary)',
                        fontWeight: 700,
                      }"
                    >
                      {{ lic.licenseKey }}
                    </span>
                    <span class="meta-sep" aria-hidden="true">·</span>
                    <span>{{ lic.billingCycle }}</span>
                  </div>
                  <div
                    style="
                      font-family: var(--font-display);
                      font-weight: 700;
                      font-size: 0.95rem;
                      color: var(--text-primary);
                      margin-top: 4px;
                    "
                  >
                    {{ lic.indicatorName }}
                  </div>
                </button>
              </div>
            </div>

            <!-- Step 2: Historical Ticker Input & Parameter Controls Form -->
            <form
              novalidate
              style="
                padding: 14px 16px;
                background: var(--bg-obsidian);
                border: 1px solid var(--border-hairline);
                border-radius: var(--radius-md);
                margin-bottom: 18px;
              "
              data-testid="backtest-controls-form"
              @submit.prevent="runHistoricalTickerBacktest()"
            >
              <div
                style="
                  display: grid;
                  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
                  gap: 12px;
                  align-items: end;
                "
              >
                <div class="form-field" style="margin-bottom: 0;">
                  <label for="backtest-ticker-input" class="form-label">
                    Historical Ticker Symbol
                  </label>
                  <input
                    id="backtest-ticker-input"
                    v-model="backtestTickerInput"
                    type="text"
                    class="form-input mono"
                    placeholder="e.g. NVDA, ES1!, SPX, TSLA"
                    data-testid="backtest-ticker-input"
                  />
                </div>

                <div class="form-field" style="margin-bottom: 0;">
                  <label for="backtest-timeframe-select" class="form-label">
                    Chart Aggregation Timeframe
                  </label>
                  <select
                    id="backtest-timeframe-select"
                    v-model="backtestTimeframe"
                    class="form-select mono"
                    data-testid="backtest-timeframe-select"
                    @change="runHistoricalTickerBacktest()"
                  >
                    <option value="1m">1m (0DTE Micro-Scalp)</option>
                    <option value="5m">5m (Intraday Institutional)</option>
                    <option value="15m">15m (Session Structure)</option>
                    <option value="1H">1H (Multi-Day Swing)</option>
                    <option value="4H">4H (Macro Regime)</option>
                    <option value="1D">1D (Position Portfolio)</option>
                  </select>
                </div>

                <div class="form-field" style="margin-bottom: 0;">
                  <label for="backtest-lookback-select" class="form-label">
                    Historical Lookback Window
                  </label>
                  <select
                    id="backtest-lookback-select"
                    v-model="backtestLookbackWindow"
                    class="form-select mono"
                    data-testid="backtest-lookback-select"
                    @change="runHistoricalTickerBacktest()"
                  >
                    <option value="30D">30D (1-Month Rolling)</option>
                    <option value="90D">90D (Quarterly Audit)</option>
                    <option value="180D">180D (Semi-Annual)</option>
                    <option value="1Y">1Y (Full 252-Session Year)</option>
                  </select>
                </div>

                <div class="form-field" style="margin-bottom: 0;">
                  <label for="backtest-capital-input" class="form-label">
                    Starting Desk Capital (USD)
                  </label>
                  <input
                    id="backtest-capital-input"
                    v-model.number="backtestStartingCapital"
                    type="number"
                    min="1000"
                    max="10000000"
                    step="5000"
                    class="form-input mono"
                    data-testid="backtest-capital-input"
                  />
                </div>

                <div>
                  <button
                    type="submit"
                    class="btn-primary"
                    style="width: 100%; min-height: 40px;"
                    data-testid="run-backtest-btn"
                  >
                    Run Ticker Backtest →
                  </button>
                </div>
              </div>

              <div
                v-if="backtestError"
                class="form-error"
                style="margin-top: 8px;"
                role="alert"
                data-testid="backtest-input-error"
              >
                {{ backtestError }}
              </div>
            </form>

            <!-- Step 3: Backtest Performance KPI Strip -->
            <div
              class="kpi-strip"
              style="margin-top: 0; margin-bottom: 18px;"
              data-testid="backtest-kpi-strip"
            >
              <div class="kpi-item">
                <span
                  class="kpi-number mono"
                  style="color: var(--accent-emerald-bright);"
                  data-testid="backtest-kpi-net-return"
                >
                  +{{ activeBacktestResult.netReturnPct.toFixed(2) }}%
                </span>
                <span class="kpi-label">
                  Strategy Net Return ({{ activeBacktestResult.ticker }})
                </span>
                <span class="kpi-context mono">
                  +${{ activeBacktestResult.netProfitUsd.toLocaleString() }} (+{{ activeBacktestResult.alphaOutperformancePct.toFixed(1) }}% Alpha vs B&amp;H)
                </span>
              </div>

              <div class="kpi-item">
                <span class="kpi-number mono" data-testid="backtest-kpi-win-rate">
                  {{ activeBacktestResult.winRatePct }}%
                </span>
                <span class="kpi-label">Confirmed Signal Win Rate</span>
                <span class="kpi-context mono">
                  {{ activeBacktestResult.winningTrades }}W · {{ activeBacktestResult.losingTrades }}L ({{ activeBacktestResult.totalTrades }} Trades)
                </span>
              </div>

              <div class="kpi-item">
                <span class="kpi-number mono" data-testid="backtest-kpi-profit-factor">
                  {{ activeBacktestResult.profitFactor }}
                </span>
                <span class="kpi-label">Profit Factor &amp; Sharpe</span>
                <span class="kpi-context mono">
                  Sharpe {{ activeBacktestResult.sharpeRatio }} · Avg +{{ activeBacktestResult.avgRMultiple }}R
                </span>
              </div>

              <div class="kpi-item">
                <span class="kpi-number mono" data-testid="backtest-kpi-max-dd">
                  -{{ activeBacktestResult.maxDrawdownPct }}%
                </span>
                <span class="kpi-label">Max Peak-to-Trough Drawdown</span>
                <span class="kpi-context mono">
                  Ending Equity: ${{ activeBacktestResult.endingEquityUsd.toLocaleString() }}
                </span>
              </div>
            </div>

            <!-- Step 4: Interactive SVG Strategy Equity Curve vs. Buy & Hold Benchmark -->
            <div
              style="
                padding: 16px;
                background: var(--bg-obsidian);
                border: 1px solid var(--border-hairline);
                border-radius: var(--radius-md);
                margin-bottom: 18px;
              "
              data-testid="backtest-equity-chart-container"
            >
              <div
                style="
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  gap: 12px;
                  flex-wrap: wrap;
                  margin-bottom: 12px;
                "
              >
                <div>
                  <div class="meta-line">
                    <span class="mono" style="color: var(--accent-emerald-bright); font-weight: 700;">
                      {{ activeBacktestResult.ticker }} · {{ activeBacktestResult.timeframe }} · {{ activeBacktestResult.lookbackWindow }}
                    </span>
                    <span class="meta-sep" aria-hidden="true">·</span>
                    <span style="color: var(--text-primary); font-weight: 600;">
                      {{ activeBacktestResult.indicatorName }}
                    </span>
                    <span class="meta-sep" aria-hidden="true">·</span>
                    <span class="mono">{{ activeBacktestResult.strategyArchitectureLabel }}</span>
                  </div>
                </div>

                <div class="meta-line mono" style="font-size: 0.75rem;">
                  <span style="color: var(--accent-emerald-bright);">
                    ■ StratEdge Equity (+{{ activeBacktestResult.netReturnPct.toFixed(1) }}%)
                  </span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span style="color: var(--text-secondary);">
                    - - Benchmark Buy &amp; Hold (+{{ activeBacktestResult.benchmarkBuyHoldReturnPct.toFixed(1) }}%)
                  </span>
                </div>
              </div>

              <!-- SVG Equity Curve Canvas -->
              <svg
                :viewBox="`0 0 ${backtestChartGeometry.width} ${backtestChartGeometry.height}`"
                style="width: 100%; height: 220px; display: block; overflow: visible;"
                role="img"
                :aria-label="`Historical equity curve for ${activeBacktestResult.ticker} using ${activeBacktestResult.indicatorName}`"
                data-testid="backtest-equity-svg"
              >
                <defs>
                  <linearGradient id="stratedgeBacktestAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#10b981" stop-opacity="0.32" />
                    <stop offset="100%" stop-color="#10b981" stop-opacity="0.02" />
                  </linearGradient>
                </defs>

                <!-- Horizontal Reference Grid Lines -->
                <line
                  x1="24"
                  y1="32"
                  x2="736"
                  y2="32"
                  stroke="rgba(148, 163, 184, 0.14)"
                  stroke-dasharray="3 3"
                />
                <line
                  x1="24"
                  y1="110"
                  x2="736"
                  y2="110"
                  stroke="rgba(148, 163, 184, 0.14)"
                  stroke-dasharray="3 3"
                />
                <line
                  x1="24"
                  y1="198"
                  x2="736"
                  y2="198"
                  stroke="rgba(148, 163, 184, 0.22)"
                />

                <!-- Strategy Shaded Area -->
                <path
                  v-if="backtestChartGeometry.strategyAreaPath"
                  :d="backtestChartGeometry.strategyAreaPath"
                  fill="url(#stratedgeBacktestAreaGrad)"
                />

                <!-- Benchmark Buy & Hold Polyline -->
                <polyline
                  v-if="backtestChartGeometry.benchmarkPolyline"
                  :points="backtestChartGeometry.benchmarkPolyline"
                  fill="none"
                  stroke="#64748b"
                  stroke-width="1.75"
                  stroke-dasharray="5 4"
                />

                <!-- StratEdge Indicator Strategy Equity Polyline -->
                <polyline
                  v-if="backtestChartGeometry.strategyPolyline"
                  :points="backtestChartGeometry.strategyPolyline"
                  fill="none"
                  stroke="#10b981"
                  stroke-width="2.75"
                />

                <!-- Interactive Equity Curve Nodes -->
                <g
                  v-for="node in backtestChartGeometry.nodes"
                  :key="`eq-node-${node.stepIndex}`"
                  style="cursor: pointer;"
                  @click="selectedEquityPointIndex = node.stepIndex"
                  @mouseenter="selectedEquityPointIndex = node.stepIndex"
                >
                  <circle
                    :cx="node.x"
                    :cy="node.y"
                    :r="inspectedEquityPoint?.stepIndex === node.stepIndex ? 6 : 3.5"
                    :fill="
                      inspectedEquityPoint?.stepIndex === node.stepIndex
                        ? '#34d399'
                        : '#05080f'
                    "
                    stroke="#10b981"
                    stroke-width="2"
                  />
                </g>
              </svg>

              <!-- Inspected Historical Point Telemetry Bar -->
              <div
                v-if="inspectedEquityPoint"
                style="
                  margin-top: 10px;
                  padding-top: 10px;
                  border-top: 1px solid var(--border-hairline);
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  gap: 12px;
                  flex-wrap: wrap;
                "
                data-testid="backtest-inspected-point-bar"
              >
                <div class="meta-line mono">
                  <span style="color: var(--accent-emerald-bright); font-weight: 700;">
                    SESSION {{ inspectedEquityPoint.dateLabel }}
                  </span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span>
                    Strategy Equity:
                    <strong style="color: var(--text-primary);">
                      ${{ inspectedEquityPoint.strategyEquity.toLocaleString() }}
                    </strong>
                    (+{{ inspectedEquityPoint.cumulativeReturnPct }}%)
                  </span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span>
                    Benchmark: ${{ inspectedEquityPoint.benchmarkEquity.toLocaleString() }}
                  </span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span>Drawdown: -{{ inspectedEquityPoint.drawdownPct }}%</span>
                </div>
                <div class="meta-line mono" style="font-size: 0.75rem;">
                  <span>Active Signal Regime:</span>
                  <strong style="color: var(--accent-sky);">
                    {{ inspectedEquityPoint.signalRegime }}
                  </strong>
                </div>
              </div>
            </div>

            <!-- Step 5: Historical Non-Repainting Signal Execution Log -->
            <div>
              <div
                style="
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  margin-bottom: 10px;
                  flex-wrap: wrap;
                  gap: 8px;
                "
              >
                <div class="form-label" style="margin-bottom: 0;">
                  Recent Confirmed Signal Executions ({{ activeBacktestResult.ticker }} · {{ activeBacktestResult.indicatorName }})
                </div>
                <span class="mono" style="font-size: 0.75rem; color: var(--text-secondary);">
                  Audited on barstate.isconfirmed · 0 Lookahead Bias
                </span>
              </div>

              <div class="table-scroll-wrapper">
                <table class="data-table" data-testid="backtest-signal-log-table">
                  <thead>
                    <tr>
                      <th>Trade ID</th>
                      <th>Timestamp (UTC)</th>
                      <th>Direction</th>
                      <th>Indicator Signal Trigger</th>
                      <th style="text-align: right;">Entry → Exit</th>
                      <th style="text-align: right;">R-Multiple</th>
                      <th style="text-align: right;">Realized PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="sig in activeBacktestResult.recentSignals"
                      :key="sig.tradeId"
                      data-testid="backtest-signal-row"
                    >
                      <td class="mono" style="font-weight: 600; color: var(--text-primary);">
                        {{ sig.tradeId }}
                      </td>
                      <td class="mono">{{ sig.timestamp }}</td>
                      <td
                        class="mono"
                        :style="{
                          color:
                            sig.direction === 'LONG'
                              ? 'var(--accent-emerald-bright)'
                              : 'var(--accent-amber)',
                          fontWeight: 700,
                        }"
                      >
                        {{ sig.direction }} {{ activeBacktestResult.ticker }}
                      </td>
                      <td>{{ sig.signalTrigger }}</td>
                      <td class="mono" style="text-align: right;">
                        {{ sig.entryPrice.toLocaleString() }} → {{ sig.exitPrice.toLocaleString() }}
                      </td>
                      <td
                        class="mono"
                        style="text-align: right; font-weight: 600;"
                        :style="{
                          color:
                            sig.rMultiple >= 0
                              ? 'var(--accent-emerald-bright)'
                              : 'var(--accent-crimson)',
                        }"
                      >
                        {{ sig.rMultiple >= 0 ? `+${sig.rMultiple}R` : `${sig.rMultiple}R` }}
                      </td>
                      <td
                        class="mono"
                        style="text-align: right; font-weight: 700;"
                        :style="{
                          color:
                            sig.pnlUsd >= 0
                              ? 'var(--accent-emerald-bright)'
                              : 'var(--accent-crimson)',
                        }"
                      >
                        {{ sig.pnlUsd >= 0 ? `+$${sig.pnlUsd.toLocaleString()}` : `-$${Math.abs(sig.pnlUsd).toLocaleString()}` }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Empty State if customer has no purchased licenses -->
          <div
            v-else
            style="text-align: center; padding: 32px 16px;"
            data-testid="backtest-empty-state"
          >
            <p style="color: var(--text-secondary);">
              No purchased StratEdge Algo indicators found for
              <span class="mono">{{ store.activeCustomerEmail }}</span>.
              Complete checkout to unlock historical ticker performance backtesting.
            </p>
          </div>
        </section>

        <!-- =================================================================
             TAB 2: DOCUMENTATION & INSTALLATION GUIDES
             ================================================================= -->
        <div v-if="activePortalTab === 'guides'">
          <div class="trinity-spotlight-grid guides-grid-2">
            <!-- Guide 1: TradingView Setup Guide -->
            <article class="trinity-pillar-card" data-testid="guide-card-tv">
              <div>
                <div class="meta-line">
                  <span class="meta-accent">Documentation 01</span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span>TradingView Pine v6</span>
                </div>
                <h3 class="card-title" style="margin-top: 8px;">
                  TradingView Invite-Only Activation &amp; Webhook Setup
                </h3>
                <p class="card-tagline" style="margin-top: 8px;">
                  Personalized setup manual for <strong>@{{ store.activeTradingViewHandle }}</strong>.
                  Covers locating Invite-Only scripts, configuring GEX/CVD alerts, and binding JSON webhook payloads.
                </p>
                <ol style="padding-left: 18px; margin-top: 14px; color: var(--text-secondary); font-size: 0.875rem; display: flex; flex-direction: column; gap: 6px;">
                  <li>Verify <strong>@{{ store.activeTradingViewHandle }}</strong> shows <em>Provisioned</em>.</li>
                  <li>Open TradingView → <strong>Indicators → Invite-only scripts</strong>.</li>
                  <li>Add <strong>StratEdge Algo Gamma / Flow / Structure</strong> to chart.</li>
                </ol>
              </div>

              <div style="padding-top: 14px; border-top: 1px solid var(--border-hairline);">
                <button
                  type="button"
                  class="btn-primary"
                  style="width: 100%;"
                  data-testid="download-tv-guide-btn"
                  @click="downloadInstallationGuide('tv')"
                >
                  Download TradingView Guide (.md)
                </button>
              </div>
            </article>

            <!-- Guide 2: Charles Schwab thinkorswim Setup Guide -->
            <article class="trinity-pillar-card" data-testid="guide-card-tos">
              <div>
                <div class="meta-line">
                  <span class="meta-accent">Documentation 02</span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span>Charles Schwab thinkorswim</span>
                </div>
                <h3 class="card-title" style="margin-top: 8px;">
                  thinkorswim `.ts` Study Import &amp; `tos.mx` Workspace Guide
                </h3>
                <p class="card-tagline" style="margin-top: 8px;">
                  Step-by-step instructions for importing watermarked `.ts` ThinkScript files into
                  Charles Schwab thinkorswim Desktop (`{{ store.activeTosAccountId }}`) and configuring 0DTE scanners.
                </p>
                <ol style="padding-left: 18px; margin-top: 14px; color: var(--text-secondary); font-size: 0.875rem; display: flex; flex-direction: column; gap: 6px;">
                  <li>Download your `.ts` study from Tab 1.</li>
                  <li>In thinkorswim: <strong>Charts → Studies → Edit Studies → Import</strong>.</li>
                  <li>Or open shared workspace via <strong>Setup → Open Shared Item</strong>.</li>
                </ol>
              </div>

              <div style="padding-top: 14px; border-top: 1px solid var(--border-hairline);">
                <button
                  type="button"
                  class="btn-primary"
                  style="width: 100%;"
                  data-testid="download-tos-guide-btn"
                  @click="downloadInstallationGuide('tos')"
                >
                  Download thinkorswim Guide (.md)
                </button>
              </div>
            </article>

            <!-- Guide 3: Trinity Institutional Execution Playbook -->
            <article class="trinity-pillar-card" data-testid="guide-card-playbook">
              <div>
                <div class="meta-line">
                  <span class="meta-accent">Documentation 03</span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span>Gamma + Flow + Structure</span>
                </div>
                <h3 class="card-title" style="margin-top: 8px;">
                  Institutional 0DTE &amp; Futures Confluence Playbook
                </h3>
                <p class="card-tagline" style="margin-top: 8px;">
                  Complete quantitative execution ruleset combining Dealer GEX Call/Put Walls,
                  Cumulative Volume Delta absorption sweeps, and multi-session VWAP standard deviation bands.
                </p>
                <ol style="padding-left: 18px; margin-top: 14px; color: var(--text-secondary); font-size: 0.875rem; display: flex; flex-direction: column; gap: 6px;">
                  <li>Map 09:25 EST Zero-Gamma Flip regime.</li>
                  <li>Confirm passive dark-pool block absorption (> 2.2σ).</li>
                  <li>Enter on 1m/5m BOS/CHoCH structural trigger.</li>
                </ol>
              </div>

              <div style="padding-top: 14px; border-top: 1px solid var(--border-hairline);">
                <button
                  type="button"
                  class="btn-secondary"
                  style="width: 100%;"
                  data-testid="download-playbook-btn"
                  @click="downloadInstallationGuide('playbook')"
                >
                  Download Execution Playbook (.md)
                </button>
              </div>
            </article>

            <!-- Guide 4: Webhook & Alert Payload Documentation -->
            <article class="trinity-pillar-card" data-testid="guide-card-webhook">
              <div>
                <div class="meta-line">
                  <span class="meta-accent">Documentation 04</span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span>JSON Webhook API</span>
                </div>
                <h3 class="card-title" style="margin-top: 8px;">
                  Automated Webhook &amp; Signing Token Reference
                </h3>
                <p class="card-tagline" style="margin-top: 8px;">
                  Technical specification for routing TradingView `alert()` dispatches to your prop
                  desk execution server or Discord/Telegram channels using your personal signing token.
                </p>
                <ol style="padding-left: 18px; margin-top: 14px; color: var(--text-secondary); font-size: 0.875rem; display: flex; flex-direction: column; gap: 6px;">
                  <li>Copy your signing token from the <strong>Support Keys</strong> tab.</li>
                  <li>Paste the JSON schema into your TradingView Alert message box.</li>
                  <li>Verify 200 OK delivery with <code class="mono">{{ memberSupportKey }}</code>.</li>
                </ol>
              </div>

              <div style="padding-top: 14px; border-top: 1px solid var(--border-hairline);">
                <button
                  type="button"
                  class="btn-secondary"
                  style="width: 100%;"
                  data-testid="download-webhook-doc-btn"
                  @click="downloadInstallationGuide('webhook')"
                >
                  Download Webhook API Spec (.md)
                </button>
              </div>
            </article>
          </div>

          <!-- Interactive Guide Preview Drawer -->
          <div
            v-if="activeGuidePreview"
            class="code-drawer"
            style="margin-top: 28px;"
            data-testid="installation-guide-preview"
          >
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 12px; flex-wrap: wrap;">
              <div class="meta-line">
                <span class="meta-accent">{{ activeGuidePreview.title }}</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span class="mono">{{ activeGuidePreview.filename }}</span>
              </div>
              <div style="display: flex; gap: 8px;">
                <button
                  type="button"
                  class="btn-secondary"
                  @click="copyText(activeGuidePreview.content, 'Installation Guide Markdown')"
                >
                  Copy Guide Text
                </button>
                <button
                  type="button"
                  class="btn-ghost"
                  @click="activeGuidePreview = null"
                >
                  Close Preview
                </button>
              </div>
            </div>
            <pre>{{ activeGuidePreview.content }}</pre>
          </div>
        </div>

        <!-- =================================================================
             TAB 3: SUPPORT TICKETING, MESSAGING & CRYPTOGRAPHIC CREDENTIALS
             ================================================================= -->
        <div v-else-if="activePortalTab === 'support'" data-testid="support-keys-section">
          <!-- Compact Cryptographic Support Key & Webhook Signing Credentials Bar -->
          <div class="bento-panel" style="margin-bottom: 24px;">
            <div class="meta-line">
              <span class="meta-accent">Cryptographic Member Credentials</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>24/5 Priority Desk Verification</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>{{ store.platformSettings.supportEmail }}</span>
            </div>
            <h2
              style="
                font-family: var(--font-display);
                font-size: 1.2rem;
                font-weight: 700;
                margin-top: 4px;
                margin-bottom: 14px;
              "
            >
              Your Support Keys &amp; Webhook Signing Credentials
            </h2>

            <div class="form-row-2">
              <!-- Credential 1: Primary Member Support Key -->
              <div class="step-item">
                <div class="meta-line">
                  <span class="mono" style="color: var(--accent-emerald-bright); font-weight: 700;">
                    PRIMARY MEMBER SUPPORT KEY
                  </span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span>SLA: &lt; 15 Min Desk Response</span>
                </div>
                <div
                  style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 12px;
                    margin-top: 8px;
                    flex-wrap: wrap;
                  "
                >
                  <code
                    class="mono"
                    style="font-size: 0.96rem; font-weight: 700; color: var(--text-primary);"
                    data-testid="member-support-key-code"
                  >
                    {{ memberSupportKey }}
                  </code>
                  <button
                    type="button"
                    class="btn-secondary"
                    style="padding: 6px 12px; min-height: 32px; font-size: 0.75rem;"
                    data-testid="copy-support-key-btn"
                    @click="copyText(memberSupportKey, 'Member Support Key')"
                  >
                    Copy Support Key
                  </button>
                </div>
              </div>

              <!-- Credential 2: Webhook Signing Token -->
              <div class="step-item">
                <div class="meta-line">
                  <span class="mono" style="color: var(--accent-sky); font-weight: 700;">
                    WEBHOOK ALERT SIGNING SECRET
                  </span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span>TradingView JSON Auth</span>
                </div>
                <div
                  style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 12px;
                    margin-top: 8px;
                    flex-wrap: wrap;
                  "
                >
                  <code
                    class="mono"
                    style="font-size: 0.86rem; color: var(--text-primary);"
                    data-testid="webhook-signing-token-code"
                  >
                    {{ webhookSigningToken }}
                  </code>
                  <button
                    type="button"
                    class="btn-secondary"
                    style="padding: 6px 12px; min-height: 32px; font-size: 0.75rem;"
                    @click="copyText(webhookSigningToken, 'Webhook Signing Secret')"
                  >
                    Copy Secret
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Dedicated Support Ticketing & Messaging Interface Component -->
          <SupportTicketing
            :member-support-key="memberSupportKey"
            :webhook-signing-token="webhookSigningToken"
          />
        </div>

        <!-- =================================================================
             TAB 4: LICENSE KEYS & SUBSCRIPTIONS MANAGEMENT
             ================================================================= -->
        <div v-else-if="activePortalTab === 'subscriptions'" class="license-list">
          <div
            v-for="lic in store.customerLicenses"
            :key="`sub-${lic.id}`"
            class="license-panel"
            data-testid="subscription-management-card"
          >
            <div>
              <div class="meta-line">
                <span class="meta-accent">{{ lic.billingCycle }} Membership Plan</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span
                  :style="{
                    color:
                      lic.tvAccessStatus === 'Provisioned'
                        ? 'var(--accent-emerald-bright)'
                        : 'var(--accent-crimson)',
                    fontWeight: 600,
                  }"
                >
                  {{ lic.tvAccessStatus }}
                </span>
              </div>
              <h3 style="font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; margin-top: 6px;">
                {{ lic.indicatorName }}
              </h3>
              <div class="meta-line" style="margin-top: 6px;">
                <span>Key: <strong class="mono" style="color: var(--text-primary);">{{ lic.licenseKey }}</strong></span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span>Paid: <strong class="mono">${{ lic.amountPaid.toLocaleString() }}</strong></span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span>Renews/Expires: <strong class="mono">{{ lic.expiresAt }}</strong></span>
              </div>
            </div>

            <div>
              <div class="form-label" style="margin-bottom: 8px;">
                Switch or Upgrade Subscription Tier
              </div>
              <div class="segmented-group">
                <button
                  v-for="tier in (['Monthly', 'Annual', 'Lifetime'] as const)"
                  :key="tier"
                  type="button"
                  class="segmented-btn"
                  :class="{ active: lic.billingCycle === tier }"
                  :disabled="upgradingLicenseId === lic.id"
                  @click="changeSubscriptionTier(lic, tier)"
                >
                  {{ tier }}
                </button>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-end;">
              <button
                type="button"
                class="btn-secondary"
                style="width: 100%;"
                :disabled="upgradingLicenseId === lic.id"
                @click="toggleSubscriptionStatus(lic)"
              >
                {{
                  lic.tvAccessStatus === 'Provisioned'
                    ? 'Pause / Suspend License ACL'
                    : 'Reactivate License ACL'
                }}
              </button>
              <button
                type="button"
                class="btn-ghost"
                style="width: 100%;"
                @click="downloadInvoiceReceipt(lic)"
              >
                Download Subscription Invoice (.txt)
              </button>
            </div>
          </div>
        </div>

        <!-- =================================================================
             TAB 5: BILLING & INVOICES
             ================================================================= -->
        <div v-else-if="activePortalTab === 'invoices'">
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Invoice ID</th>
                  <th>License Key</th>
                  <th>Product / Membership</th>
                  <th>Billing Tier</th>
                  <th>Date Issued</th>
                  <th>Amount Paid</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="lic in store.customerLicenses" :key="`inv-${lic.id}`">
                  <td class="mono">INV-{{ lic.id.toUpperCase() }}</td>
                  <td class="mono">{{ lic.licenseKey }}</td>
                  <td>{{ lic.indicatorName }}</td>
                  <td>{{ lic.billingCycle }}</td>
                  <td class="mono">{{ lic.provisionedAt }}</td>
                  <td class="mono" style="color: var(--accent-emerald-bright); font-weight: 700;">
                    ${{ lic.amountPaid.toLocaleString() }} USD
                  </td>
                  <td>
                    <button
                      type="button"
                      class="btn-ghost"
                      @click="downloadInvoiceReceipt(lic)"
                    >
                      Download Invoice
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- =================================================================
             TAB 6: ACCOUNT & TRADING HANDLES
             ================================================================= -->
        <div v-else-if="activePortalTab === 'settings'" class="checkout-grid">
          <form class="form-panel" @submit.prevent="saveAccountProfile">
            <div class="meta-line">
              <span class="meta-accent">Global Platform Identity</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Auto-Syncs All Active Licenses</span>
            </div>
            <h2 style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 700; margin-top: 6px; margin-bottom: 18px;">
              Customer Profile &amp; Trading Platform Handles
            </h2>

            <div class="form-field">
              <label for="prof-name" class="form-label">Full Trader / Desk Name</label>
              <input
                id="prof-name"
                v-model="profileNameDraft"
                type="text"
                class="form-input"
                required
              />
            </div>

            <div class="form-field">
              <label for="prof-email" class="form-label">Registered Account Email</label>
              <input
                id="prof-email"
                :value="store.activeCustomerEmail"
                type="email"
                class="form-input mono"
                disabled
              />
            </div>

            <div class="form-row-2">
              <div class="form-field">
                <label for="prof-tv" class="form-label">Default TradingView Username</label>
                <input
                  id="prof-tv"
                  v-model="profileTvDraft"
                  type="text"
                  class="form-input mono"
                  required
                />
              </div>

              <div class="form-field">
                <label for="prof-tos" class="form-label">Charles Schwab thinkorswim ID</label>
                <input
                  id="prof-tos"
                  v-model="profileTosDraft"
                  type="text"
                  class="form-input mono"
                />
              </div>
            </div>

            <div style="display: flex; gap: 12px; margin-top: 8px; flex-wrap: wrap;">
              <button
                type="submit"
                class="btn-primary"
                :disabled="savingProfile"
              >
                {{ savingProfile ? 'Saving Changes...' : 'Save Profile & Re-Sync All Licenses' }}
              </button>
              <button
                type="button"
                class="btn-ghost"
                @click="store.signOut()"
              >
                Sign Out of Dashboard
              </button>
            </div>
          </form>

          <div class="bento-panel">
            <div class="meta-line">
              <span class="meta-accent">Automated Entitlement Security</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>TradingView &amp; thinkorswim</span>
            </div>
            <h3 style="font-size: 1.15rem; font-weight: 700;">
              How Your Private Client Vault Protects Your Access
            </h3>
            <ol style="padding-left: 18px; color: var(--text-secondary); font-size: 0.9rem; display: flex; flex-direction: column; gap: 10px;">
              <li>
                <strong>TradingView Invite-Only Scripts:</strong> Updating your TradingView handle above immediately updates our Pine Script v6 permission server across all your active subscriptions.
              </li>
              <li>
                <strong>Charles Schwab thinkorswim:</strong> Every `.ts` study download is dynamically watermarked with your license key, support key (`{{ memberSupportKey }}`), and thinkorswim Account ID.
              </li>
              <li>
                <strong>Session Protection:</strong> Locking or signing out of your Client Dashboard requires re-authentication before viewing license keys or downloading study artifacts.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
