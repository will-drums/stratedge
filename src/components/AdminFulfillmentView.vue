<script setup lang="ts">
import { ref, reactive } from 'vue';
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
  (e: 'navigate', view: 'storefront' | 'dashboard' | 'admin'): void;
}>();

const store = usePlatformStore();

// Admin Dashboard Sub-Navigation Tabs
const activeAdminTab = ref<'licenses' | 'customers' | 'catalog' | 'webhooks'>('licenses');

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

// Product Catalog Editor State
const editingProduct = reactive<{
  id: string;
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  priceLifetime: number;
  version: string;
  winRatePct: number;
}>({
  id: '',
  name: '',
  priceMonthly: 199,
  priceAnnual: 1490,
  priceLifetime: 2490,
  version: 'v5.2.0',
  winRatePct: 76.4,
});
const savingProduct = ref(false);

function selectProductForEdit(ind: IndicatorItem) {
  editingProduct.id = ind.id;
  editingProduct.name = ind.name;
  editingProduct.priceMonthly = ind.priceMonthly;
  editingProduct.priceAnnual = ind.priceAnnual;
  editingProduct.priceLifetime = ind.priceLifetime;
  editingProduct.version = ind.version;
  editingProduct.winRatePct = ind.winRatePct;
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
        priceMonthly: Number(editingProduct.priceMonthly),
        priceAnnual: Number(editingProduct.priceAnnual),
        priceLifetime: Number(editingProduct.priceLifetime),
        version: editingProduct.version,
        winRatePct: Number(editingProduct.winRatePct),
      }),
    });
    if (res.ok) {
      await store.fetchAllData();
      store.showNotification(
        'success',
        `Updated ${editingProduct.name}`,
        `Storefront catalog pricing ($${editingProduct.priceMonthly}/mo · $${editingProduct.priceAnnual}/yr · $${editingProduct.priceLifetime} life) updated live.`
      );
      editingProduct.id = '';
    }
  } finally {
    savingProduct.value = false;
  }
}

