<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePlatformStore } from '../stores/platformStore';
import {
  TradingViewUsernameSchema,
  ThinkorswimAccountIdSchema,
  calculateOrderPricing,
  generateDeterministicLicenseKey,
  type PlatformPreference,
} from '../utils/fulfillment';

const props = defineProps<{
  checkoutMode: 'single' | 'cart';
  platformPreference: PlatformPreference;
  customerEmail: string;
  tradingViewUsername: string;
  thinkorswimAccountId: string;
  couponCode: string;
  acceptTerms: boolean;
  fieldErrors: Record<string, string>;
  bannerError?: string;
  wizardLayoutMode: 'wizard' | 'express';
}>();

const emit = defineEmits<{
  (e: 'update:checkoutMode', val: 'single' | 'cart'): void;
  (e: 'update:platformPreference', val: PlatformPreference): void;
  (e: 'update:tradingViewUsername', val: string): void;
  (e: 'update:thinkorswimAccountId', val: string): void;
  (e: 'update:couponCode', val: string): void;
  (e: 'update:acceptTerms', val: boolean): void;
  (e: 'back'): void;
  (e: 'next'): void;
}>();

const store = usePlatformStore();

const tvVerified = ref(false);
const tosVerified = ref(false);
const bindingHintMessage = ref('');

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

const activeOrderSummary = computed(() => {
  if (props.checkoutMode === 'cart' && store.detailedCartItems.length > 0) {
    return {
      itemCount: store.cartTotals.itemCount,
      subtotal: store.cartTotals.subtotal,
      discountPct: store.cartTotals.discountPct,
      discountTotal: store.cartTotals.discountTotal,
      finalTotal: store.cartTotals.finalTotal,
      expiresLabel: 'Per-Item Cadence',
    };
  }
  return {
    itemCount: 1,
    subtotal: singleOrderPricing.value.basePrice,
    discountPct: singleOrderPricing.value.discountPct,
    discountTotal: singleOrderPricing.value.discountAmount,
    finalTotal: singleOrderPricing.value.finalPrice,
    expiresLabel:
      singleOrderPricing.value.billingCycle === 'Lifetime'
        ? 'Perpetual / No Expiry'
        : singleOrderPricing.value.expiresAt,
  };
});

