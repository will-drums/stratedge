<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
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
import { AdminProvisionSchema } from '../utils/fulfillment';

const emit = defineEmits<{
  (e: 'navigate', view: 'storefront' | 'checkout' | 'dashboard' | 'admin'): void;
}>();

const store = usePlatformStore();

// Admin Dashboard 6-Tab Enterprise Navigation
const activeAdminTab = ref<
  'sales' | 'catalog' | 'licenses' | 'customers' | 'customization' | 'webhooks'
>('sales');

// TanStack Table for All Customer Licenses in Admin Console
const licenseFilter = ref('');
const sorting = ref<SortingState>([{ id: 'amountPaid', desc: true }]);

const columnHelper = createColumnHelper<LicenseRecord>();

const licenseColumns = [
  columnHelper.accessor('licenseKey', {
    header: 'License Key',
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
    header: 'Cadence',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('amountPaid', {
    header: 'Revenue (USD)',
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
];

const adminTable = useVueTable({
  get data() {
    return store.allLicenses;
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
    'Full revenue analytics, cohort series, and license entitlement ledger downloaded.'
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
    createProductError.value = 'Please enter an indicator name (at least 3 characters).';
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
    store.showNotification('error', 'Cannot Remove Indicator', data.error || 'Error');
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
</script>

<template>
  <section class="workspace-shell">
    <div class="container">
      <div class="workspace-header">
        <div>
          <div class="meta-line">
            <span class="meta-accent">StratEdge Enterprise E-Commerce, Revenue &amp; Catalog Console</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span>Drizzle ORM + SQLite Live Ledger</span>
          </div>
          <h1 class="section-title" style="margin-top: 6px;">
            Enterprise Admin Operations, Sales Reports &amp; Product Catalog
          </h1>
          <p class="section-subtitle">
            Inspect real-time sales reports, create and price indicators for sale, manage customer
            memberships and TradingView Pine v6 ACLs, and customize storefront settings.
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
          <span class="kpi-label">Gross E-Commerce Revenue</span>
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
          <span class="kpi-label">Active TradingView ACL Seats</span>
          <span class="kpi-context">
            Across {{ store.metrics.totalCustomers }} registered accounts ({{
              store.salesReport.netRetentionPct
            }}% retention)
          </span>
        </div>
        <div class="kpi-item">
          <span class="kpi-number">{{ store.metrics.totalTosDownloads }}</span>
          <span class="kpi-label">thinkorswim .ts Artifacts Pulled</span>
          <span class="kpi-context">{{ store.indicators.length }} active indicators in catalog</span>
        </div>
      </div>

      <!-- Admin 6-Tab Sub-Navigation -->
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
            1. Sales Reports &amp; Analytics
          </button>
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: activeAdminTab === 'catalog' }"
            data-testid="admin-tab-catalog"
            @click="activeAdminTab = 'catalog'"
          >
            2. Add &amp; Edit Indicators ({{ store.indicators.length }})
          </button>
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: activeAdminTab === 'licenses' }"
            data-testid="admin-tab-licenses"
            @click="activeAdminTab = 'licenses'"
          >
            3. Licenses &amp; Desk Provisioning ({{ store.allLicenses.length }})
          </button>
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: activeAdminTab === 'customers' }"
            data-testid="admin-tab-customers"
            @click="activeAdminTab = 'customers'"
          >
            4. Customers &amp; Memberships ({{ store.allUsers.length }})
          </button>
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: activeAdminTab === 'customization' }"
            data-testid="admin-tab-customization"
            @click="activeAdminTab = 'customization'"
          >
            5. Storefront &amp; Promo Customization
          </button>
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: activeAdminTab === 'webhooks' }"
            data-testid="admin-tab-webhooks"
            @click="activeAdminTab = 'webhooks'"
          >
            6. Webhook Audit Ledger ({{ store.webhookLogs.length }})
          </button>
        </div>
      </div>

      <!-- ======================================================================= -->
      <!-- TAB 1: ENTERPRISE SALES REPORTS & REVENUE ANALYTICS                     -->
      <!-- ======================================================================= -->
      <div v-if="activeAdminTab === 'sales'" data-testid="sales-report-section">
        <div class="checkout-grid" style="margin-bottom: 32px;">
          <!-- Left: Monthly Cohort Revenue & MRR Trajectory Chart -->
          <div class="form-panel">
            <div
              style="
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                gap: 12px;
                margin-bottom: 18px;
                flex-wrap: wrap;
              "
            >
              <div>
                <div class="meta-line">
                  <span class="meta-accent">Executive Financial Telemetry</span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span>6-Month Cohort Trajectory</span>
                </div>
                <h2
                  style="
                    font-family: var(--font-display);
                    font-size: 1.25rem;
                    font-weight: 700;
                    margin-top: 4px;
                  "
                >
                  Cumulative Revenue &amp; MRR Growth
                </h2>
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

            <!-- Bar + Line SVG Cohort Chart -->
            <div
              style="
                background: rgba(5, 8, 16, 0.78);
                border: 1px solid var(--border-subtle);
                border-radius: var(--radius-md);
                padding: 18px;
              "
            >
              <div
                style="
                  display: grid;
                  grid-template-columns: repeat(6, 1fr);
                  gap: 12px;
                  align-items: end;
                  height: 170px;
                  padding-top: 16px;
                "
              >
                <div
                  v-for="pt in store.salesReport.monthlyCohortSeries"
                  :key="pt.month"
                  style="
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: flex-end;
                    height: 100%;
                  "
                >
                  <span
                    class="mono"
                    style="
                      font-size: 0.72rem;
                      color: var(--accent-emerald-bright);
                      margin-bottom: 6px;
                    "
                  >
                    ${{ pt.grossRevenue.toLocaleString() }}
                  </span>
                  <div
                    :style="{
                      width: '100%',
                      maxWidth: '48px',
                      height: `${Math.max(
                        18,
                        Math.min(
                          125,
                          Math.round(
                            (pt.grossRevenue /
                              Math.max(1, store.salesReport.totalRevenue)) *
                              120
                          )
                        )
                      )}px`,
                      background:
                        'linear-gradient(180deg, rgba(16, 185, 129, 0.85), rgba(56, 189, 248, 0.35))',
                      border: '1px solid rgba(52, 211, 153, 0.5)',
                      borderRadius: '6px 6px 0 0',
                    }"
                  ></div>
                  <span
                    class="mono"
                    style="
                      font-size: 0.72rem;
                      color: var(--text-secondary);
                      margin-top: 8px;
                    "
                  >
                    {{ pt.month }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Revenue Breakdown by Billing Tier (Monthly / Annual / Lifetime) -->
          <div class="form-panel">
            <div class="meta-line">
              <span class="meta-accent">Subscription Cadence Distribution</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Tier Mix Analysis</span>
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
              Revenue by Membership Tier
            </h2>

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
                      {{ tierItem.tier }} Licenses
                    </strong>
                    <span
                      class="mono"
                      style="
                        margin-left: 8px;
                        font-size: 0.78rem;
                        color: var(--text-secondary);
                      "
                    >
                      ({{ tierItem.licensesCount }} active orders)
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
        </div>

        <!-- Product-Level Sales & Entitlement Breakdown Table -->
        <div class="table-wrapper">
          <div
            style="
              padding: 18px 20px;
              border-bottom: 1px solid var(--border-subtle);
              display: flex;
              justify-content: space-between;
              align-items: center;
              flex-wrap: wrap;
              gap: 12px;
            "
          >
            <div>
              <h3 style="font-family: var(--font-display); font-size: 1.15rem; font-weight: 700;">
                Sales Performance by Indicator Model
              </h3>
              <p style="font-size: 0.84rem; color: var(--text-secondary);">
                Live breakdown of units sold, active TradingView ACL seats, gross revenue share, and
                thinkorswim `.ts` artifact pulls.
              </p>
            </div>
            <button
              type="button"
              class="btn-secondary"
              @click="exportSalesReportCsv"
            >
              Download Full CSV Report →
            </button>
          </div>

          <table class="data-table">
            <thead>
              <tr>
                <th>Indicator Product</th>
                <th>Category Pillar</th>
                <th>Release</th>
                <th>Units Sold</th>
                <th>Active ACL Seats</th>
                <th>TOS .ts Downloads</th>
                <th>Gross Revenue</th>
                <th>Revenue Share</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="prod in store.salesReport.productBreakdown"
                :key="prod.indicatorId"
              >
                <td style="font-weight: 600; color: var(--text-primary);">
                  {{ prod.indicatorName }}
                </td>
                <td>{{ prod.category }}</td>
                <td class="mono">{{ prod.version }}</td>
                <td class="mono">{{ prod.unitsSold }}</td>
                <td class="mono" style="color: var(--accent-emerald-bright);">
                  {{ prod.activeSeats }}
                </td>
                <td class="mono">{{ prod.tosDownloads }}</td>
                <td class="mono" style="font-weight: 700;">
                  ${{ prod.grossRevenue.toLocaleString() }}
                </td>
                <td class="mono" style="min-width: 150px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span>{{ prod.revenueSharePct }}%</span>
                    <div
                      style="
                        flex: 1;
                        height: 6px;
                        background: rgba(148, 163, 184, 0.15);
                        border-radius: 3px;
                        overflow: hidden;
                      "
                    >
                      <div
                        :style="{
                          width: `${Math.max(4, prod.revenueSharePct)}%`,
                          height: '100%',
                          background: 'var(--accent-emerald-bright)',
                        }"
                      ></div>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
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
                Powered by TanStack Table. Search by license key, customer email, or TradingView handle.
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
                  <label :for="`adm-${field.name}`" class="form-label">Customer / Trader Name</label>
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
                  Grants {{ settingsForm.announcementDiscountPct }}% off at Checkout &amp; Slide-Over
                  Cart Drawer.
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
