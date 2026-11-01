<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  usePlatformStore,
  type LicenseRecord,
} from '../stores/platformStore';
import {
  calculateOrderPricing,
  generateDeterministicLicenseKey,
  type PlatformPreference,
} from '../utils/fulfillment';

export interface CompletedReceiptPayload {
  orderId: string;
  totalPaid: number;
  paymentMethod: string;
  platformPreference: PlatformPreference;
  licenses: LicenseRecord[];
  timestamp: string;
}

const props = defineProps<{
  checkoutMode: 'single' | 'cart';
  platformPreference: PlatformPreference;
  customerName: string;
  customerEmail: string;
  tradingViewUsername: string;
  thinkorswimAccountId: string;
  couponCode: string;
  paymentMethod: 'Card' | 'Wire' | 'USDC';
  cardholderName: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvc: string;
  billingZip: string;
  acceptTerms: boolean;
  submitting: boolean;
  simulationStage: string;
  completedReceipt: CompletedReceiptPayload | null;
  fieldErrors: Record<string, string>;
  bannerError?: string;
  wizardLayoutMode: 'wizard' | 'express';
}>();

const emit = defineEmits<{
  (e: 'update:paymentMethod', val: 'Card' | 'Wire' | 'USDC'): void;
  (e: 'update:cardholderName', val: string): void;
  (e: 'update:cardNumber', val: string): void;
  (e: 'update:cardExpiry', val: string): void;
  (e: 'update:cardCvc', val: string): void;
  (e: 'update:billingZip', val: string): void;
  (e: 'update:acceptTerms', val: boolean): void;
  (e: 'edit-step-1'): void;
  (e: 'edit-step-2'): void;
  (e: 'back'): void;
  (e: 'confirm-payment'): void;
  (e: 'download-study', lic: LicenseRecord): void;
  (e: 'open-dashboard'): void;
  (e: 'reset-order'): void;
}>();

const store = usePlatformStore();
const copiedKey = ref(false);

const singleOrderPricing = computed(() => {
  const ind = store.selectedIndicator;
  if (!ind) {
    return {
      basePrice: 1790,
      discountPct: 15,
      discountAmount: 268.5,
      finalPrice: 1521.5,
      billingCycle: 'Annual' as const,
      expiresAt: '2027-10-31',
    };
  }
  return calculateOrderPricing(
    {
      monthly: ind.priceMonthly,
      annual: ind.priceAnnual,
      lifetime: ind.priceLifetime,
    },
    store.selectedBillingCycle,
    props.couponCode
  );
});

const orderSummaryData = computed(() => {
  if (props.checkoutMode === 'cart' && store.detailedCartItems.length > 0) {
    const sub = store.cartTotals.subtotal;
    const disc = store.cartTotals.discountTotal;
    const pct = sub > 0 ? Math.round((disc / sub) * 100) : 0;
    return {
      items: store.detailedCartItems.map((it) => ({
        id: it.indicator.id,
        name: it.indicator.name,
        category: it.indicator.category,
        version: it.indicator.version,
        billingCycle: it.billingCycle,
        price: it.finalPrice,
      })),
      subtotal: sub,
      discountPct: pct,
      discountAmount: disc,
      finalTotal: store.cartTotals.finalTotal,
    };
  }

  const ind = store.selectedIndicator;
  return {
    items: [
      {
        id: ind?.id || 'se-institutional-bundle',
        name: ind?.name || 'StratEdge Institutional Trinity Bundle',
        category: ind?.category || 'Bundle',
        version: ind?.version || 'v6.4.0',
        billingCycle: store.selectedBillingCycle,
        price: singleOrderPricing.value.finalPrice,
      },
    ],
    subtotal: singleOrderPricing.value.basePrice,
    discountPct: singleOrderPricing.value.discountPct,
    discountAmount: singleOrderPricing.value.discountAmount,
    finalTotal: singleOrderPricing.value.finalPrice,
  };
});

const previewLicenseKey = computed(() => {
  if (props.completedReceipt && props.completedReceipt.licenses.length > 0) {
    return props.completedReceipt.licenses[0].licenseKey;
  }
  const primaryId = orderSummaryData.value.items[0]?.id || 'se-institutional-bundle';
  const handleSeed = (
    props.tradingViewUsername ||
    props.thinkorswimAccountId ||
    'DESK'
  )
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(-4)
    .padStart(4, '9');
  return generateDeterministicLicenseKey(
    primaryId,
    props.customerEmail || 'desk@stratedge.io',
    handleSeed
  );
});