const previewLicenseKey = computed(() => {
  const primaryId =
    props.checkoutMode === 'cart' && store.detailedCartItems.length > 0
      ? store.detailedCartItems[0].indicator.id
      : store.selectedIndicatorId || 'se-institutional-bundle';
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

const requiresTradingView = computed(
  () =>
    props.platformPreference === 'TradingView' ||
    props.platformPreference === 'Dual'
);

const requiresThinkorswim = computed(
  () =>
    props.platformPreference === 'thinkorswim' ||
    props.platformPreference === 'Dual'
);

function verifyTradingViewBinding() {
  const res = TradingViewUsernameSchema.safeParse(props.tradingViewUsername);
  tvVerified.value = res.success;
  if (res.success) {
    bindingHintMessage.value = `Verified TradingView ACL target @${props.tradingViewUsername.trim()} for key ${previewLicenseKey.value}`;
  } else {
    bindingHintMessage.value =
      res.error.issues[0]?.message || 'Enter a valid TradingView username';
  }
}

function verifyThinkorswimBinding() {
  const res = ThinkorswimAccountIdSchema.safeParse(props.thinkorswimAccountId);
  tosVerified.value = res.success;
  if (res.success) {
    bindingHintMessage.value = `Verified Charles Schwab thinkorswim ID ${props.thinkorswimAccountId.trim()} for .ts study watermark`;
  } else {
    bindingHintMessage.value =
      res.error.issues[0]?.message || 'Enter a valid thinkorswim Account ID';
  }
}
</script>

<template>
  <div
    class="step-order-binding-shell"
    :style="{
      paddingBottom: wizardLayoutMode === 'express' ? '22px' : '6px',
      marginBottom: wizardLayoutMode === 'express' ? '22px' : '0',
      borderBottom:
        wizardLayoutMode === 'express'
          ? '1px solid var(--border-hairline)'
          : 'none',
    }"
    data-testid="checkout-step-order-summary-binding"
  >
    <!-- Step Header -->
    <div class="step-header">
      <div class="meta-line" style="margin-bottom: 6px;">
        <span class="meta-accent">Step 02 of 03</span>
        <span class="meta-sep" aria-hidden="true">·</span>
        <span>Order Summary, Cryptographic License Key Binding &amp; Terms Acceptance</span>
      </div>
      <h2 class="step-heading">
        Order Summary, License Key Binding &amp; Terms of Service
      </h2>
      <p class="step-description">
        Review your quantitative indicator order summary, verify the execution handle bound to your
        cryptographic license key (TradingView username and/or Charles Schwab thinkorswim Account ID),
        and accept the institutional non-redistribution terms before settlement.
      </p>
    </div>

    <!-- =====================================================================
         SECTION 02A: INTERACTIVE ORDER SUMMARY & MODEL CONFIGURATION
         ===================================================================== -->
    <div class="sub-panel" data-testid="step2-order-summary-box">
      <div class="sub-panel-header">
        <span class="mono sub-panel-index">02A</span>
        <span class="sub-panel-title">Order Summary &amp; Quantitative Model Configuration</span>
        <div style="margin-left: auto; display: flex; gap: 6px;">
          <button
            type="button"
            class="btn-ghost"
            style="padding: 3px 9px; min-height: 24px; font-size: 0.72rem;"
            :style="{
              borderColor:
                checkoutMode === 'single'
                  ? 'var(--accent-emerald)'
                  : 'var(--border-subtle)',
              color:
                checkoutMode === 'single'
                  ? 'var(--accent-emerald-bright)'
                  : 'var(--text-secondary)',
            }"
            @click="emit('update:checkoutMode', 'single')"
          >
            Single License
          </button>
          <button
            type="button"
            class="btn-ghost"
            style="padding: 3px 9px; min-height: 24px; font-size: 0.72rem;"
            :style="{
              borderColor:
                checkoutMode === 'cart'
                  ? 'var(--accent-emerald)'
                  : 'var(--border-subtle)',
              color:
                checkoutMode === 'cart'
                  ? 'var(--accent-emerald-bright)'
                  : 'var(--text-secondary)',
            }"
            @click="emit('update:checkoutMode', 'cart')"
          >
            Multi-Item Cart ({{ store.cartTotals.itemCount }})
          </button>
        </div>
      </div>

      <!-- Single Model Selection Mode -->
      <div v-if="checkoutMode === 'single'">
        <div class="form-row-2">
          <div class="form-field">
            <label for="chk-indicator-select" class="form-label">
              Quantitative Indicator / Suite
            </label>
            <select
              id="chk-indicator-select"
              v-model="store.selectedIndicatorId"
              class="form-select"
              data-testid="checkout-indicator-select"
            >
              <option
                v-for="ind in store.indicators"
                :key="ind.id"
                :value="ind.id"
              >
                {{ ind.name }} (${{ ind.priceMonthly }}/mo · ${{ ind.priceAnnual }}/yr)
              </option>
            </select>
          </div>

          <div class="form-field">
            <label class="form-label">Membership Billing Cadence</label>
            <div
              class="segmented-group"
              style="width: 100%; display: grid; grid-template-columns: repeat(3, 1fr);"
            >
              <button
                v-for="cad in (['Monthly', 'Annual', 'Lifetime'] as const)"
                :key="cad"
                type="button"
                class="segmented-btn"
                :class="{ active: store.selectedBillingCycle === cad }"
                @click="store.selectedBillingCycle = cad"
              >
                {{ cad }}
              </button>
            </div>
          </div>
        </div>

        <!-- Selected Indicator Line Item Preview -->
        <div
          v-if="store.selectedIndicator"
          class="order-line-card"
        >
          <div>
            <div class="meta-line">
              <span class="meta-accent">{{ store.selectedIndicator.category }}</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span class="mono">{{ store.selectedIndicator.version }}</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span class="mono" style="color: var(--accent-emerald-bright);">
                {{ store.selectedIndicator.winRatePct }}% Verified Win Rate
              </span>
            </div>
            <strong style="font-size: 1rem; display: block; margin-top: 3px;">
              {{ store.selectedIndicator.name }}
            </strong>
            <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">
              {{ store.selectedIndicator.tagline }}
            </p>
          </div>

          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <span class="mono" style="font-size: 1.05rem; font-weight: 700; color: var(--accent-emerald-bright);">
              ${{ singleOrderPricing.finalPrice.toLocaleString() }}
            </span>
            <button
              type="button"
              class="btn-secondary"
              style="padding: 6px 12px; min-height: 30px; font-size: 0.76rem;"
              data-testid="step2-add-to-cart-btn"
              @click="
                store.addToCart(
                  store.selectedIndicator.id,
                  store.selectedBillingCycle,
                  false
                );
                emit('update:checkoutMode', 'cart');
              "
            >
              + Add to Cart ({{ store.cartTotals.itemCount }})
            </button>
          </div>
        </div>
      </div>

      <!-- Multi-Item Shopping Cart Mode -->
      <div v-else data-testid="step2-cart-manager">
        <div
          v-if="store.detailedCartItems.length > 0"
          style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px;"
        >
          <div
            v-for="item in store.detailedCartItems"
            :key="`${item.indicator.id}-${item.index}`"
            class="order-line-card"
            data-testid="step2-cart-item"
          >
            <div>
              <div class="meta-line" style="font-size: 0.74rem;">
                <span class="meta-accent">{{ item.indicator.category }}</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span class="mono">{{ item.indicator.version }}</span>
              </div>
              <strong style="font-size: 0.94rem; color: var(--text-primary);">
                {{ item.indicator.name }}
              </strong>
            </div>

            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <div class="segmented-group" style="padding: 2px;">
                <button
                  v-for="cad in (['Monthly', 'Annual', 'Lifetime'] as const)"
                  :key="cad"
                  type="button"
                  class="segmented-btn"
                  style="padding: 4px 8px; min-height: 25px; font-size: 0.72rem;"
                  :class="{ active: item.billingCycle === cad }"
                  @click="store.updateCartItemCycle(item.index, cad)"
                >
                  {{ cad }}
                </button>
              </div>

              <span
                class="mono"
                style="font-weight: 700; color: var(--accent-emerald-bright); min-width: 70px; text-align: right;"
              >
                ${{ item.finalPrice.toLocaleString() }}
              </span>

              <button
                type="button"
                class="btn-ghost"
                style="padding: 4px 8px; min-height: 25px; font-size: 0.72rem;"
                @click="store.removeFromCart(item.index)"
              >
                Remove
              </button>
            </div>
          </div>
        </div>

        <div
          v-else
          style="
            padding: 16px;
            background: rgba(5, 8, 16, 0.72);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            margin-bottom: 12px;
            text-align: center;
          "
        >
          <p style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">
            Your Multi-Item Cart is Empty
          </p>
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">
            Quick-add an institutional indicator below or switch to Single License mode:
          </p>
        </div>

        <!-- Quick-Add Companion Indicators Bar -->
        <div class="quick-add-bar">
          <div style="font-size: 0.76rem; color: var(--text-secondary); margin-bottom: 6px;">
            Quick-Add Quantitative Model to Cart:
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button
              v-for="ind in store.indicators.slice(0, 4)"
              :key="ind.id"
              type="button"
              class="btn-ghost"
              style="padding: 4px 10px; min-height: 26px; font-size: 0.74rem;"
              @click="store.addToCart(ind.id, 'Annual', false)"
            >
              + {{ ind.name.replace('StratEdge ', '') }} (${{ ind.priceAnnual }}/yr)
            </button>
          </div>
        </div>
      </div>

      <!-- Compact Promo Code & Financial Order Summary Ledger -->
      <div class="order-ledger-strip">
        <div class="form-row-2" style="align-items: end; margin-bottom: 10px;">
          <div class="form-field" style="margin-bottom: 0;">
            <label for="step2-promo-input" class="form-label">
              Institutional / Prop-Desk Promo Code
            </label>
            <input
              id="step2-promo-input"
              :value="couponCode"
              type="text"
              class="form-input mono"
              placeholder="PROP15, DESK20, TRINITY25, FOUNDER50"
              data-testid="step2-coupon-input"
              @input="(e) => emit('update:couponCode', (e.target as HTMLInputElement).value)"
            />
          </div>

          <div class="ledger-metrics">
            <div class="ledger-metric-item">
              <span class="ledger-metric-label">Gross Subtotal</span>
              <span class="mono ledger-metric-val">
                ${{ activeOrderSummary.subtotal.toLocaleString() }}
              </span>
            </div>
            <div class="ledger-metric-item">
              <span class="ledger-metric-label">
                Desk Discount ({{ activeOrderSummary.discountPct }}%)
              </span>
              <span class="mono ledger-metric-val" style="color: var(--accent-emerald-bright);">
                -${{ activeOrderSummary.discountTotal.toLocaleString() }}
              </span>
            </div>
            <div class="ledger-metric-item">
              <span class="ledger-metric-label">Net Total Due</span>
              <span
                class="mono ledger-metric-val"
                style="font-size: 1.05rem; font-weight: 700; color: var(--accent-emerald-bright);"
                data-testid="step2-net-total-due"
              >
                ${{ activeOrderSummary.finalTotal.toLocaleString() }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- =====================================================================
         SECTION 02B: CRYPTOGRAPHIC LICENSE KEY BINDING FIELD
         (TradingView Username / Charles Schwab thinkorswim Account ID)
         ===================================================================== -->
    <div class="sub-panel" data-testid="step2-license-binding-box">
      <div class="sub-panel-header">
        <span class="mono sub-panel-index">02B</span>
        <span class="sub-panel-title">
          Cryptographic License Key Binding (TradingView Username / TOS Account ID)
        </span>
        <span class="mono key-preview-chip" data-testid="step2-license-key-preview">
          Key Preview: {{ previewLicenseKey }}
        </span>
      </div>

      <p style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 12px;">
        Each StratEdge license key is cryptographically bound to your execution platform identity to
        prevent unauthorized script redistribution and automate sub-second ACL whitelisting.
      </p>

      <div class="form-row-2">
        <!-- TradingView Username License Binding Field -->
        <div class="form-field" style="margin-bottom: 0;">
          <label for="step2-tv-binding-input" class="form-label">
            TradingView Username (Invite-Only ACL Binding)
            <span v-if="requiresTradingView" style="color: var(--accent-emerald-bright);">*</span>
          </label>
          <div style="display: flex; gap: 8px;">
            <input
              id="step2-tv-binding-input"
              :value="tradingViewUsername"
              type="text"
              class="form-input mono"
              placeholder="MarcusVance_ES"
              autocomplete="off"
              data-testid="step2-binding-tv-input"
              @input="
                (e) => {
                  tvVerified = false;
                  emit('update:tradingViewUsername', (e.target as HTMLInputElement).value);
                }
              "
            />
            <button
              type="button"
              class="btn-secondary"
              style="padding: 0 12px; white-space: nowrap; font-size: 0.76rem;"
              data-testid="step2-verify-tv-btn"
              @click="verifyTradingViewBinding"
            >
              {{ tvVerified ? '✓ Bound' : 'Verify ACL' }}
            </button>
          </div>
          <span class="form-hint">
            Whitelisted in TradingView → Indicators → Invite-Only Scripts immediately upon checkout.
          </span>
          <span
            v-if="fieldErrors.tradingViewUsername"
            class="form-error"
            role="alert"
            data-testid="step2-error-tv-binding"
          >
            {{ fieldErrors.tradingViewUsername }}
          </span>
        </div>

        <!-- thinkorswim Account ID License Binding Field -->
        <div class="form-field" style="margin-bottom: 0;">
          <label for="step2-tos-binding-input" class="form-label">
            Charles Schwab thinkorswim Account ID (.ts Watermark)
            <span v-if="requiresThinkorswim" style="color: var(--accent-sky);">*</span>
          </label>
          <div style="display: flex; gap: 8px;">
            <input
              id="step2-tos-binding-input"
              :value="thinkorswimAccountId"
              type="text"
              class="form-input mono"
              placeholder="TOS-994182"
              autocomplete="off"
              data-testid="step2-binding-tos-input"
              @input="
                (e) => {
                  tosVerified = false;
                  emit('update:thinkorswimAccountId', (e.target as HTMLInputElement).value);
                }
              "
            />
            <button
              type="button"
              class="btn-secondary"
              style="padding: 0 12px; white-space: nowrap; font-size: 0.76rem;"
              data-testid="step2-verify-tos-btn"
              @click="verifyThinkorswimBinding"
            >
              {{ tosVerified ? '✓ Bound' : 'Verify TOS' }}
            </button>
          </div>
          <span class="form-hint">
            Embedded into your custom `.ts` ThinkScript study header watermark on download.
          </span>
          <span
            v-if="fieldErrors.thinkorswimAccountId"
            class="form-error"
            role="alert"
            data-testid="step2-error-tos-binding"
          >
            {{ fieldErrors.thinkorswimAccountId }}
          </span>
        </div>
      </div>

      <div
        v-if="bindingHintMessage"
        class="mono"
        style="
          margin-top: 10px;
          padding: 8px 12px;
          border-radius: var(--radius-inner);
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.28);
          font-size: 0.76rem;
          color: var(--accent-emerald-bright);
        "
        data-testid="step2-binding-status-msg"
      >
        {{ bindingHintMessage }}
      </div>
    </div>

    <!-- =====================================================================
         SECTION 02C: TERMS OF SERVICE & NON-REDISTRIBUTION ACCEPTANCE
         ===================================================================== -->
    <div class="sub-panel" data-testid="step2-terms-acceptance-box">
      <div class="sub-panel-header">
        <span class="mono sub-panel-index">02C</span>
        <span class="sub-panel-title">
          Institutional License Agreement &amp; Terms of Service Acceptance
        </span>
      </div>

      <label
        for="step2-accept-terms-checkbox"
        class="terms-checkbox-card"
        :class="{ active: acceptTerms }"
      >
        <input
          id="step2-accept-terms-checkbox"
          type="checkbox"
          :checked="acceptTerms"
          style="
            width: 18px;
            height: 18px;
            margin-top: 2px;
            accent-color: var(--accent-emerald);
            flex-shrink: 0;
          "
          data-testid="step2-accept-terms-checkbox"
          @change="(e) => emit('update:acceptTerms', (e.target as HTMLInputElement).checked)"
        />
        <div>
          <div style="font-weight: 600; font-size: 0.88rem; color: var(--text-primary);">
            I accept the StratEdge Single-Seat Institutional License &amp; Non-Redistribution Terms *
          </div>
          <p style="font-size: 0.79rem; color: var(--text-secondary); margin-top: 3px; line-height: 1.45;">
            I confirm that the bound TradingView username and/or Charles Schwab thinkorswim Account ID
            belong to me, authorize immediate digital license provisioning, and acknowledge that
            decompilation or unauthorized sharing of watermarked `.ts` studies or Invite-Only scripts
            triggers automatic license revocation.
          </p>
        </div>
      </label>

      <span
        v-if="fieldErrors.acceptTerms"
        class="form-error"
        style="display: block; margin-top: 8px;"
        role="alert"
        data-testid="step2-error-accept-terms"
      >
        {{ fieldErrors.acceptTerms }}
      </span>
    </div>

    <!-- Step-level validation banner -->
    <div
      v-if="bannerError"
      class="form-error"
      style="margin-bottom: 12px; font-size: 0.84rem;"
      role="alert"
      data-testid="step2-banner-error"
    >
      {{ bannerError }}
    </div>

    <!-- Wizard Step 02 Back / Next Navigation CTAs -->
    <div
      v-if="wizardLayoutMode === 'wizard'"
      style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-top: 14px;
        flex-wrap: wrap;
      "
    >
      <button
        type="button"
        class="btn-ghost"
        data-testid="checkout-back-step-2-btn"
        @click="emit('back')"
      >
        ← Back to Step 01 (Identity &amp; Platform)
      </button>
      <button
        type="button"
        class="btn-primary"
        data-testid="checkout-next-step-2-btn"
        @click="emit('next')"
      >
        Continue to Step 03: Payment &amp; Settlement →
      </button>
    </div>
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
  background: rgba(16, 185, 129, 0.14);
  color: var(--accent-emerald-bright);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.sub-panel-title {
  font-size: 0.82rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-primary);
}

.order-line-card {
  padding: 12px 14px;
  background: rgba(5, 8, 16, 0.78);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 6px;
  margin-bottom: 12px;
}

.quick-add-bar {
  padding: 10px 12px;
  background: rgba(16, 185, 129, 0.05);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  margin-bottom: 12px;
}

.order-ledger-strip {
  padding-top: 10px;
  border-top: 1px solid var(--border-hairline);
}

.ledger-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 8px 12px;
  background: rgba(11, 17, 30, 0.85);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-inner);
}

.ledger-metric-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ledger-metric-label {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.ledger-metric-val {
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--text-primary);
}

.key-preview-chip {
  margin-left: auto;
  font-size: 0.72rem;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.35);
  color: var(--accent-emerald-bright);
}

.terms-checkbox-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: rgba(11, 17, 30, 0.72);
  cursor: pointer;
  transition: border-color 140ms ease, background 140ms ease;
}

.terms-checkbox-card.active {
  border-color: rgba(16, 185, 129, 0.45);
  background: rgba(16, 185, 129, 0.06);
}
</style>
