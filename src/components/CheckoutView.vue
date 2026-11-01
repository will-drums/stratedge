<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useForm } from '@tanstack/vue-form';
import {
  usePlatformStore,
  type LicenseRecord,
} from '../stores/platformStore';
import {
  SecureCheckoutPaymentSchema,
  CheckoutIdentityPlatformStepSchema,
  CheckoutStep1Schema,
  calculateOrderPricing,
  type PlatformPreference,
} from '../utils/fulfillment';
import CheckoutStepIdentityPlatform from './CheckoutStepIdentityPlatform.vue';

const emit = defineEmits<{
  (e: 'navigate', view: 'storefront' | 'checkout' | 'dashboard' | 'admin'): void;
}>();

const store = usePlatformStore();

// Checkout Mode: 'single' (selected indicator/suite) or 'cart' (all items in cart)
const checkoutMode = ref<'single' | 'cart'>(
  store.cartItems.length > 0 ? 'cart' : 'single'
);

// 3-Step Multi-Step Wizard State (1: Identity & Platform Preference, 2: Cart & Model Selection, 3: Payment & Settlement)
const currentStep = ref<1 | 2 | 3>(1);
const wizardLayoutMode = ref<'wizard' | 'express'>('wizard');
const step1Completed = ref(false);
const step2Completed = ref(false);

// Execution Platform Preference captured in Step 1 ('TradingView' | 'thinkorswim' | 'Dual')
const platformPreference = ref<PlatformPreference>('TradingView');

const couponInput = ref(store.cartCouponCode || 'PROP15');
const paymentMethod = ref<'Card' | 'Wire' | 'USDC'>('Card');
const submitting = ref(false);
const bannerError = ref('');

// Field-level Zod validation errors
const fieldErrors = reactive<Record<string, string>>({});

// Transaction Success & Provisioned License Receipt State
const completedReceipt = ref<{
  orderId: string;
  totalPaid: number;
  paymentMethod: string;
  platformPreference: PlatformPreference;
  licenses: LicenseRecord[];
  timestamp: string;
} | null>(null);

function clearErrors() {
  bannerError.value = '';
  Object.keys(fieldErrors).forEach((k) => delete fieldErrors[k]);
}

function resolveEffectiveTradingViewHandle(rawHandle: string, tosId: string): string {
  const trimmed = rawHandle.trim();
  if (trimmed.length >= 3) return trimmed;
  const sanitizedTos = tosId.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 20);
  return sanitizedTos.length >= 3 ? sanitizedTos : 'TOS_Desk_Trader';
}