const primaryGeneratedKey = computed(() => {
  if (props.completedReceipt && props.completedReceipt.licenses.length > 0) {
    return props.completedReceipt.licenses[0].licenseKey;
  }
  return previewLicenseKey.value;
});

const boundHandleSummary = computed(() => {
  if (props.platformPreference === 'thinkorswim') {
    return props.thinkorswimAccountId || 'TOS-994182';
  }
  if (props.platformPreference === 'Dual') {
    return `@${props.tradingViewUsername || 'MarcusVance_ES'} + ${props.thinkorswimAccountId || 'TOS-994182'}`;
  }
  return `@${props.tradingViewUsername || 'MarcusVance_ES'}`;
});

function populateSimulatedTestCard() {
  emit('update:paymentMethod', 'Card');
  emit('update:cardholderName', props.customerName || 'Marcus Vance');
  emit('update:cardNumber', '4242 4242 4242 4242');
  emit('update:cardExpiry', '08/29');
  emit('update:cardCvc', '842');
  emit('update:billingZip', '10005');
}

async function copyLicenseKey(key: string) {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(key);
    }
    copiedKey.value = true;
    setTimeout(() => {
      copiedKey.value = false;
    }, 2000);
  } catch {
    copiedKey.value = true;
  }
}
</script>

<template>
  <div
    class="step-payment-settlement-shell"
    data-testid="checkout-step-payment-settlement"
  >
    <!-- Step Header -->
    <div class="step-header">
      <div class="meta-line" style="margin-bottom: 6px;">
        <span class="meta-accent">Step 03 of 03</span>
        <span class="meta-sep" aria-hidden="true">·</span>
        <span>Payment Processing Simulation, Final Order Summary &amp; License Generation</span>
      </div>
      <h2 class="step-heading">
        Payment Processing, Order Summary &amp; Instant License Provisioning
      </h2>
      <p class="step-description">
        Review your complete order summary and bound platform credentials, simulate encrypted
        institutional payment settlement, and click Confirm Payment to generate your cryptographic
        StratEdge license key immediately.
      </p>
    </div>

    <!-- =====================================================================
         SUCCESS STATE WITH GENERATED LICENSE KEY (Shown after Confirm Payment)
         ===================================================================== -->
    <div
      v-if="completedReceipt"
      class="success-state-panel"
      data-testid="step3-payment-success-state"
    >
      <div class="success-badge-row">
        <span class="mono success-status-pill">
          ✓ PAYMENT CONFIRMED · LICENSE PROVISIONED
        </span>
        <span class="mono" style="font-size: 0.78rem; color: var(--text-secondary);">
          Order {{ completedReceipt.orderId }} · {{ completedReceipt.timestamp }}
        </span>
      </div>

      <h3 class="success-headline">
        Transaction Approved — Your Cryptographic License Key Is Active
      </h3>
      <p style="font-size: 0.86rem; color: var(--text-secondary); margin-bottom: 16px;">
        Your {{ completedReceipt.paymentMethod }} settlement of
        <strong class="mono" style="color: var(--accent-emerald-bright);">
          ${{ completedReceipt.totalPaid.toLocaleString() }} USD
        </strong>
        has cleared. Invite-Only TradingView permissions and watermarked Charles Schwab thinkorswim
        `.ts` studies have been bound to
        <strong class="mono" style="color: var(--text-primary);">{{ boundHandleSummary }}</strong>.
      </p>

      <!-- Highlighted Generated License Key Box -->
      <div class="generated-key-vault" data-testid="step3-generated-license-vault">
        <div>
          <div class="mono" style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted);">
            Generated Cryptographic License Key (SHA-256 Deterministic Binding)
          </div>
          <div
            class="mono generated-key-code"
            data-testid="step3-generated-license-key"
          >
            {{ primaryGeneratedKey }}
          </div>
          <div class="mono" style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">
            Bound Trader: {{ customerEmail }} · Platform: {{ completedReceipt.platformPreference }} ({{ boundHandleSummary }})
          </div>
        </div>

        <button
          type="button"
          class="btn-secondary"
          data-testid="step3-copy-license-key-btn"
          @click="copyLicenseKey(primaryGeneratedKey)"
        >
          {{ copiedKey ? '✓ License Key Copied' : 'Copy License Key' }}
        </button>
      </div>

      <!-- Provisioned Indicator License Cards -->
      <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 16px;">
        <div
          v-for="lic in completedReceipt.licenses"
          :key="lic.id"
          class="provisioned-item-row"
          data-testid="step3-provisioned-license-item"
        >
          <div>
            <div class="meta-line" style="font-size: 0.74rem;">
              <span class="meta-accent">{{ lic.tvAccessStatus }}</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>{{ lic.billingCycle }} Tier</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span class="mono">Expires {{ lic.expiresAt }}</span>
            </div>
            <strong style="font-size: 0.98rem; color: var(--text-primary); display: block; margin-top: 2px;">
              {{ lic.indicatorName }}
            </strong>
            <span class="mono" style="font-size: 0.8rem; color: var(--accent-emerald-bright);">
              Key: {{ lic.licenseKey }} · Handle: @{{ lic.tradingViewUsername }}
            </span>
          </div>

          <button
            type="button"
            class="btn-secondary"
            style="padding: 6px 12px; min-height: 32px; font-size: 0.78rem;"
            data-testid="step3-download-study-btn"
            @click="emit('download-study', lic)"
          >
            Download {{ lic.tosStudyFilename }}
          </button>
        </div>
      </div>

      <!-- Post-Success Navigation CTAs -->
      <div
        style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-top: 18px;
          padding-top: 14px;
          border-top: 1px solid var(--border-hairline);
          flex-wrap: wrap;
        "
      >
        <button
          type="button"
          class="btn-ghost"
          data-testid="step3-reset-order-btn"
          @click="emit('reset-order')"
        >
          ← Place Another Institutional Order
        </button>
        <button
          type="button"
          class="btn-primary"
          data-testid="step3-open-dashboard-btn"
          @click="emit('open-dashboard')"
        >
          Open Client Dashboard &amp; License Vault →
        </button>
      </div>
    </div>

    <!-- =====================================================================
         ACTIVE PAYMENT & ORDER SUMMARY CONFIRMATION VIEW
         ===================================================================== -->
    <template v-else>
      <!-- SECTION 03A: ORDER DETAILS & BOUND LICENSE HANDLE SUMMARY -->
      <div class="sub-panel" data-testid="step3-order-details-summary">
        <div class="sub-panel-header">
          <span class="mono sub-panel-index">03A</span>
          <span class="sub-panel-title">Summary of Order Details &amp; License Binding</span>
          <div style="margin-left: auto; display: flex; gap: 6px;">
            <button
              v-if="wizardLayoutMode === 'wizard'"
              type="button"
              class="btn-ghost"
              style="padding: 3px 8px; min-height: 24px; font-size: 0.72rem;"
              @click="emit('edit-step-1')"
            >
              Edit Step 01
            </button>
            <button
              v-if="wizardLayoutMode === 'wizard'"
              type="button"
              class="btn-ghost"
              style="padding: 3px 8px; min-height: 24px; font-size: 0.72rem;"
              @click="emit('edit-step-2')"
            >
              Edit Step 02
            </button>
          </div>
        </div>

        <!-- Trader & Bound Platform Metadata Grid -->
        <div class="summary-metadata-grid" data-testid="step3-verified-summary">
          <div class="summary-meta-cell">
            <span class="summary-meta-label">Licensed Trader</span>
            <strong class="summary-meta-value">{{ customerName || 'Marcus Vance' }}</strong>
            <span class="mono summary-meta-sub">{{ customerEmail || 'marcus.vance@apexquant.io' }}</span>
          </div>

          <div class="summary-meta-cell">
            <span class="summary-meta-label">Execution Platform &amp; Handle</span>
            <strong class="mono summary-meta-value" style="color: var(--accent-emerald-bright);">
              {{ platformPreference }} · {{ boundHandleSummary }}
            </strong>
            <span class="mono summary-meta-sub">Instant ACL &amp; .ts Watermark Target</span>
          </div>

          <div class="summary-meta-cell">
            <span class="summary-meta-label">Pre-Allocated License Key</span>
            <strong
              class="mono summary-meta-value"
              style="color: var(--accent-sky);"
              data-testid="step3-preview-license-key"
            >
              {{ previewLicenseKey }}
            </strong>
            <span class="mono summary-meta-sub">Activates on Confirm Payment</span>
          </div>
        </div>

        <!-- Itemized Order Lines -->
        <div class="summary-line-list">
          <div
            v-for="(item, idx) in orderSummaryData.items"
            :key="`${item.id}-${idx}`"
            class="summary-line-item"
          >
            <div>
              <span style="font-weight: 600; color: var(--text-primary); font-size: 0.88rem;">
                {{ item.name }}
              </span>
              <span class="mono" style="font-size: 0.75rem; color: var(--text-muted); margin-left: 8px;">
                {{ item.billingCycle }} Plan · {{ item.version }}
              </span>
            </div>
            <span class="mono" style="font-weight: 600; color: var(--text-primary);">
              ${{ item.price.toLocaleString() }} USD
            </span>
          </div>
        </div>

        <!-- Totals Footer Strip -->
        <div class="summary-totals-bar">
          <div class="summary-total-metric">
            <span>Subtotal</span>
            <span class="mono">${{ orderSummaryData.subtotal.toLocaleString() }} USD</span>
          </div>
          <div class="summary-total-metric" style="color: var(--accent-emerald-bright);">
            <span>Promo Discount ({{ couponCode || 'NONE' }} · {{ orderSummaryData.discountPct }}%)</span>
            <span class="mono">-${{ orderSummaryData.discountAmount.toLocaleString() }} USD</span>
          </div>
          <div class="summary-total-metric total-due-highlight">
            <span>Total Due Today</span>
            <span
              class="mono"
              style="font-size: 1.15rem; font-weight: 700; color: var(--accent-emerald-bright);"
              data-testid="step3-summary-total-due"
            >
              ${{ orderSummaryData.finalTotal.toLocaleString() }} USD
            </span>
          </div>
        </div>
      </div>

      <!-- SECTION 03B: PAYMENT PROCESSING SIMULATION & RAIL CONFIGURATION -->
      <div class="sub-panel" data-testid="step3-payment-simulation-box">
        <div class="sub-panel-header">
          <span class="mono sub-panel-index">03B</span>
          <span class="sub-panel-title">
            Encrypted Payment Processing Simulation
          </span>
          <button
            type="button"
            class="btn-ghost"
            style="margin-left: auto; padding: 3px 9px; min-height: 24px; font-size: 0.72rem;"
            data-testid="step3-autofill-test-card-btn"
            @click="populateSimulatedTestCard"
          >
            ⚡ Autofill Sandbox Card
          </button>
        </div>

        <div class="form-field">
          <label class="form-label">Select Institutional Settlement Rail</label>
          <div
            class="segmented-group"
            style="width: 100%; display: grid; grid-template-columns: repeat(3, 1fr);"
          >
            <button
              v-for="rail in (['Card', 'Wire', 'USDC'] as const)"
              :key="rail"
              type="button"
              class="segmented-btn"
              :class="{ active: paymentMethod === rail }"
              :data-testid="`step3-rail-${rail.toLowerCase()}-btn`"
              @click="emit('update:paymentMethod', rail)"
            >
              {{
                rail === 'Card'
                  ? 'Credit / Debit Card'
                  : rail === 'Wire'
                  ? 'Prop Desk Wire'
                  : 'USDC On-Chain'
              }}
            </button>
          </div>
        </div>

        <!-- Credit / Debit Card Inputs -->
        <div v-if="paymentMethod === 'Card'">
          <div class="form-row-2">
            <div class="form-field">
              <label for="chk-cardholderName" class="form-label">
                Name on Card *
              </label>
              <input
                id="chk-cardholderName"
                :value="cardholderName"
                type="text"
                class="form-input"
                placeholder="Marcus Vance"
                data-testid="step3-cardholder-input"
                @input="(e) => emit('update:cardholderName', (e.target as HTMLInputElement).value)"
              />
              <span v-if="fieldErrors.cardholderName" class="form-error" role="alert">
                {{ fieldErrors.cardholderName }}
              </span>
            </div>

            <div class="form-field">
              <label for="chk-cardNumber" class="form-label">
                Card Number (Sandbox 4242) *
              </label>
              <input
                id="chk-cardNumber"
                :value="cardNumber"
                type="text"
                class="form-input mono"
                placeholder="4242 4242 4242 4242"
                data-testid="step3-cardnumber-input"
                @input="(e) => emit('update:cardNumber', (e.target as HTMLInputElement).value)"
              />
              <span v-if="fieldErrors.cardNumber" class="form-error" role="alert">
                {{ fieldErrors.cardNumber }}
              </span>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
            <div class="form-field" style="margin-bottom: 0;">
              <label for="chk-cardExpiry" class="form-label">
                Expiry (MM/YY) *
              </label>
              <input
                id="chk-cardExpiry"
                :value="cardExpiry"
                type="text"
                class="form-input mono"
                placeholder="08/29"
                data-testid="step3-cardexpiry-input"
                @input="(e) => emit('update:cardExpiry', (e.target as HTMLInputElement).value)"
              />
              <span v-if="fieldErrors.cardExpiry" class="form-error" role="alert">
                {{ fieldErrors.cardExpiry }}
              </span>
            </div>

            <div class="form-field" style="margin-bottom: 0;">
              <label for="chk-cardCvc" class="form-label">
                Security CVC *
              </label>
              <input
                id="chk-cardCvc"
                :value="cardCvc"
                type="text"
                class="form-input mono"
                placeholder="842"
                data-testid="step3-cardcvc-input"
                @input="(e) => emit('update:cardCvc', (e.target as HTMLInputElement).value)"
              />
              <span v-if="fieldErrors.cardCvc" class="form-error" role="alert">
                {{ fieldErrors.cardCvc }}
              </span>
            </div>

            <div class="form-field" style="margin-bottom: 0;">
              <label for="chk-billingZip" class="form-label">
                Billing ZIP / Postal *
              </label>
              <input
                id="chk-billingZip"
                :value="billingZip"
                type="text"
                class="form-input mono"
                placeholder="10005"
                data-testid="step3-billingzip-input"
                @input="(e) => emit('update:billingZip', (e.target as HTMLInputElement).value)"
              />
              <span v-if="fieldErrors.billingZip" class="form-error" role="alert">
                {{ fieldErrors.billingZip }}
              </span>
            </div>
          </div>
        </div>

        <!-- Desk Wire or USDC Instructions -->
        <div
          v-else
          style="
            padding: 14px;
            background: rgba(5, 8, 16, 0.74);
            border: 1px solid var(--border-hairline);
            border-radius: var(--radius-inner);
            font-size: 0.84rem;
            color: var(--text-secondary);
          "
        >
          <strong style="color: var(--accent-emerald-bright); display: block; margin-bottom: 4px;">
            {{
              paymentMethod === 'Wire'
                ? 'Instant Prop-Desk Clearing Authorization (FEDWIRE / SWIFT):'
                : 'Instant USDC Smart-Contract Settlement (ERC-20 / Base):'
            }}
          </strong>
          Simulated clearing reference is pre-authorized for your desk. Clicking
          <strong>Confirm Payment</strong> below settles the order and provisions your license key
          immediately.
        </div>

        <!-- Live Payment Processing Simulation Status Strip -->
        <div
          v-if="submitting || simulationStage"
          class="mono simulation-progress-strip"
          data-testid="step3-simulation-status"
        >
          <span class="pulse-dot" aria-hidden="true"></span>
          <span>{{ simulationStage || 'Simulating encrypted payment settlement & minting license key...' }}</span>
        </div>
      </div>

      <!-- SECTION 03C: FINAL AUTHORIZATION & 'CONFIRM PAYMENT' ACTION -->
      <div class="sub-panel" style="margin-bottom: 10px;">
        <label
          style="
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 0.84rem;
            color: var(--text-secondary);
            cursor: pointer;
          "
        >
          <input
            type="checkbox"
            :checked="acceptTerms"
            style="width: 16px; height: 16px; accent-color: var(--accent-emerald);"
            data-testid="step3-accept-terms-checkbox"
            @change="(e) => emit('update:acceptTerms', (e.target as HTMLInputElement).checked)"
          />
          <span>
            I authorize settlement of
            <strong class="mono" style="color: var(--text-primary);">
              ${{ orderSummaryData.finalTotal.toLocaleString() }} USD
            </strong>
            and immediate cryptographic license provisioning for
            <strong class="mono" style="color: var(--accent-emerald-bright);">
              {{ boundHandleSummary }}
            </strong>.
          </span>
        </label>
        <span v-if="fieldErrors.acceptTerms" class="form-error" role="alert">
          {{ fieldErrors.acceptTerms }}
        </span>
      </div>

      <div
        v-if="bannerError"
        class="form-error"
        style="margin-bottom: 14px; font-size: 0.85rem;"
        role="alert"
        data-testid="checkout-validation-error"
      >
        {{ bannerError }}
      </div>

      <!-- Step 03 Back & Confirm Payment Button Row -->
      <div
        style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-top: 12px;
          flex-wrap: wrap;
        "
      >
        <button
          v-if="wizardLayoutMode === 'wizard'"
          type="button"
          class="btn-ghost"
          data-testid="checkout-back-step-3-btn"
          @click="emit('back')"
        >
          ← Back to Step 02 (Order &amp; Binding)
        </button>

        <button
          type="submit"
          class="btn-primary"
          style="flex: 1; min-height: 48px; font-size: 0.95rem;"
          :disabled="submitting"
          data-testid="submit-secure-payment-btn"
          @click.prevent="emit('confirm-payment')"
        >
          {{
            submitting
              ? simulationStage || 'Processing Payment & Generating License Key...'
              : `Confirm Payment · $${orderSummaryData.finalTotal.toLocaleString()} USD →`
          }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.step-header {
  margin-bottom: 16px;
}

.step-heading {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  margin-bottom: 4px;
}

.step-description {
  font-size: 0.86rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.sub-panel {
  padding: 16px 18px;
  background: rgba(5, 8, 16, 0.58);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  margin-bottom: 14px;
}

.sub-panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-hairline);
  flex-wrap: wrap;
}