// TanStack Form for Manual Desk License Provisioning
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
            <span class="meta-accent">StratEdge E-Commerce, Membership &amp; Webhook Administration</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span>Drizzle ORM + SQLite Live Ledger</span>
          </div>
          <h1 class="section-title" style="margin-top: 6px;">
            Admin Operations, Product Catalog &amp; Fulfillment Console
          </h1>
          <p class="section-subtitle">
            Manage customer subscriptions, control TradingView Pine v6 invite-only ACLs, edit live
            indicator catalog pricing, and audit real-time fulfillment webhooks.
          </p>
        </div>
      </div>

      <!-- Executive Operations KPI Strip -->
      <div class="kpi-strip" style="margin-top: 0; margin-bottom: 28px;">
        <div class="kpi-item">
          <span class="kpi-number">${{ store.metrics.totalRevenue.toLocaleString() }}</span>
          <span class="kpi-label">Gross E-Commerce Volume</span>
          <span class="kpi-context">MRR: ${{ store.metrics.mrr.toLocaleString() }}/mo recurring</span>
        </div>
        <div class="kpi-item">
          <span class="kpi-number">{{ store.metrics.activeProvisioned }} / {{ store.metrics.totalLicenses }}</span>
          <span class="kpi-label">Active TradingView ACL Seats</span>
          <span class="kpi-context">Across {{ store.metrics.totalCustomers }} registered accounts</span>
        </div>
        <div class="kpi-item">
          <span class="kpi-number">{{ store.metrics.totalTosDownloads }}</span>
          <span class="kpi-label">thinkorswim .ts Artifacts Pulled</span>
          <span class="kpi-context">Watermarked study downloads</span>
        </div>
        <div class="kpi-item">
          <span class="kpi-number">92 ms</span>
          <span class="kpi-label">Mean Webhook Provision Latency</span>
          <span class="kpi-context">100% automated fulfillment uptime</span>
        </div>
      </div>

      <!-- Admin Sub-Navigation Tabs -->
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
            :class="{ active: activeAdminTab === 'licenses' }"
            @click="activeAdminTab = 'licenses'"
          >
            1. Licenses &amp; Desk Provisioning ({{ store.allLicenses.length }})
          </button>
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: activeAdminTab === 'customers' }"
            data-testid="admin-tab-customers"
            @click="activeAdminTab = 'customers'"
          >
            2. Customers &amp; Memberships ({{ store.allUsers.length }})
          </button>
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: activeAdminTab === 'catalog' }"
            data-testid="admin-tab-catalog"
            @click="activeAdminTab = 'catalog'"
          >
            3. Product &amp; Pricing Manager ({{ store.indicators.length }})
          </button>
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: activeAdminTab === 'webhooks' }"
            data-testid="admin-tab-webhooks"
            @click="activeAdminTab = 'webhooks'"
          >
            4. Webhook Audit Ledger ({{ store.webhookLogs.length }})
          </button>
        </div>
      </div>

      <!-- TAB 1: LICENSES TABLE + MANUAL PROVISIONING -->
      <div v-if="activeAdminTab === 'licenses'">
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
            <h2 style="font-family: var(--font-display); font-size: 1.3rem; font-weight: 700; margin-top: 6px; margin-bottom: 16px;">
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
                      @change="(e) => field.handleChange((e.target as HTMLSelectElement).value as 'Monthly' | 'Annual' | 'Lifetime')"
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
              {{ adminSubmitting ? 'Provisioning...' : 'Issue License & Whitelist TradingView Handle' }}
            </button>
          </form>

          <!-- Right: Recent Webhook Dispatches -->
          <div class="form-panel">
            <div class="meta-line">
              <span class="meta-accent">Automated Delivery Audit Trail</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Real-Time Webhook Ledger</span>
            </div>
            <h2 style="font-family: var(--font-display); font-size: 1.3rem; font-weight: 700; margin-top: 6px; margin-bottom: 16px;">
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

      <!-- TAB 2: CUSTOMERS & MEMBERSHIPS DIRECTORY -->
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

      <!-- TAB 3: PRODUCT CATALOG & LIVE PRICING MANAGER -->
      <div v-else-if="activeAdminTab === 'catalog'">
        <div class="checkout-grid">
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Indicator Product</th>
                  <th>Version</th>
                  <th>Monthly</th>
                  <th>Annual</th>
                  <th>Lifetime</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="ind in store.indicators" :key="ind.id">
                  <td style="font-weight: 600;">{{ ind.name }}</td>
                  <td class="mono">{{ ind.version }}</td>
                  <td class="mono">${{ ind.priceMonthly }}</td>
                  <td class="mono">${{ ind.priceAnnual.toLocaleString() }}</td>
                  <td class="mono">${{ ind.priceLifetime.toLocaleString() }}</td>
                  <td>
                    <button
                      type="button"
                      class="btn-ghost"
                      @click="selectProductForEdit(ind)"
                    >
                      Edit Pricing
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Live Product Pricing Editor Form -->
          <form class="form-panel" @submit.prevent="saveProductPricing">
            <div class="meta-line">
              <span class="meta-accent">E-Commerce Catalog Pricing Engine</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Instant Storefront Sync</span>
            </div>
            <h2 style="font-family: var(--font-display); font-size: 1.3rem; font-weight: 700; margin-top: 6px; margin-bottom: 16px;">
              {{
                editingProduct.id
                  ? `Editing: ${editingProduct.name}`
                  : 'Select an Indicator on the Left to Edit Pricing'
              }}
            </h2>

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
                <label class="form-label">Release Version</label>
                <input
                  v-model="editingProduct.version"
                  type="text"
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
                  : 'Save Product Pricing & Publish Live'
              }}
            </button>
          </form>
        </div>
      </div>

      <!-- TAB 4: FULL WEBHOOK AUDIT LEDGER -->
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