// TanStack Form instance backed by SecureCheckoutPaymentSchema (Zod)
const paymentForm = useForm({
  defaultValues: {
    customerName: store.activeCustomerName || 'Marcus Vance',
    customerEmail: store.activeCustomerEmail || 'marcus.vance@apexquant.io',
    tradingViewUsername: store.activeTradingViewHandle || 'MarcusVance_ES',
    thinkorswimAccountId: store.activeTosAccountId || 'TOS-994182',
    cardholderName: store.activeCustomerName || 'Marcus Vance',
    cardNumber: '4242 4242 4242 4242',
    cardExpiry: '08/29',
    cardCvc: '842',
    billingZip: '10005',
    acceptTerms: true,
  },
  onSubmit: async ({ value }) => {
    clearErrors();

    // First validate Step 1 Identity & Platform Preference
    const step1Check = CheckoutIdentityPlatformStepSchema.safeParse({
      customerName: value.customerName,
      customerEmail: value.customerEmail,
      platformPreference: platformPreference.value,
      tradingViewUsername: value.tradingViewUsername,
      thinkorswimAccountId: value.thinkorswimAccountId,
    });

    if (!step1Check.success) {
      for (const issue of step1Check.error.issues) {
        const key = String(issue.path[0] || 'form');
        if (!fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      }
      if (wizardLayoutMode.value === 'wizard') {
        currentStep.value = 1;
      }
      bannerError.value =
        step1Check.error.issues[0]?.message ||
        'Please complete your identity and platform handle in Step 01.';
      return;
    }

    const effectiveTvHandle =
      platformPreference.value === 'thinkorswim'
        ? resolveEffectiveTradingViewHandle(
            value.tradingViewUsername,
            value.thinkorswimAccountId
          )
        : value.tradingViewUsername;

    const payloadToValidate = {
      customerName: value.customerName,
      customerEmail: value.customerEmail,
      tradingViewUsername: effectiveTvHandle,
      thinkorswimAccountId: value.thinkorswimAccountId,
      indicatorId: store.selectedIndicatorId || 'se-institutional-bundle',
      billingCycle: store.selectedBillingCycle,
      couponCode: couponInput.value,
      paymentMethod: paymentMethod.value,
      cardholderName:
        paymentMethod.value === 'Card' ? value.cardholderName : value.customerName,
      cardNumber:
        paymentMethod.value === 'Card' ? value.cardNumber : '4242424242424242',
      cardExpiry: paymentMethod.value === 'Card' ? value.cardExpiry : '12/29',
      cardCvc: paymentMethod.value === 'Card' ? value.cardCvc : '999',
      billingZip: value.billingZip || '10005',
      acceptTerms: value.acceptTerms,
    };

    const parsed = SecureCheckoutPaymentSchema.safeParse(payloadToValidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] || 'form');
        if (!fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      }
      if (
        wizardLayoutMode.value === 'wizard' &&
        (fieldErrors.customerName ||
          fieldErrors.customerEmail ||
          fieldErrors.tradingViewUsername ||
          fieldErrors.thinkorswimAccountId)
      ) {
        currentStep.value = 1;
      }
      bannerError.value =
        parsed.error.issues[0]?.message ||
        'Please resolve the highlighted validation errors before completing payment.';
      return;
    }

    submitting.value = true;
    try {
      if (checkoutMode.value === 'cart' && store.cartItems.length > 0) {
        const res = await fetch('/api/cart/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: parsed.data.customerName,
            customerEmail: parsed.data.customerEmail,
            tradingViewUsername: parsed.data.tradingViewUsername,
            thinkorswimAccountId: parsed.data.thinkorswimAccountId,
            couponCode: parsed.data.couponCode,
            paymentMethod: parsed.data.paymentMethod,
            items: store.cartItems,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          bannerError.value = data.error || 'Cart transaction failed';
          return;
        }

        store.activeCustomerEmail = parsed.data.customerEmail.toLowerCase();
        store.activeCustomerName = parsed.data.customerName;
        store.activeTradingViewHandle = parsed.data.tradingViewUsername;
        store.activeTosAccountId = parsed.data.thinkorswimAccountId || 'TOS-994182';
        store.isAuthenticated = true;
        store.clearCart();
        await store.fetchAllData();

        completedReceipt.value = {
          orderId: `ORD-${Date.now().toString().slice(-6)}`,
          totalPaid: data.totalPaid,
          paymentMethod: parsed.data.paymentMethod,
          platformPreference: platformPreference.value,
          licenses: data.licenses,
          timestamp:
            new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
        };
        window.scrollTo({ top: 0, behavior: 'smooth' });

        store.showNotification(
          'success',
          `Transaction Approved · ${data.licenses.length} License(s) Provisioned`,
          `Provisioned ${platformPreference.value} access for @${parsed.data.tradingViewUsername}.`
        );
      } else {
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: parsed.data.customerName,
            customerEmail: parsed.data.customerEmail,
            tradingViewUsername: parsed.data.tradingViewUsername,
            thinkorswimAccountId: parsed.data.thinkorswimAccountId,
            indicatorId: parsed.data.indicatorId,
            billingCycle: parsed.data.billingCycle,
            couponCode: parsed.data.couponCode,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          bannerError.value = data.error || 'Checkout transaction failed';
          return;
        }

        store.activeCustomerEmail = parsed.data.customerEmail.toLowerCase();
        store.activeCustomerName = parsed.data.customerName;
        store.activeTradingViewHandle = parsed.data.tradingViewUsername;
        store.activeTosAccountId = parsed.data.thinkorswimAccountId || 'TOS-994182';
        store.isAuthenticated = true;
        store.lastProvisionedLicense = data.license;
        await store.fetchAllData();

        completedReceipt.value = {
          orderId: `ORD-${Date.now().toString().slice(-6)}`,
          totalPaid: data.pricing.finalPrice,
          paymentMethod: parsed.data.paymentMethod,
          platformPreference: platformPreference.value,
          licenses: [data.license],
          timestamp: data.license.provisionedAt,
        };
        window.scrollTo({ top: 0, behavior: 'smooth' });

        store.showNotification(
          'success',
          `License ${data.license.licenseKey} Provisioned Immediately`,
          `Provisioned ${platformPreference.value} access & unlocked ${data.license.tosStudyFilename}.`
        );
      }
    } catch (err) {
      bannerError.value =
        err instanceof Error
          ? err.message
          : 'Network error during payment settlement';
    } finally {
      submitting.value = false;
    }
  },
});

// Step 1 Validation: User Identity & Platform Preference (TradingView vs. thinkorswim)
function validateAndAdvanceFromStep1() {
  clearErrors();
  const v = paymentForm.state.values;
  const parsed = CheckoutIdentityPlatformStepSchema.safeParse({
    customerName: v.customerName,
    customerEmail: v.customerEmail,
    platformPreference: platformPreference.value,
    tradingViewUsername: v.tradingViewUsername,
    thinkorswimAccountId: v.thinkorswimAccountId,
  });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] || 'form');
      if (!fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    bannerError.value =
      parsed.error.issues[0]?.message ||
      'Please complete your identity and platform preference fields.';
    return;
  }

  step1Completed.value = true;
  currentStep.value = 2;
}

// Step 2 Validation: Model, Tier & Shopping Cart Configuration
function validateAndAdvanceFromStep2() {
  clearErrors();
  const parsed = CheckoutStep1Schema.safeParse({
    checkoutMode: checkoutMode.value,
    indicatorId: store.selectedIndicatorId || 'se-institutional-bundle',
    billingCycle: store.selectedBillingCycle,
    cartItemCount: store.cartItems.length,
  });

  if (!parsed.success) {
    bannerError.value =
      parsed.error.issues[0]?.message ||
      'Please select an indicator or add items to your cart.';
    return;
  }

  step2Completed.value = true;
  currentStep.value = 3;
}

function goToStep(target: 1 | 2 | 3) {
  clearErrors();
  if (target === 1) {
    currentStep.value = 1;
    return;
  }
  if (target === 2) {
    validateAndAdvanceFromStep1();
    return;
  }
  if (target === 3) {
    validateAndAdvanceFromStep1();
    if (currentStep.value === 2) {
      validateAndAdvanceFromStep2();
    }
  }
}

watch(
  () => couponInput.value,
  (val) => {
    store.cartCouponCode = val;
  }
);

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
    couponInput.value
  );
});

const activeTotalDue = computed(() => {
  if (checkoutMode.value === 'cart' && store.cartItems.length > 0) {
    return store.cartTotals.finalTotal;
  }
  return singleOrderPricing.value.finalPrice;
});

