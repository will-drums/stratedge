<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { usePlatformStore } from '../stores/platformStore';
import {
  SupportTicketSchema,
  SupportTicketMessageSchema,
  buildDefaultTicketMessages,
  computeTicketLifecycleProgress,
  computeClientTicketStatusSummary,
  filterSupportTickets,
  type SupportTicketRecord,
  type SupportTicketMessage,
} from '../utils/fulfillment';

const props = defineProps<{
  memberSupportKey?: string;
  webhookSigningToken?: string;
}>();

const store = usePlatformStore();

// Scope & Filter State
const ticketScope = ref<'mine' | 'all'>('mine');
const statusFilter = ref<'All' | 'Open' | 'In Progress' | 'Resolved'>('All');
const priorityFilter = ref<'All' | 'Critical' | 'High' | 'Normal'>('All');
const searchQuery = ref('');

// Selected Ticket ID for Dedicated Messaging Interface
const selectedTicketId = ref<string>('');

// Collapsible / Inline New Support Request Composer State
const isComposerOpen = ref(false);
const newSubject = ref('');
const newCategory = ref<SupportTicketRecord['category']>('TradingView ACL Sync');
const newPlatformTarget = ref<SupportTicketRecord['platformTarget']>('TradingView');
const newPriority = ref<SupportTicketRecord['priority']>('High');
const newLicenseKey = ref('');
const newDescription = ref('');
const composerError = ref('');
const isSubmittingTicket = ref(false);
const lastSubmittedConfirmation = ref<{
  ticketId: string;
  supportKey: string;
  subject: string;
  createdAt: string;
} | null>(null);

// Dedicated Messaging Thread Reply State
const replyBody = ref('');
const replyDiagnosticSnippet = ref('');
const replySenderRole = ref<'client' | 'engineer'>('client');
const replyError = ref('');
const isSendingReply = ref(false);
const isUpdatingStatus = ref(false);