.sub-panel-index {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(245, 158, 11, 0.14);
  color: var(--accent-amber);
  border: 1px solid rgba(245, 158, 11, 0.32);
}

.sub-panel-title {
  font-size: 0.82rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-primary);
}

.summary-metadata-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 12px;
}

@media (max-width: 768px) {
  .summary-metadata-grid {
    grid-template-columns: 1fr;
  }
}

.summary-meta-cell {
  padding: 10px 12px;
  background: rgba(11, 17, 30, 0.78);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-inner);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.summary-meta-label {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.summary-meta-value {
  font-size: 0.84rem;
  color: var(--text-primary);
}

.summary-meta-sub {
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.summary-line-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: rgba(5, 8, 16, 0.72);
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-inner);
  margin-bottom: 10px;
}

.summary-line-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.summary-totals-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--border-hairline);
  font-size: 0.82rem;
}

.summary-total-metric {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--text-secondary);
}

.total-due-highlight {
  padding-top: 8px;
  margin-top: 2px;
  border-top: 1px solid var(--border-hairline);
  font-weight: 700;
  color: var(--text-primary);
}

.simulation-progress-strip {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-inner);
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.35);
  color: var(--accent-emerald-bright);
  font-size: 0.78rem;
  display: flex;
  align-items: center;
  gap: 8px;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-emerald-bright);
  display: inline-block;
}

.success-state-panel {
  padding: 20px 22px;
  background: linear-gradient(160deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 8, 16, 0.9) 100%);
  border: 1px solid var(--accent-emerald);
  border-radius: var(--radius-md);
}

.success-badge-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.success-status-pill {
  padding: 4px 10px;
  border-radius: 4px;
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid var(--accent-emerald);
  color: var(--accent-emerald-bright);
  font-size: 0.74rem;
  font-weight: 700;
}

.success-headline {
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.generated-key-vault {
  padding: 14px 16px;
  background: rgba(5, 8, 16, 0.88);
  border: 1px solid rgba(16, 185, 129, 0.45);
  border-radius: var(--radius-md);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.generated-key-code {
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--accent-emerald-bright);
  margin-top: 4px;
}

.provisioned-item-row {
  padding: 12px 14px;
  background: rgba(11, 17, 30, 0.8);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-inner);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
</style>