async function downloadReceiptStudy(lic: LicenseRecord) {
  const res = await fetch(`/api/download/tos/${encodeURIComponent(lic.id)}`);
  if (!res.ok) return;
  const data = await res.json();
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
    `Watermarked thinkorswim study saved for license ${lic.licenseKey}.`
  );
}
</script>

<template>
  <section class="workspace-shell" data-testid="checkout-view">
    <div class="container">
      <!-- Header -->
      <div class="workspace-header">
        <div>
          <div class="meta-line">
            <span class="meta-accent">
              3-Step Encrypted Cart &amp; Checkout · Sub-Second Webhook Provisioning
            </span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span>Zod Schema Validated</span>
          </div>
          <h1 class="section-title" style="margin-top: 6px;">
            Multi-Step Cart, License Configuration &amp; Instant Checkout
          </h1>
          <p class="section-subtitle">
            Capture your trader identity and platform preference (TradingView vs. thinkorswim) in
            Step 1, configure your quantitative model or multi-item cart in Step 2, and settle
            payment in Step 3 for instant ACL provisioning.
          </p>
        </div>

        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          <!-- Mode Selector: Single Model vs Multi-Item Shopping Cart -->
          <div class="segmented-group" role="group" aria-label="Checkout Mode">
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: checkoutMode === 'single' }"
              data-testid="checkout-mode-single-btn"
              @click="checkoutMode = 'single'"
            >
              Direct Indicator License
            </button>
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: checkoutMode === 'cart' }"
              data-testid="checkout-mode-cart-btn"
              @click="checkoutMode = 'cart'"
            >
              Shopping Cart ({{ store.cartTotals.itemCount }})
            </button>
          </div>

          <!-- Layout Mode Selector: Guided 3-Step Wizard vs Express All-In-One -->
          <div class="segmented-group" role="group" aria-label="Checkout Layout Mode">
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: wizardLayoutMode === 'wizard' }"
              data-testid="checkout-layout-wizard-btn"
              @click="wizardLayoutMode = 'wizard'"
            >
              3-Step Guided Wizard
            </button>
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: wizardLayoutMode === 'express' }"
              data-testid="checkout-layout-express-btn"
              @click="wizardLayoutMode = 'express'"
            >
              Express All-Steps View
            </button>
          </div>
        </div>
      </div>

      <!-- ===================================================================
           INTERACTIVE 3-STEP PROGRESS STEPPER BAR
           =================================================================== -->
      <div
        class="bento-panel"
        style="margin-bottom: 28px; padding: 18px 22px;"
        data-testid="checkout-stepper"
      >
        <div
          style="
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            align-items: center;
          "
        >
          <!-- Step 1 Pill/Tab: User Identity & Platform Preference -->
          <button
            type="button"
            data-testid="step-indicator-1"
            :style="{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              textAlign: 'left',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              border:
                currentStep === 1
                  ? '1px solid var(--accent-emerald)'
                  : step1Completed
                  ? '1px solid rgba(16, 185, 129, 0.35)'
                  : '1px solid var(--border-subtle)',
              background:
                currentStep === 1
                  ? 'rgba(16, 185, 129, 0.12)'
                  : 'rgba(5, 8, 16, 0.65)',
              cursor: 'pointer',
            }"
            @click="goToStep(1)"
          >
            <span
              class="mono"
              :style="{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.82rem',
                background:
                  currentStep === 1 || step1Completed
                    ? 'var(--accent-emerald)'
                    : 'rgba(148, 163, 184, 0.16)',
                color: currentStep === 1 || step1Completed ? '#04130d' : 'var(--text-secondary)',
              }"
            >
              {{ step1Completed && currentStep > 1 ? '✓' : '01' }}
            </span>
            <div>
              <div class="mono" style="font-size: 0.72rem; color: var(--accent-emerald-bright);">
                STEP 01 · IDENTITY &amp; PLATFORM
              </div>
              <div style="font-weight: 700; font-size: 0.92rem; color: var(--text-primary);">
                Trader &amp; Platform Preference
              </div>
            </div>
          </button>

          <!-- Step 2 Pill/Tab: Model, Tier & Cart Selection -->
          <button
            type="button"
            data-testid="step-indicator-2"
            :style="{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              textAlign: 'left',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              border:
                currentStep === 2
                  ? '1px solid var(--accent-emerald)'
                  : step2Completed
                  ? '1px solid rgba(16, 185, 129, 0.35)'
                  : '1px solid var(--border-subtle)',
              background:
                currentStep === 2
                  ? 'rgba(16, 185, 129, 0.12)'
                  : 'rgba(5, 8, 16, 0.65)',
              cursor: 'pointer',
            }"
            @click="goToStep(2)"
          >
            <span
              class="mono"
              :style="{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.82rem',
                background:
                  currentStep === 2 || step2Completed
                    ? 'var(--accent-emerald)'
                    : 'rgba(148, 163, 184, 0.16)',
                color: currentStep === 2 || step2Completed ? '#04130d' : 'var(--text-secondary)',
              }"
            >
              {{ step2Completed && currentStep > 2 ? '✓' : '02' }}
            </span>
            <div>
              <div class="mono" style="font-size: 0.72rem; color: var(--accent-sky);">
                STEP 02 · CART &amp; TIER
              </div>
              <div style="font-weight: 700; font-size: 0.92rem; color: var(--text-primary);">
                Model &amp; Cart Selection
              </div>
            </div>
          </button>

          <!-- Step 3 Pill/Tab -->
          <button
            type="button"
            data-testid="step-indicator-3"
            :style="{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              textAlign: 'left',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              border:
                currentStep === 3
                  ? '1px solid var(--accent-emerald)'
                  : '1px solid var(--border-subtle)',
              background:
                currentStep === 3
                  ? 'rgba(16, 185, 129, 0.12)'
                  : 'rgba(5, 8, 16, 0.65)',
              cursor: 'pointer',
            }"
            @click="goToStep(3)"
          >
            <span
              class="mono"
              :style="{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.82rem',
                background:
                  currentStep === 3
                    ? 'var(--accent-emerald)'
                    : 'rgba(148, 163, 184, 0.16)',
                color: currentStep === 3 ? '#04130d' : 'var(--text-secondary)',
              }"
            >
              03
            </span>
            <div>
              <div class="mono" style="font-size: 0.72rem; color: var(--accent-amber);">
                STEP 03 · SETTLEMENT
              </div>
              <div style="font-weight: 700; font-size: 0.92rem; color: var(--text-primary);">
                Payment &amp; Instant Fulfillment
              </div>
            </div>
          </button>
        </div>
      </div>

      <!-- ===================================================================
           POST-TRANSACTION PROVISIONING RECEIPT BANNER (Shown on Success)
           =================================================================== -->
      <div
        v-if="completedReceipt"
        class="bento-panel"
        style="
          margin-bottom: 36px;
          border-color: var(--accent-emerald);
          background: var(--surface-gradient-featured);
        "
        data-testid="checkout-provisioned-receipt"
      >
        <div
          style="
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            flex-wrap: wrap;
          "
        >
          <div>
            <div class="meta-line">
              <span class="meta-accent">200 OK · Transaction Approved &amp; Provisioned</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span class="mono">Order {{ completedReceipt.orderId }}</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span class="mono">Platform: {{ completedReceipt.platformPreference }}</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span class="mono">{{ completedReceipt.timestamp }}</span>
            </div>
            <h2
              style="
                font-family: var(--font-display);
                font-size: 1.5rem;
                font-weight: 700;
                margin-top: 6px;
              "
            >
              Your StratEdge Algo License(s) Are Active!
            </h2>
            <p style="color: var(--text-secondary); font-size: 0.9375rem; margin-top: 4px;">
              TradingView Invite-Only permissions and Charles Schwab thinkorswim `.ts` studies have
              been bound to your account.
            </p>
          </div>

          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button
              type="button"
              class="btn-primary"
              data-testid="receipt-open-dashboard-btn"
              @click="emit('navigate', 'dashboard')"
            >
              Open Customer Dashboard &amp; Guides →
            </button>
            <button
              type="button"
              class="btn-ghost"
              @click="
                completedReceipt = null;
                currentStep = 1;
              "
            >
              Place Another Order
            </button>
          </div>
        </div>

        <div class="license-list" style="margin-top: 16px;">
          <div
            v-for="lic in completedReceipt.licenses"
            :key="lic.id"
            class="license-panel"
          >
            <div>
              <div class="meta-line">
                <span class="meta-accent">Provisioned</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span>{{ lic.billingCycle }} Plan</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span class="mono">Expires {{ lic.expiresAt }}</span>
              </div>
              <strong style="font-size: 1.15rem; display: block; margin-top: 4px;">
                {{ lic.indicatorName }}
              </strong>
              <span class="mono" style="font-size: 0.875rem; color: var(--accent-emerald-bright);">
                License Key: {{ lic.licenseKey }}
              </span>
            </div>

            <div>
              <div class="form-label">Whitelisted TradingView Handle</div>
              <span class="mono" style="color: var(--text-primary); font-weight: 600;">
                @{{ lic.tradingViewUsername }}
              </span>
              <div class="form-hint">Active in Indicators → Invite-Only Scripts</div>
            </div>

            <div style="display: flex; justify-content: flex-end;">
              <button
                type="button"
                class="btn-secondary"
                @click="downloadReceiptStudy(lic)"
              >
                Download {{ lic.tosStudyFilename }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ===================================================================
           MAIN 2-COLUMN CHECKOUT WORKSPACE
           Left: 3-Step Multi-Step Wizard Form
           Right: Live Order Summary, Promo Codes & Webhook Pipeline Spec
           =================================================================== -->
      <div class="checkout-grid">
        <!-- LEFT COLUMN: 3-STEP SECURE CHECKOUT FORM -->
        <form
          class="form-panel"
          novalidate
          data-testid="secure-checkout-form"
          @submit.prevent.stop="paymentForm.handleSubmit()"
        >
          <!-- ===============================================================
               STEP 1: USER IDENTITY & PLATFORM PREFERENCE (TradingView vs. thinkorswim)
               =============================================================== -->
          <div
            v-show="wizardLayoutMode === 'express' || currentStep === 1"
            data-testid="checkout-step-1"
          >
            <paymentForm.Field name="customerName">
              <template #default="{ field: nameField }">
                <paymentForm.Field name="customerEmail">
                  <template #default="{ field: emailField }">
                    <paymentForm.Field name="tradingViewUsername">
                      <template #default="{ field: tvField }">
                        <paymentForm.Field name="thinkorswimAccountId">
                          <template #default="{ field: tosField }">
                            <CheckoutStepIdentityPlatform
                              :customer-name="nameField.state.value"
                              :customer-email="emailField.state.value"
                              :platform-preference="platformPreference"
                              :trading-view-username="tvField.state.value"
                              :thinkorswim-account-id="tosField.state.value"
                              :field-errors="fieldErrors"
                              :banner-error="currentStep === 1 ? bannerError : ''"
                              :wizard-layout-mode="wizardLayoutMode"
                              @update:customer-name="(v) => nameField.handleChange(v)"
                              @update:customer-email="(v) => emailField.handleChange(v)"
                              @update:platform-preference="(v) => (platformPreference = v)"
                              @update:trading-view-username="(v) => tvField.handleChange(v)"
                              @update:thinkorswim-account-id="(v) => tosField.handleChange(v)"
                              @next="validateAndAdvanceFromStep1"
                            />
                          </template>
                        </paymentForm.Field>
                      </template>
                    </paymentForm.Field>
                  </template>
                </paymentForm.Field>
              </template>
            </paymentForm.Field>
          </div>

          <!-- ===============================================================
               STEP 2: MODEL, MEMBERSHIP TIER & SHOPPING CART SELECTION
               =============================================================== -->
          <div
            v-show="wizardLayoutMode === 'express' || currentStep === 2"
            data-testid="checkout-step-2"
            :style="{
              paddingBottom: wizardLayoutMode === 'express' ? '22px' : '6px',
              marginBottom: wizardLayoutMode === 'express' ? '22px' : '0',
              borderBottom:
                wizardLayoutMode === 'express' ? '1px solid var(--border-hairline)' : 'none',
            }"
          >
            <div class="meta-line" style="margin-bottom: 12px;">
              <span class="meta-accent">Step 02 of 03</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Configure Indicator Model, Membership Tier &amp; Shopping Cart</span>
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

              <!-- Selected Indicator Telemetry Preview + Add to Multi-Item Cart Option -->
              <div
                v-if="store.selectedIndicator"
                style="
                  padding: 16px;
                  background: rgba(5, 8, 16, 0.72);
                  border: 1px solid var(--border-subtle);
                  border-radius: var(--radius-md);
                  margin-top: 8px;
                  margin-bottom: 16px;
                "
              >
                <div
                  style="
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 12px;
                    flex-wrap: wrap;
                  "
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
                    <strong style="font-size: 1.05rem; display: block; margin-top: 4px;">
                      {{ store.selectedIndicator.name }}
                    </strong>
                    <p style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 4px;">
                      {{ store.selectedIndicator.tagline }}
                    </p>
                  </div>

                  <button
                    type="button"
                    class="btn-secondary"
                    style="padding: 6px 12px; min-height: 32px; font-size: 0.78rem;"
                    data-testid="step2-add-to-cart-btn"
                    @click="
                      store.addToCart(
                        store.selectedIndicator.id,
                        store.selectedBillingCycle,
                        false
                      );
                      checkoutMode = 'cart';
                    "
                  >
                    + Add to Multi-Item Cart ({{ store.cartTotals.itemCount }})
                  </button>
                </div>
              </div>
            </div>

            <!-- Multi-Item Shopping Cart Mode inside Step 2 -->
            <div v-else data-testid="step2-cart-manager">
              <div
                v-if="store.detailedCartItems.length > 0"
                style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;"
              >
                <div
                  v-for="item in store.detailedCartItems"
                  :key="`${item.indicator.id}-${item.index}`"
                  style="
                    padding: 14px 16px;
                    background: rgba(5, 8, 16, 0.75);
                    border: 1px solid var(--border-subtle);
                    border-radius: var(--radius-md);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 12px;
                    flex-wrap: wrap;
                  "
                  data-testid="step2-cart-item"
                >
                  <div>
                    <div class="meta-line" style="font-size: 0.74rem;">
                      <span class="meta-accent">{{ item.indicator.category }}</span>
                      <span class="meta-sep" aria-hidden="true">·</span>
                      <span class="mono">{{ item.indicator.version }}</span>
                    </div>
                    <strong style="font-size: 0.96rem; color: var(--text-primary);">
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
                        style="padding: 4px 8px; min-height: 26px; font-size: 0.72rem;"
                        :class="{ active: item.billingCycle === cad }"
                        @click="store.updateCartItemCycle(item.index, cad)"
                      >
                        {{ cad }}
                      </button>
                    </div>

                    <span
                      class="mono"
                      style="font-weight: 700; color: var(--accent-emerald-bright); min-width: 72px; text-align: right;"
                    >
                      ${{ item.finalPrice.toLocaleString() }}
                    </span>

                    <button
                      type="button"
                      class="btn-ghost"
                      style="padding: 4px 8px; min-height: 26px; font-size: 0.72rem;"
                      @click="store.removeFromCart(item.index)"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>

              <!-- Empty Cart Fallback inside Step 2 -->
              <div
                v-else
                style="
                  padding: 20px;
                  background: rgba(5, 8, 16, 0.72);
                  border: 1px solid var(--border-subtle);
                  border-radius: var(--radius-md);
                  margin-bottom: 16px;
                  text-align: center;
                "
              >
                <p style="font-weight: 600; color: var(--text-primary);">
                  Your Multi-Item Cart is Empty
                </p>
                <p style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 4px;">
                  Add one or more institutional indicators below or switch to Direct Indicator
                  License:
                </p>
              </div>

              <!-- Quick-Add Companion Indicators Bar -->
              <div
                style="
                  padding: 12px 14px;
                  background: rgba(16, 185, 129, 0.05);
                  border: 1px solid var(--border-subtle);
                  border-radius: var(--radius-md);
                  margin-bottom: 16px;
                "
              >
                <div style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 8px;">
                  Quick-Add Indicator or Bundle to Cart:
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                  <button
                    v-for="ind in store.indicators.slice(0, 4)"
                    :key="ind.id"
                    type="button"
                    class="btn-ghost"
                    style="padding: 5px 10px; min-height: 28px; font-size: 0.75rem;"
                    @click="store.addToCart(ind.id, 'Annual', false)"
                  >
                    + {{ ind.name.replace('StratEdge ', '') }} (${{ ind.priceAnnual }}/yr)
                  </button>
                </div>
              </div>
            </div>

            <div
              v-if="bannerError && currentStep === 2"
              class="form-error"
              style="margin-bottom: 12px;"
              role="alert"
            >
              {{ bannerError }}
            </div>

            <!-- Wizard Step 2 Back / Next CTAs -->
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
                @click="currentStep = 1"
              >
                ← Back to Step 01 (Identity &amp; Platform)
              </button>
              <button
                type="button"
                class="btn-primary"
                data-testid="checkout-next-step-2-btn"
                @click="validateAndAdvanceFromStep2"
              >
                Continue to Step 03: Payment &amp; Settlement →
              </button>
            </div>
          </div>

          <!-- ===============================================================
               STEP 3: ENCRYPTED PAYMENT & SETTLEMENT DETAILS
               =============================================================== -->
          <div
            v-show="wizardLayoutMode === 'express' || currentStep === 3"
            data-testid="checkout-step-3"
          >
            <div class="meta-line" style="margin-bottom: 12px;">
              <span class="meta-accent">Step 03 of 03</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Encrypted Payment, Final Review &amp; Instant License Settlement</span>
            </div>

            <!-- Verified Step 1 & Step 2 Summary Bar inside Step 3 -->
            <div
              v-if="wizardLayoutMode === 'wizard'"
              style="
                padding: 12px 16px;
                margin-bottom: 16px;
                background: rgba(5, 8, 16, 0.72);
                border: 1px solid var(--border-subtle);
                border-radius: var(--radius-md);
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                flex-wrap: wrap;
                font-size: 0.82rem;
              "
              data-testid="step3-verified-summary"
            >
              <div>
                <span style="color: var(--text-muted);">Platform Preference:</span>
                <strong class="mono" style="margin-left: 6px; color: var(--accent-emerald-bright);">
                  {{ platformPreference }}
                </strong>
                <span style="margin: 0 8px; color: var(--text-muted);">·</span>
                <span class="mono" style="color: var(--text-primary);">
                  {{
                    platformPreference === 'thinkorswim'
                      ? paymentForm.state.values.thinkorswimAccountId
                      : `@${paymentForm.state.values.tradingViewUsername}`
                  }}
                </span>
                <span style="margin: 0 8px; color: var(--text-muted);">·</span>
                <span class="mono" style="color: var(--text-secondary);">
                  {{ paymentForm.state.values.customerEmail }}
                </span>
              </div>
              <div style="display: flex; gap: 8px;">
                <button
                  type="button"
                  class="btn-ghost"
                  style="padding: 3px 8px; min-height: 24px; font-size: 0.72rem;"
                  @click="currentStep = 1"
                >
                  Edit Identity &amp; Platform
                </button>
                <button
                  type="button"
                  class="btn-ghost"
                  style="padding: 3px 8px; min-height: 24px; font-size: 0.72rem;"
                  @click="currentStep = 2"
                >
                  Edit Cart/Model
                </button>
              </div>
            </div>

            <div class="form-field">
              <label class="form-label">Select Payment Rail</label>
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
                  @click="paymentMethod = rail"
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

            <!-- Credit / Debit Card Inputs (Zod Validated) -->
            <div v-if="paymentMethod === 'Card'">
              <div class="form-row-2">
                <paymentForm.Field name="cardholderName">
                  <template #default="{ field }">
                    <div class="form-field">
                      <label :for="`chk-${field.name}`" class="form-label">
                        Name on Card *
                      </label>
                      <input
                        :id="`chk-${field.name}`"
                        :value="field.state.value"
                        type="text"
                        class="form-input"
                        placeholder="Marcus Vance"
                        @input="(e) => field.handleChange((e.target as HTMLInputElement).value)"
                      />
                      <span v-if="fieldErrors.cardholderName" class="form-error" role="alert">
                        {{ fieldErrors.cardholderName }}
                      </span>
                    </div>
                  </template>
                </paymentForm.Field>

                <paymentForm.Field name="cardNumber">
                  <template #default="{ field }">
                    <div class="form-field">
                      <label :for="`chk-${field.name}`" class="form-label">
                        Card Number *
                      </label>
                      <input
                        :id="`chk-${field.name}`"
                        :value="field.state.value"
                        type="text"
                        class="form-input mono"
                        placeholder="4242 4242 4242 4242"
                        @input="(e) => field.handleChange((e.target as HTMLInputElement).value)"
                      />
                      <span v-if="fieldErrors.cardNumber" class="form-error" role="alert">
                        {{ fieldErrors.cardNumber }}
                      </span>
                    </div>
                  </template>
                </paymentForm.Field>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                <paymentForm.Field name="cardExpiry">
                  <template #default="{ field }">
                    <div class="form-field">
                      <label :for="`chk-${field.name}`" class="form-label">
                        Expiry (MM/YY) *
                      </label>
                      <input
                        :id="`chk-${field.name}`"
                        :value="field.state.value"
                        type="text"
                        class="form-input mono"
                        placeholder="08/29"
                        @input="(e) => field.handleChange((e.target as HTMLInputElement).value)"
                      />
                      <span v-if="fieldErrors.cardExpiry" class="form-error" role="alert">
                        {{ fieldErrors.cardExpiry }}
                      </span>
                    </div>
                  </template>
                </paymentForm.Field>

                <paymentForm.Field name="cardCvc">
                  <template #default="{ field }">
                    <div class="form-field">
                      <label :for="`chk-${field.name}`" class="form-label">
                        Security CVC *
                      </label>
                      <input
                        :id="`chk-${field.name}`"
                        :value="field.state.value"
                        type="text"
                        class="form-input mono"
                        placeholder="842"
                        @input="(e) => field.handleChange((e.target as HTMLInputElement).value)"
                      />
                      <span v-if="fieldErrors.cardCvc" class="form-error" role="alert">
                        {{ fieldErrors.cardCvc }}
                      </span>
                    </div>
                  </template>
                </paymentForm.Field>

                <paymentForm.Field name="billingZip">
                  <template #default="{ field }">
                    <div class="form-field">
                      <label :for="`chk-${field.name}`" class="form-label">
                        Billing ZIP / Postal *
                      </label>
                      <input
                        :id="`chk-${field.name}`"
                        :value="field.state.value"
                        type="text"
                        class="form-input mono"
                        placeholder="10005"
                        @input="(e) => field.handleChange((e.target as HTMLInputElement).value)"
                      />
                      <span v-if="fieldErrors.billingZip" class="form-error" role="alert">
                        {{ fieldErrors.billingZip }}
                      </span>
                    </div>
                  </template>
                </paymentForm.Field>
              </div>
            </div>

            <!-- Desk Wire or USDC Instructions -->
            <div
              v-else
              style="
                padding: 14px;
                margin-bottom: 16px;
                background: rgba(5, 8, 16, 0.7);
                border: 1px solid var(--border-hairline);
                border-radius: var(--radius-inner);
                font-size: 0.85rem;
                color: var(--text-secondary);
              "
            >
              <strong style="color: var(--accent-emerald-bright);">
                {{
                  paymentMethod === 'Wire'
                    ? 'Instant Prop-Desk Clearing Authorization:'
                    : 'Instant USDC Smart-Contract Settlement:'
                }}
              </strong>
              Your indicator license and TradingView ACL will be provisioned immediately upon
              submitting this settlement order.
            </div>

            <!-- Institutional Terms Checkbox -->
            <paymentForm.Field name="acceptTerms">
              <template #default="{ field }">
                <div class="form-field" style="margin-top: 6px;">
                  <label
                    style="
                      display: flex;
                      align-items: center;
                      gap: 10px;
                      font-size: 0.85rem;
                      color: var(--text-secondary);
                      cursor: pointer;
                    "
                  >
                    <input
                      type="checkbox"
                      :checked="field.state.value"
                      style="width: 16px; height: 16px; accent-color: var(--accent-emerald);"
                      @change="(e) => field.handleChange((e.target as HTMLInputElement).checked)"
                    />
                    <span>
                      I authorize immediate digital license provisioning and agree to the
                      single-seat TradingView &amp; thinkorswim license terms.
                    </span>
                  </label>
                  <span v-if="fieldErrors.acceptTerms" class="form-error" role="alert">
                    {{ fieldErrors.acceptTerms }}
                  </span>
                </div>
              </template>
            </paymentForm.Field>

            <div
              v-if="bannerError"
              class="form-error"
              style="margin-bottom: 14px; font-size: 0.85rem;"
              role="alert"
              data-testid="checkout-validation-error"
            >
              {{ bannerError }}
            </div>

            <div
              style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                margin-top: 12px;
              "
            >
              <button
                v-if="wizardLayoutMode === 'wizard'"
                type="button"
                class="btn-ghost"
                data-testid="checkout-back-step-3-btn"
                @click="currentStep = 2"
              >
                ← Back to Step 02
              </button>

              <button
                type="submit"
                class="btn-primary"
                style="flex: 1; min-height: 48px; font-size: 0.95rem;"
                :disabled="submitting"
                data-testid="submit-secure-payment-btn"
              >
                {{
                  submitting
                    ? 'Verifying Payment & Provisioning License ACL...'
                    : `Authorize $${activeTotalDue.toLocaleString()} USD & Provision Access Instantly →`
                }}
              </button>
            </div>
          </div>
        </form>

        <!-- RIGHT COLUMN: LIVE ORDER SUMMARY & AUTOMATED FULFILLMENT SPEC -->
        <div style="display: flex; flex-direction: column; gap: 20px;">
          <div class="bento-panel">
            <div class="meta-line">
              <span class="meta-accent">Live Order Summary</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Step {{ currentStep }} of 3 Active</span>
            </div>

            <div v-if="checkoutMode === 'single' && store.selectedIndicator">
              <h2
                style="
                  font-family: var(--font-display);
                  font-size: 1.35rem;
                  font-weight: 700;
                  margin-top: 6px;
                "
              >
                {{ store.selectedIndicator.name }}
              </h2>
              <p style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 4px;">
                {{ store.selectedIndicator.tagline }}
              </p>

              <div
                style="
                  margin-top: 16px;
                  padding: 12px;
                  background: rgba(5, 8, 16, 0.75);
                  border: 1px solid var(--border-hairline);
                  border-radius: var(--radius-inner);
                  font-size: 0.8125rem;
                  display: flex;
                  flex-direction: column;
                  gap: 6px;
                "
              >
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: var(--text-muted);">TradingView Script ID:</span>
                  <span class="mono">{{ store.selectedIndicator.tvScriptId }}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: var(--text-muted);">thinkorswim Study File:</span>
                  <span class="mono">{{ store.selectedIndicator.tosStudyFilename }}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: var(--text-muted);">thinkorswim Share Link:</span>
                  <span class="mono">{{ store.selectedIndicator.tosShareLink }}</span>
                </div>
              </div>
            </div>

            <div v-else>
              <h2
                style="
                  font-family: var(--font-display);
                  font-size: 1.25rem;
                  font-weight: 700;
                  margin-top: 6px;
                "
              >
                Multi-Item Cart ({{ store.cartTotals.itemCount }} Indicator License{{
                  store.cartTotals.itemCount === 1 ? '' : 's'
                }})
              </h2>
              <div
                v-if="store.detailedCartItems.length > 0"
                style="
                  margin-top: 12px;
                  display: flex;
                  flex-direction: column;
                  gap: 8px;
                  font-size: 0.82rem;
                "
              >
                <div
                  v-for="item in store.detailedCartItems"
                  :key="`${item.indicator.id}-${item.index}`"
                  style="display: flex; justify-content: space-between; color: var(--text-secondary);"
                >
                  <span>{{ item.indicator.name }} ({{ item.billingCycle }})</span>
                  <span class="mono" style="color: var(--text-primary);">
                    ${{ item.finalPrice.toLocaleString() }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Promo Code Application -->
            <div style="padding-top: 14px; border-top: 1px solid var(--border-hairline);">
              <label
                for="chk-coupon-input"
                class="form-label"
                style="display: block; margin-bottom: 6px;"
              >
                Institutional Promo / Desk Code
              </label>
              <div style="display: flex; gap: 8px;">
                <input
                  id="chk-coupon-input"
                  v-model="couponInput"
                  type="text"
                  class="form-input mono"
                  placeholder="PROP15, DESK20, TRINITY25"
                />
              </div>
              <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px;">
                <button
                  v-for="code in ['PROP15', 'DESK20', 'TRINITY25', 'FOUNDER50']"
                  :key="code"
                  type="button"
                  class="btn-ghost"
                  style="padding: 4px 10px; min-height: 28px; font-size: 0.75rem;"
                  @click="couponInput = code"
                >
                  Apply {{ code }}
                </button>
              </div>
            </div>

            <!-- Price Breakdown -->
            <div
              v-if="checkoutMode === 'single'"
              style="
                padding-top: 14px;
                border-top: 1px solid var(--border-hairline);
                display: flex;
                flex-direction: column;
                gap: 8px;
                font-size: 0.875rem;
              "
            >
              <div style="display: flex; justify-content: space-between; color: var(--text-secondary);">
                <span>{{ store.selectedBillingCycle }} Base License</span>
                <span class="mono">${{ singleOrderPricing.basePrice.toLocaleString() }} USD</span>
              </div>
              <div
                v-if="singleOrderPricing.discountAmount > 0"
                style="
                  display: flex;
                  justify-content: space-between;
                  color: var(--accent-emerald-bright);
                "
              >
                <span>Promo Discount ({{ singleOrderPricing.discountPct }}% Off)</span>
                <span class="mono">
                  -${{ singleOrderPricing.discountAmount.toLocaleString() }} USD
                </span>
              </div>
              <div style="display: flex; justify-content: space-between; color: var(--text-secondary);">
                <span>Valid Through</span>
                <span class="mono">{{ singleOrderPricing.expiresAt }}</span>
              </div>
              <div
                style="
                  display: flex;
                  justify-content: space-between;
                  align-items: baseline;
                  padding-top: 12px;
                  margin-top: 4px;
                  border-top: 1px solid var(--border-hairline);
                "
              >
                <strong style="font-size: 1rem;">Total Due Today</strong>
                <span
                  class="price-figure"
                  style="color: var(--accent-emerald-bright); font-size: 1.65rem;"
                >
                  ${{ singleOrderPricing.finalPrice.toLocaleString() }} USD
                </span>
              </div>
            </div>

            <div
              v-else
              style="
                padding-top: 14px;
                border-top: 1px solid var(--border-hairline);
                display: flex;
                flex-direction: column;
                gap: 8px;
                font-size: 0.875rem;
              "
            >
              <div style="display: flex; justify-content: space-between; color: var(--text-secondary);">
                <span>Cart Subtotal ({{ store.cartTotals.itemCount }} items)</span>
                <span class="mono">${{ store.cartTotals.subtotal.toLocaleString() }} USD</span>
              </div>
              <div
                v-if="store.cartTotals.discountTotal > 0"
                style="
                  display: flex;
                  justify-content: space-between;
                  color: var(--accent-emerald-bright);
                "
              >
                <span>Promo Discount</span>
                <span class="mono">
                  -${{ store.cartTotals.discountTotal.toLocaleString() }} USD
                </span>
              </div>
              <div
                style="
                  display: flex;
                  justify-content: space-between;
                  align-items: baseline;
                  padding-top: 12px;
                  margin-top: 4px;
                  border-top: 1px solid var(--border-hairline);
                "
              >
                <strong style="font-size: 1rem;">Total Due Today</strong>
                <span
                  class="price-figure"
                  style="color: var(--accent-emerald-bright); font-size: 1.65rem;"
                >
                  ${{ store.cartTotals.finalTotal.toLocaleString() }} USD
                </span>
              </div>
            </div>
          </div>

          <!-- Automated Fulfillment Guarantees -->
          <div class="bento-panel">
            <div class="meta-line">
              <span class="meta-accent">Automated Webhook Pipeline</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Zero Manual Waiting</span>
            </div>
            <h3 style="font-size: 1.1rem; font-weight: 700;">
              What Happens the Millisecond You Submit Step 03
            </h3>
            <ol
              style="
                padding-left: 18px;
                color: var(--text-secondary);
                font-size: 0.875rem;
                display: flex;
                flex-direction: column;
                gap: 8px;
              "
            >
              <li>
                <strong>Deterministic Key Generation:</strong> Issues a unique
                <code>SE-XXXX-XXXX-XXXX</code> cryptographic license key bound to your email.
              </li>
              <li>
                <strong>TradingView Invite-Only Whitelist:</strong> Dispatches a sub-second webhook
                to grant your <code>@tradingViewUsername</code> access to the Pine Script v6 study.
              </li>
              <li>
                <strong>Watermarked thinkorswim Artifact:</strong> Unlocks immediate
                <code>.ts</code> ThinkScript download and <code>tos.mx</code> workspace import in
                your Client Dashboard.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