const effectiveSupportKey = computed(() => {
  if (props.memberSupportKey) return props.memberSupportKey;
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

// Status Summary KPIs (scoped to active view mode)
const statusSummary = computed(() => {
  const emailScope =
    ticketScope.value === 'mine' ? store.activeCustomerEmail : undefined;
  return computeClientTicketStatusSummary(store.supportTickets, emailScope);
});

// Filtered Tickets Queue
const filteredTickets = computed(() => {
  const emailScope =
    ticketScope.value === 'mine' ? store.activeCustomerEmail : undefined;
  const list = filterSupportTickets(store.supportTickets, {
    status: statusFilter.value,
    priority: priorityFilter.value,
    customerEmail: emailScope,
    searchQuery: searchQuery.value,
  });

  // If 'mine' has no tickets for a newly registered account, fall back to showing all desk tickets so the queue is never unexpectedly blank
  if (
    list.length === 0 &&
    ticketScope.value === 'mine' &&
    statusFilter.value === 'All' &&
    priorityFilter.value === 'All' &&
    !searchQuery.value.trim()
  ) {
    return filterSupportTickets(store.supportTickets, {
      status: statusFilter.value,
      priority: priorityFilter.value,
      searchQuery: searchQuery.value,
    });
  }
  return list;
});

// Ensure a valid ticket is always selected when filteredTickets changes
watch(
  filteredTickets,
  (list) => {
    if (list.length === 0) {
      selectedTicketId.value = '';
      return;
    }
    const stillExists = list.some((t) => t.id === selectedTicketId.value);
    if (!stillExists) {
      selectedTicketId.value = list[0].id;
    }
  },
  { immediate: true }
);

const selectedTicket = computed<SupportTicketRecord | null>(() => {
  if (!selectedTicketId.value) return filteredTickets.value[0] || null;
  return (
    store.supportTickets.find((t) => t.id === selectedTicketId.value) ||
    filteredTickets.value[0] ||
    null
  );
});

const selectedTicketMessages = computed<SupportTicketMessage[]>(() => {
  if (!selectedTicket.value) return [];
  return buildDefaultTicketMessages(selectedTicket.value);
});

const selectedLifecycle = computed(() => {
  if (!selectedTicket.value) {
    return computeTicketLifecycleProgress('Open', 'Normal');
  }
  return computeTicketLifecycleProgress(
    selectedTicket.value.status,
    selectedTicket.value.priority
  );
});

function selectTicket(ticketId: string) {
  selectedTicketId.value = ticketId;
  replyError.value = '';
}

function resetFilters() {
  statusFilter.value = 'All';
  priorityFilter.value = 'All';
  searchQuery.value = '';
  ticketScope.value = 'all';
}

function attachDiagnosticPreset(presetType: 'tv' | 'tos' | 'webhook') {
  const licKey =
    selectedTicket.value?.licenseKey ||
    store.customerLicenses[0]?.licenseKey ||
    'SE-BUND-8841-A9C2';
  if (presetType === 'tv') {
    replyDiagnosticSnippet.value = `TV_HANDLE=@${store.activeTradingViewHandle} | LICENSE=${licKey} | PINE_Runtime=v6_InviteOnly`;
  } else if (presetType === 'tos') {
    replyDiagnosticSnippet.value = `TOS_ACCOUNT=${store.activeTosAccountId} | LICENSE=${licKey} | STUDY=StratEdge_Algo_v54.ts`;
  } else {
    replyDiagnosticSnippet.value = `SUPPORT_KEY=${effectiveSupportKey.value} | WEBHOOK_TOKEN=${
      props.webhookSigningToken || 'whsec_stratedge_v6'
    }`;
  }
}

async function handleCreateSupportTicket() {
  composerError.value = '';

  const effectiveLicense =
    newLicenseKey.value ||
    store.customerLicenses[0]?.licenseKey ||
    'SE-BUND-8841-A9C2';

  const parsed = SupportTicketSchema.safeParse({
    customerName: store.activeCustomerName || 'Marcus Vance',
    customerEmail: store.activeCustomerEmail || 'marcus.vance@apexquant.io',
    tradingViewUsername: store.activeTradingViewHandle || 'MarcusVance_ES',
    platformTarget: newPlatformTarget.value,
    category: newCategory.value,
    priority: newPriority.value,
    subject: newSubject.value,
    description:
      newDescription.value.trim().length >= 10
        ? newDescription.value
        : `${newDescription.value.trim()} — Diagnostic request submitted with Support Key ${effectiveSupportKey.value}.`.trim(),
    licenseKey: effectiveLicense,
  });

  if (!parsed.success) {
    composerError.value =
      parsed.error.issues[0]?.message ||
      'Please complete all required support ticket fields.';
    return;
  }

  isSubmittingTicket.value = true;
  try {
    const created = await store.submitSupportTicket(parsed.data);
    lastSubmittedConfirmation.value = {
      ticketId: created.ticketNumber,
      supportKey: effectiveSupportKey.value,
      subject: created.subject,
      createdAt: created.createdAt,
    };

    selectedTicketId.value = created.id;
    statusFilter.value = 'All';
    newSubject.value = '';
    newDescription.value = '';

    store.showNotification(
      'success',
      `Support Ticket Dispatched (${created.ticketNumber})`,
      `Authenticated with Support Key ${effectiveSupportKey.value}. Active messaging thread opened below.`
    );
  } catch (err) {
    composerError.value =
      err instanceof Error ? err.message : 'Unable to submit support ticket.';
  } finally {
    isSubmittingTicket.value = false;
  }
}

async function handleSendReply() {
  replyError.value = '';
  if (!selectedTicket.value) return;

  const senderName =
    replySenderRole.value === 'engineer'
      ? 'Dr. Julian Vance — Senior Quant Engineer'
      : store.activeCustomerName || selectedTicket.value.customerName;

  const senderHandleOrTitle =
    replySenderRole.value === 'engineer'
      ? 'StratEdge Quantitative Execution Desk'
      : `@${store.activeTradingViewHandle} · Support Key: ${effectiveSupportKey.value}`;

  const parsed = SupportTicketMessageSchema.safeParse({
    ticketId: selectedTicket.value.id,
    senderRole: replySenderRole.value,
    senderName,
    senderHandleOrTitle,
    body: replyBody.value,
    diagnosticSnippet: replyDiagnosticSnippet.value,
  });

  if (!parsed.success) {
    replyError.value =
      parsed.error.issues[0]?.message ||
      'Please enter at least 4 characters for your message.';
    return;
  }

  isSendingReply.value = true;
  try {
    await store.sendSupportTicketMessage(parsed.data);
    replyBody.value = '';
    replyDiagnosticSnippet.value = '';
    store.showNotification(
      'success',
      `Message Added to ${selectedTicket.value.ticketNumber}`,
      replySenderRole.value === 'client'
        ? 'Your technical update and diagnostic telemetry were logged to the Quant Engineering Desk.'
        : 'Quant Engineering Desk response posted to ticket thread.'
    );
  } catch (err) {
    replyError.value =
      err instanceof Error ? err.message : 'Failed to post message to thread.';
  } finally {
    isSendingReply.value = false;
  }
}

async function handleStatusTransition(
  nextStatus: 'Open' | 'In Progress' | 'Resolved'
) {
  if (!selectedTicket.value || selectedTicket.value.status === nextStatus) return;
  isUpdatingStatus.value = true;
  try {
    const note =
      nextStatus === 'Resolved'
        ? `Resolved & verified by ${store.activeCustomerName} (${effectiveSupportKey.value}).`
        : nextStatus === 'In Progress'
        ? 'Active engineering investigation & ACL telemetry verification underway.'
        : 'Reopened by client trader for additional technical review.';
    await store.updateSupportTicketStatus(
      selectedTicket.value.id,
      nextStatus,
      note
    );
    store.showNotification(
      'info',
      `${selectedTicket.value.ticketNumber} Status: ${nextStatus}`,
      `Ticket lifecycle updated to ${nextStatus}.`
    );
  } finally {
    isUpdatingStatus.value = false;
  }
}

function downloadTicketTranscript(ticket: SupportTicketRecord) {
  const messages = buildDefaultTicketMessages(ticket);
  const lines = [
    '================================================================================',
    `STRATEDGE ALGO — OFFICIAL TECHNICAL SUPPORT TRANSCRIPT (${ticket.ticketNumber})`,
    '================================================================================',
    `Ticket Number:      ${ticket.ticketNumber}`,
    `Status / Priority:  ${ticket.status.toUpperCase()} · ${ticket.priority.toUpperCase()}`,
    `Client Trader:      ${ticket.customerName} (${ticket.customerEmail})`,
    `TradingView Handle: @${ticket.tradingViewUsername}`,
    `Platform Target:    ${ticket.platformTarget} (${ticket.category})`,
    `Bound License Key:  ${ticket.licenseKey}`,
    `Member Support Key: ${effectiveSupportKey.value}`,
    `Created / Updated:  ${ticket.createdAt} / ${ticket.updatedAt}`,
    '--------------------------------------------------------------------------------',
    `SUBJECT: ${ticket.subject}`,
    '================================================================================',
    '',
    ...messages.map(
      (m, idx) =>
        `[${idx + 1}] ${m.createdAt} — ${m.senderName} (${m.senderRole.toUpperCase()})\n` +
        `    Role/Context: ${m.senderHandleOrTitle}\n` +
        `    Message: ${m.body}\n` +
        (m.diagnosticSnippet ? `    Telemetry: ${m.diagnosticSnippet}\n` : '')
    ),
    '================================================================================',
  ].join('\n');

  const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `StratEdge_Support_Transcript_${ticket.ticketNumber}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  store.showNotification(
    'info',
    `Transcript Downloaded (${ticket.ticketNumber})`,
    `Saved StratEdge_Support_Transcript_${ticket.ticketNumber}.txt.`
  );
}
</script>

<template>
  <div class="support-ticketing-shell" data-testid="support-ticketing-root">
    <!-- =======================================================================
         1. STATUS TRACKING KPI STRIP
         ======================================================================= -->
    <div class="kpi-strip support-kpi-strip" style="margin-top: 0; margin-bottom: 24px;">
      <div class="kpi-item">
        <span class="kpi-number mono" data-testid="support-kpi-total">
          {{ statusSummary.total }}
        </span>
        <span class="kpi-label">Tracked Support Tickets</span>
        <span class="kpi-context">
          {{ ticketScope === 'mine' ? `Bound to ${store.activeCustomerEmail}` : 'Global Desk Queue' }}
        </span>
      </div>
      <div class="kpi-item">
        <span
          class="kpi-number mono"
          style="color: var(--accent-amber);"
          data-testid="support-kpi-open"
        >
          {{ statusSummary.open }}
        </span>
        <span class="kpi-label">Open · Awaiting Triage</span>
        <span class="kpi-context">Cryptographic ACL &amp; license verified</span>
      </div>
      <div class="kpi-item">
        <span
          class="kpi-number mono"
          style="color: var(--accent-sky);"
          data-testid="support-kpi-in-progress"
        >
          {{ statusSummary.inProgress }}
        </span>
        <span class="kpi-label">In Progress · Engineer Assigned</span>
        <span class="kpi-context">Active Pine v6 / ThinkScript diagnostics</span>
      </div>
      <div class="kpi-item">
        <span
          class="kpi-number mono"
          style="color: var(--accent-emerald-bright);"
          data-testid="support-kpi-resolved"
        >
          {{ statusSummary.resolved }}
        </span>
        <span class="kpi-label">Resolved &amp; Verified</span>
        <span class="kpi-context">
          {{ statusSummary.totalMessages }} logged messages · &lt; 12m avg SLA
        </span>
      </div>
    </div>

    <!-- =======================================================================
         2. SUBMIT NEW TECHNICAL SUPPORT REQUEST PANEL (ALWAYS ACCESSIBLE)
         ======================================================================= -->
    <div class="bento-panel support-composer-panel" style="margin-bottom: 24px;">
      <div class="support-composer-header">
        <div>
          <div class="meta-line">
            <span class="meta-accent">Direct Quant Engineering Dispatch</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span class="mono">Support Key: {{ effectiveSupportKey }}</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span>SLA &lt; 15 Minutes</span>
          </div>
          <h2 class="support-section-heading">
            Submit Technical Support Request
          </h2>
        </div>

        <button
          type="button"
          class="btn-secondary"
          data-testid="toggle-new-ticket-composer-btn"
          @click="isComposerOpen = !isComposerOpen"
        >
          {{ !isComposerOpen ? 'Collapse Request Form' : 'Expand Request Form' }}
        </button>
      </div>

      <form
        v-show="!isComposerOpen"
        class="support-ticket-form"
        data-testid="priority-support-form"
        novalidate
        @submit.prevent="handleCreateSupportTicket"
      >
        <div class="form-row-3">
          <div class="form-field">
            <label class="form-label" for="sup-cat">Support Category</label>
            <select
              id="sup-cat"
              v-model="newCategory"
              class="form-select"
              data-testid="support-category-select"
            >
              <option value="TradingView ACL Sync">
                TradingView ACL Sync
              </option>
              <option value="thinkorswim Study Import">
                thinkorswim Study Import
              </option>
              <option value="License Key Re-binding">
                License Key Re-binding
              </option>
              <option value="Webhook / Alert Setup">
                Webhook / Alert Setup
              </option>
              <option value="Prop Desk Billing">
                Prop Desk Billing
              </option>
            </select>
          </div>

          <div class="form-field">
            <label class="form-label" for="sup-platform">Target Trading Platform</label>
            <select
              id="sup-platform"
              v-model="newPlatformTarget"
              class="form-select"
              data-testid="support-platform-select"
            >
              <option value="TradingView">TradingView (Pine Script v6)</option>
              <option value="thinkorswim">Charles Schwab thinkorswim (.ts)</option>
              <option value="Dual-Platform">Dual-Platform (TradingView + TOS)</option>
            </select>
          </div>

          <div class="form-field">
            <label class="form-label" for="sup-priority">Desk Urgency / Priority</label>
            <select
              id="sup-priority"
              v-model="newPriority"
              class="form-select"
              data-testid="support-priority-select"
            >
              <option value="Normal">Normal (&lt; 2h SLA)</option>
              <option value="High">High (&lt; 25m SLA)</option>
              <option value="Critical">Critical — Live Execution Desk (&lt; 10m SLA)</option>
            </select>
          </div>
        </div>

        <div class="form-row-2">
          <div class="form-field">
            <label class="form-label" for="sup-lic">Bound Indicator License Key</label>
            <select
              id="sup-lic"
              v-model="newLicenseKey"
              class="form-select mono"
              data-testid="support-license-select"
            >
              <option value="">
                Auto-Bind Primary License ({{ store.customerLicenses[0]?.licenseKey || 'SE-BUND-8841-A9C2' }})
              </option>
              <option
                v-for="lic in store.customerLicenses"
                :key="lic.id"
                :value="lic.licenseKey"
              >
                {{ lic.licenseKey }} — {{ lic.indicatorName }}
              </option>
            </select>
          </div>

          <div class="form-field">
            <label class="form-label" for="sup-subject">Ticket Subject</label>
            <input
              id="sup-subject"
              v-model="newSubject"
              type="text"
              class="form-input"
              data-testid="support-subject-input"
              placeholder="e.g. Assistance configuring 0DTE Gamma Wall webhook alerts on ES1!"
            />
          </div>
        </div>

        <div class="form-field">
          <label class="form-label" for="sup-message">
            Technical Details &amp; Chart Diagnostics
          </label>
          <textarea
            id="sup-message"
            v-model="newDescription"
            rows="2"
            class="form-input"
            style="resize: vertical; min-height: 72px;"
            data-testid="support-message-input"
            placeholder="Include your chart ticker (SPX, ES1!, NQ1!), timeframe, or specific TradingView / thinkorswim setup questions..."
          ></textarea>
        </div>

        <div
          v-if="composerError"
          class="form-error"
          style="margin-bottom: 12px;"
          role="alert"
          data-testid="support-composer-error"
        >
          {{ composerError }}
        </div>

        <div class="support-composer-actions">
          <span class="mono" style="font-size: 0.78rem; color: var(--text-muted);">
            Auto-attaches @{{ store.activeTradingViewHandle }} · {{ store.activeTosAccountId }} · {{ effectiveSupportKey }}
          </span>
          <button
            type="submit"
            class="btn-primary"
            :disabled="isSubmittingTicket"
            data-testid="submit-support-ticket-btn"
          >
            {{
              isSubmittingTicket
                ? 'Dispatching Ticket...'
                : 'Dispatch Priority Ticket with Support Key →'
            }}
          </button>
        </div>

        <div
          v-if="lastSubmittedConfirmation"
          class="step-item"
          style="margin-top: 14px; border-color: rgba(16, 185, 129, 0.45);"
          data-testid="support-ticket-confirmation"
        >
          <div class="meta-line">
            <span class="mono" style="color: var(--accent-emerald-bright); font-weight: 700;">
              TICKET {{ lastSubmittedConfirmation.ticketId }} LOGGED
            </span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span class="mono">{{ lastSubmittedConfirmation.supportKey }}</span>
          </div>
          <p style="font-size: 0.85rem; color: var(--text-primary); margin-top: 6px;">
            <strong>{{ lastSubmittedConfirmation.subject }}</strong> — Assigned to Senior
            Quant Desk Engineering ({{ lastSubmittedConfirmation.createdAt }}). Selected in the live messaging interface below.
          </p>
        </div>
      </form>
    </div>

    <!-- =======================================================================
         3. FILTER & SEARCH BAR FOR TICKET QUEUE
         ======================================================================= -->
    <div class="support-filter-bar" data-testid="support-filter-bar">
      <div class="support-filter-controls">
        <!-- Scope Toggle: My Account vs All Desk Tickets -->
        <div class="segmented-group" role="group" aria-label="Ticket Account Scope">
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: ticketScope === 'mine' }"
            data-testid="scope-my-tickets-btn"
            @click="ticketScope = 'mine'"
          >
            My Account Tickets
          </button>
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: ticketScope === 'all' }"
            data-testid="scope-all-tickets-btn"
            @click="ticketScope = 'all'"
          >
            All Desk Tickets ({{ store.supportTickets.length }})
          </button>
        </div>

        <!-- Status Filter Buttons -->
        <div class="segmented-group" role="group" aria-label="Filter Tickets by Status">
          <button
            v-for="st in (['All', 'Open', 'In Progress', 'Resolved'] as const)"
            :key="st"
            type="button"
            class="segmented-btn"
            :class="{ active: statusFilter === st }"
            :data-testid="`filter-status-${st.toLowerCase().replace(/\s+/g, '-')}`"
            @click="statusFilter = st"
          >
            {{ st }}
          </button>
        </div>
      </div>

      <!-- Search Input -->
      <div class="support-search-box">
        <label for="support-ticket-search" class="sr-only">
          Search support tickets
        </label>
        <input
          id="support-ticket-search"
          v-model="searchQuery"
          type="search"
          class="form-input"
          data-testid="support-ticket-search-input"
          placeholder="Search TKT-#, subject, license key, or message..."
        />
      </div>
    </div>

    <!-- =======================================================================
         4. DEDICATED SPLIT-PANE MESSAGING & STATUS TRACKING WORKSPACE
         ======================================================================= -->
    <div class="support-workspace-grid">
      <!-- LEFT PANE: TICKET QUEUE LIST -->
      <aside
        class="bento-panel support-queue-pane"
        aria-label="Support Ticket Queue"
        data-testid="support-ticket-queue"
      >
        <div class="support-pane-header">
          <div class="meta-line" style="white-space: nowrap;">
            <span class="meta-accent">Ticket Queue</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span class="mono">{{ filteredTickets.length }} showing</span>
          </div>
          <span class="mono" style="font-size: 0.74rem; color: var(--text-muted); white-space: nowrap;">
            Select thread
          </span>
        </div>

        <div v-if="filteredTickets.length === 0" class="support-empty-queue">
          <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 12px;">
            No support tickets match your active filter criteria.
          </p>
          <button
            type="button"
            class="btn-secondary"
            data-testid="reset-ticket-filters-btn"
            @click="resetFilters"
          >
            Reset Ticket Filters
          </button>
        </div>

        <div v-else class="support-queue-list">
          <button
            v-for="tkt in filteredTickets"
            :key="tkt.id"
            type="button"
            class="support-queue-card"
            :class="{ active: selectedTicket?.id === tkt.id }"
            :data-testid="`support-ticket-item-${tkt.ticketNumber}`"
            @click="selectTicket(tkt.id)"
          >
            <div class="meta-line" style="justify-content: space-between; width: 100%;">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span class="mono" style="font-weight: 700; color: var(--text-primary);">
                  {{ tkt.ticketNumber }}
                </span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span
                  class="mono"
                  :style="{
                    fontWeight: 600,
                    color:
                      tkt.status === 'Resolved'
                        ? 'var(--accent-emerald-bright)'
                        : tkt.status === 'In Progress'
                        ? 'var(--accent-sky)'
                        : 'var(--accent-amber)',
                  }"
                >
                  {{ tkt.status }}
                </span>
              </div>
              <span
                class="mono"
                :style="{
                  fontSize: '0.72rem',
                  color:
                    tkt.priority === 'Critical'
                      ? 'var(--accent-crimson)'
                      : tkt.priority === 'High'
                      ? 'var(--accent-amber)'
                      : 'var(--text-muted)',
                }"
              >
                {{ tkt.priority }} Priority
              </span>
            </div>

            <div class="support-queue-subject">
              {{ tkt.subject }}
            </div>

            <div class="meta-line" style="margin-top: 6px; font-size: 0.74rem;">
              <span>{{ tkt.category }}</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>{{ tkt.platformTarget }}</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span class="mono">{{ tkt.licenseKey }}</span>
            </div>

            <div
              class="meta-line"
              style="
                margin-top: 8px;
                padding-top: 8px;
                border-top: 1px solid var(--border-hairline);
                justify-content: space-between;
                width: 100%;
                font-size: 0.72rem;
              "
            >
              <span class="mono">
                {{ buildDefaultTicketMessages(tkt).length }} messages
              </span>
              <span class="mono">{{ tkt.updatedAt }}</span>
            </div>
          </button>
        </div>
      </aside>

      <!-- RIGHT PANE: DEDICATED TICKET MESSAGING THREAD & STATUS TRACKER -->
      <div
        v-if="selectedTicket"
        class="bento-panel support-thread-pane"
        data-testid="support-messaging-thread"
      >
        <!-- Ticket Detail Header -->
        <div class="support-thread-header">
          <div>
            <div class="meta-line">
              <span
                class="mono"
                style="font-weight: 700; color: var(--accent-emerald-bright);"
                data-testid="active-ticket-number"
              >
                {{ selectedTicket.ticketNumber }}
              </span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>{{ selectedTicket.category }}</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>{{ selectedTicket.platformTarget }}</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span
                class="mono"
                :style="{
                  color:
                    selectedTicket.priority === 'Critical'
                      ? 'var(--accent-crimson)'
                      : selectedTicket.priority === 'High'
                      ? 'var(--accent-amber)'
                      : 'var(--text-secondary)',
                }"
              >
                {{ selectedTicket.priority }} Priority
              </span>
            </div>

            <h3 class="support-thread-title" data-testid="active-ticket-subject">
              {{ selectedTicket.subject }}
            </h3>

            <div class="meta-line" style="margin-top: 6px;">
              <span>Trader: <strong>{{ selectedTicket.customerName }}</strong></span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Handle: <strong class="mono">@{{ selectedTicket.tradingViewUsername }}</strong></span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>License: <strong class="mono">{{ selectedTicket.licenseKey }}</strong></span>
            </div>
          </div>

          <div class="support-thread-header-actions">
            <button
              v-if="selectedTicket.status !== 'Resolved'"
              type="button"
              class="btn-secondary"
              :disabled="isUpdatingStatus"
              data-testid="mark-ticket-resolved-btn"
              @click="handleStatusTransition('Resolved')"
            >
              Mark Resolved
            </button>
            <button
              v-else
              type="button"
              class="btn-secondary"
              :disabled="isUpdatingStatus"
              data-testid="reopen-ticket-btn"
              @click="handleStatusTransition('In Progress')"
            >
              Reopen Ticket
            </button>

            <button
              type="button"
              class="btn-ghost"
              data-testid="export-ticket-transcript-btn"
              @click="downloadTicketTranscript(selectedTicket)"
            >
              Export Transcript (.txt)
            </button>
          </div>
        </div>

        <!-- 3-Stage Status Lifecycle Tracker -->
        <div
          class="support-lifecycle-box"
          data-testid="ticket-lifecycle-tracker"
        >
          <div class="meta-line" style="justify-content: space-between; margin-bottom: 10px;">
            <span>
              Real-Time Status Progression:
              <strong
                class="mono"
                :style="{
                  color:
                    selectedTicket.status === 'Resolved'
                      ? 'var(--accent-emerald-bright)'
                      : selectedTicket.status === 'In Progress'
                      ? 'var(--accent-sky)'
                      : 'var(--accent-amber)',
                }"
                data-testid="active-ticket-status-label"
              >
                {{ selectedTicket.status.toUpperCase() }} ({{ selectedLifecycle.completionPct }}%)
              </strong>
            </span>
            <span class="mono" style="font-size: 0.75rem; color: var(--text-muted);">
              {{ selectedLifecycle.slaTargetLabel }} · Updated {{ selectedTicket.updatedAt }}
            </span>
          </div>

          <div class="support-lifecycle-grid">
            <div
              v-for="stage in selectedLifecycle.stages"
              :key="stage.step"
              class="support-stage-card"
              :class="{
                completed: stage.completed,
                active: stage.active,
              }"
            >
              <div class="meta-line" style="justify-content: space-between;">
                <span
                  class="mono"
                  style="font-weight: 700; font-size: 0.78rem;"
                  :style="{
                    color: stage.completed
                      ? 'var(--accent-emerald-bright)'
                      : 'var(--text-muted)',
                  }"
                >
                  {{ stage.label }}
                </span>
                <span class="mono" style="font-size: 0.72rem;">
                  {{ stage.completed ? 'VERIFIED' : 'PENDING' }}
                </span>
              </div>
              <p style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 4px;">
                {{ stage.sublabel }}
              </p>
            </div>
          </div>
        </div>

        <!-- Chronological Messaging Conversation Log -->
        <div
          class="support-messages-container"
          data-testid="ticket-conversation-log"
          role="log"
          aria-live="polite"
        >
          <div
            v-for="msg in selectedTicketMessages"
            :key="msg.id"
            class="support-message-item"
            :class="`role-${msg.senderRole}`"
            data-testid="ticket-message-bubble"
          >
            <div class="support-message-meta">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span
                  class="mono support-sender-role"
                  :style="{
                    color:
                      msg.senderRole === 'engineer'
                        ? 'var(--accent-emerald-bright)'
                        : msg.senderRole === 'system'
                        ? 'var(--accent-amber)'
                        : 'var(--accent-sky)',
                  }"
                >
                  {{
                    msg.senderRole === 'engineer'
                      ? 'QUANT ENGINEERING DESK'
                      : msg.senderRole === 'system'
                      ? 'AUTOMATED TRIAGE ROUTER'
                      : 'CLIENT TRADER'
                  }}
                </span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <strong style="color: var(--text-primary); font-size: 0.85rem;">
                  {{ msg.senderName }}
                </strong>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span class="mono" style="font-size: 0.75rem; color: var(--text-muted);">
                  {{ msg.senderHandleOrTitle }}
                </span>
              </div>
              <span class="mono" style="font-size: 0.74rem; color: var(--text-muted);">
                {{ msg.createdAt }}
              </span>
            </div>

            <p class="support-message-body">
              {{ msg.body }}
            </p>

            <div
              v-if="msg.diagnosticSnippet"
              class="code-preview support-diagnostic-snippet"
            >
              {{ msg.diagnosticSnippet }}
            </div>
          </div>
        </div>

        <!-- Dedicated Message Reply Composer -->
        <form
          class="support-reply-composer"
          data-testid="ticket-reply-form"
          novalidate
          @submit.prevent="handleSendReply"
        >
          <div class="support-reply-toolbar">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span class="form-label" style="margin-bottom: 0;">
                Attach Diagnostic Telemetry:
              </span>
              <button
                type="button"
                class="btn-ghost support-snippet-btn"
                data-testid="attach-tv-diagnostic-btn"
                @click="attachDiagnosticPreset('tv')"
              >
                + TradingView Handle &amp; ACL
              </button>
              <button
                type="button"
                class="btn-ghost support-snippet-btn"
                data-testid="attach-tos-diagnostic-btn"
                @click="attachDiagnosticPreset('tos')"
              >
                + thinkorswim Account ID
              </button>
              <button
                type="button"
                class="btn-ghost support-snippet-btn"
                @click="attachDiagnosticPreset('webhook')"
              >
                + Support Key &amp; Webhook Token
              </button>
            </div>

            <!-- Role Switcher for Testing Client vs Desk Engineer Responses -->
            <div class="segmented-group" role="group" aria-label="Message Sender Role">
              <button
                type="button"
                class="segmented-btn"
                :class="{ active: replySenderRole === 'client' }"
                data-testid="reply-role-client-btn"
                @click="replySenderRole = 'client'"
              >
                Post as Client Trader
              </button>
              <button
                type="button"
                class="segmented-btn"
                :class="{ active: replySenderRole === 'engineer' }"
                data-testid="reply-role-engineer-btn"
                @click="replySenderRole = 'engineer'"
              >
                Post as Quant Desk
              </button>
            </div>
          </div>

          <div v-if="replyDiagnosticSnippet" class="support-attached-diagnostic">
            <span class="mono" style="font-size: 0.75rem; color: var(--accent-emerald-bright);">
              Attached Telemetry: {{ replyDiagnosticSnippet }}
            </span>
            <button
              type="button"
              class="btn-ghost"
              style="padding: 2px 8px; font-size: 0.72rem;"
              @click="replyDiagnosticSnippet = ''"
            >
              Remove
            </button>
          </div>

          <div class="form-field" style="margin-bottom: 10px;">
            <label for="ticket-reply-input" class="form-label">
              Reply to {{ selectedTicket.ticketNumber }} ({{ selectedTicket.subject }})
            </label>
            <textarea
              id="ticket-reply-input"
              v-model="replyBody"
              rows="3"
              class="form-input"
              style="resize: vertical; min-height: 78px;"
              data-testid="ticket-reply-textarea"
              placeholder="Write a follow-up message, paste Pine Script v6 / ThinkScript log output, or confirm resolution..."
            ></textarea>
          </div>

          <div
            v-if="replyError"
            class="form-error"
            style="margin-bottom: 10px;"
            role="alert"
            data-testid="ticket-reply-error"
          >
            {{ replyError }}
          </div>

          <div class="support-reply-footer">
            <span class="mono" style="font-size: 0.75rem; color: var(--text-muted);">
              Encrypted Thread · {{ selectedTicket.ticketNumber }} · {{ effectiveSupportKey }}
            </span>
            <button
              type="submit"
              class="btn-primary"
              :disabled="isSendingReply"
              data-testid="send-ticket-reply-btn"
            >
              {{
                isSendingReply
                  ? 'Sending Message...'
                  : `Send Message to ${selectedTicket.ticketNumber} →`
              }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.support-ticketing-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.support-section-heading {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-top: 4px;
}

.support-composer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-hairline);
}

.form-row-3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.support-composer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.support-filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.support-filter-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.support-search-box {
  flex: 1 1 260px;
  max-width: 380px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.support-workspace-grid {
  display: grid;
  grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.support-queue-pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 780px;
  overflow-y: auto;
}

.support-pane-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-hairline);
}

.support-queue-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.support-queue-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  width: 100%;
  padding: 14px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid var(--border-hairline);
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color 150ms cubic-bezier(0.16, 1, 0.3, 1),
    background-color 150ms cubic-bezier(0.16, 1, 0.3, 1);
}

.support-queue-card:hover {
  border-color: rgba(56, 189, 248, 0.4);
  background: rgba(15, 23, 42, 0.85);
}

.support-queue-card.active {
  border-color: var(--accent-emerald);
  background: rgba(16, 185, 129, 0.08);
}

.support-queue-subject {
  font-family: var(--font-display);
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-top: 6px;
  line-height: 1.35;
}

.support-empty-queue {
  padding: 28px 16px;
  text-align: center;
}

.support-thread-pane {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.support-thread-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-hairline);
}

.support-thread-title {
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-top: 6px;
  line-height: 1.35;
}

.support-thread-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.support-lifecycle-box {
  padding: 14px 16px;
  border-radius: 10px;
  background: rgba(5, 8, 16, 0.55);
  border: 1px solid var(--border-hairline);
}

.support-lifecycle-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.support-stage-card {
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.45);
  border: 1px solid var(--border-hairline);
}

.support-stage-card.completed {
  border-color: rgba(16, 185, 129, 0.35);
}

.support-stage-card.active {
  border-color: var(--accent-emerald);
  background: rgba(16, 185, 129, 0.08);
}

.support-messages-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 440px;
  overflow-y: auto;
  padding-right: 4px;
}

.support-message-item {
  padding: 14px 16px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid var(--border-hairline);
}

.support-message-item.role-engineer {
  background: rgba(16, 185, 129, 0.06);
  border-color: rgba(16, 185, 129, 0.32);
}

.support-message-item.role-system {
  background: rgba(245, 158, 11, 0.05);
  border-color: rgba(245, 158, 11, 0.25);
}

.support-message-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.support-sender-role {
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.support-message-body {
  font-size: 0.9rem;
  line-height: 1.55;
  color: var(--text-primary);
  margin: 0;
}

.support-diagnostic-snippet {
  margin-top: 10px;
  font-size: 0.76rem;
  padding: 8px 12px;
}

.support-reply-composer {
  padding-top: 16px;
  border-top: 1px solid var(--border-hairline);
}

.support-reply-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.support-snippet-btn {
  padding: 5px 10px;
  font-size: 0.75rem;
}

.support-attached-diagnostic {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.3);
  margin-bottom: 10px;
}

.support-reply-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

@media (max-width: 1023px) {
  .support-workspace-grid {
    grid-template-columns: 1fr;
  }

  .support-lifecycle-grid {
    grid-template-columns: 1fr;
  }

  .form-row-3 {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .support-search-box {
    max-width: 100%;
    width: 100%;
  }

  .support-composer-actions,
  .support-reply-footer {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
