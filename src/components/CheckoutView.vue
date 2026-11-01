<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useForm } from '@tanstack/vue-form';
import {
  usePlatformStore,
  type LicenseRecord,
} from '../stores/platformStore';
import {
  SecureCheckoutPaymentSchema,
  calculateOrderPricing,
} from '../utils/fulfillment';

const emit = defineEmits<{
  (e: 'navigate', view: 'storefront' | 'checkout' | 'dashboard' | 'admin'): void;
}>();

const store = usePlatformStore();

// Checkout Mode: 'single' (selected indicator/suite) or 'cart' (all items in cart)
const checkoutMode = ref<'single' | 'cart'>('single');

const couponInput = ref('PROP15');
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
  licenses: LicenseRecord[];
  timestamp: string;
} | null>(null);

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
    bannerError.value = '';
    Object.keys(fieldErrors).forEach((k) => delete fieldErrors[k]);

    const payloadToValidate = {
      customerName: value.customerName,
      customerEmail: value.customerEmail,
      tradingViewUsername: value.tradingViewUsername,
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
        store.isAuthenticated = true;
        store.clearCart();
        await store.fetchAllData();

        completedReceipt.value = {
          orderId: `ORD-${Date.now().toString().slice(-6)}`,
          totalPaid: data.totalPaid,
          paymentMethod: parsed.data.paymentMethod,
          licenses: data.licenses,
          timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
        };

        store.showNotification(
          'success',
          `Transaction Approved · ${data.licenses.length} License(s) Provisioned`,
          `Whitelisted @${parsed.data.tradingViewUsername} on TradingView & unlocked thinkorswim .ts downloads.`
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
        store.isAuthenticated = true;
        store.lastProvisionedLicense = data.license;
        await store.fetchAllData();

        completedReceipt.value = {
          orderId: `ORD-${Date.now().toString().slice(-6)}`,
          totalPaid: data.pricing.finalPrice,
          paymentMethod: parsed.data.paymentMethod,
          licenses: [data.license],
          timestamp: data.license.provisionedAt,
        };
        window.scrollTo({ top: 0, behavior: 'smooth' });

        store.showNotification(
          'success',
          `License ${data.license.licenseKey} Provisioned Immediately`,
          `Whitelisted @${data.license.tradingViewUsername} on TradingView & unlocked ${data.license.tosStudyFilename}.`
        );
      }
    } catch (err) {
      bannerError.value =
        err instanceof Error ? err.message : 'Network error during payment settlement';
    } finally {
      submitting.value = false;
    }
  },
});

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
            <span class="meta-accent">256-Bit Encrypted Checkout &amp; Webhook Provisioning</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span>Zod Schema Validated</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span>Sub-Second TradingView + thinkorswim Delivery</span>
          </div>
          <h1 class="section-title" style="margin-top: 6px;">
            Secure License Checkout &amp; Automated Fulfillment
          </h1>
          <p class="section-subtitle">
            Complete your institutional order below. Upon payment verification, our webhook engine
            immediately whitelists your TradingView username and unlocks your Charles Schwab thinkorswim `.ts` study.
          </p>
        </div>

        <!-- Mode Selector: Single Model vs Multi-Item Shopping Cart -->
        <div class="segmented-group" role="group" aria-label="Checkout Mode">
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: checkoutMode === 'single' }"
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
              <span class="mono">{{ completedReceipt.timestamp }}</span>
            </div>
            <h2 style="font-family: var(--font-display); font-size: 1.5rem; font-weight: 700; margin-top: 6px;">
              Your StratEdge Algo License(s) Are Active!
            </h2>
            <p style="color: var(--text-secondary); font-size: 0.9375rem; margin-top: 4px;">
              TradingView Invite-Only permissions and Charles Schwab thinkorswim `.ts` studies have been
              bound to your account.
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
              @click="completedReceipt = null"
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
           Left: Zod-Validated Payment & Provisioning Form
           Right: Order Summary, Promo Codes & Webhook Pipeline Spec
           =================================================================== -->
      <div class="checkout-grid">
        <!-- LEFT COLUMN: SECURE PAYMENT FORM -->
        <form
          class="form-panel"
          novalidate
          data-testid="secure-checkout-form"
          @submit.prevent.stop="paymentForm.handleSubmit()"
        >
          <!-- STEP 1: PRODUCT / TIER SELECTION -->
          <div style="padding-bottom: 20px; margin-bottom: 20px; border-bottom: 1px solid var(--border-hairline);">
            <div class="meta-line" style="margin-bottom: 10px;">
              <span class="meta-accent">Step 01</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Select Quantitative Model &amp; Membership Cadence</span>
            </div>

            <div v-if="checkoutMode === 'single'" class="form-row-2">
              <div class="form-field" style="margin-bottom: 0;">
                <label for="chk-indicator-select" class="form-label">
                  Indicator / Suite
                </label>
                <select
                  id="chk-indicator-select"
                  v-model="store.selectedIndicatorId"
                  class="form-select"
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

              <div class="form-field" style="margin-bottom: 0;">
                <label class="form-label">Membership Billing Tier</label>
                <div class="segmented-group" style="width: 100%; display: grid; grid-template-columns: repeat(3, 1fr);">
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

            <div v-else>
              <p style="font-size: 0.875rem; color: var(--text-secondary);">
                Checking out <strong>{{ store.cartTotals.itemCount }} item(s)</strong> from your Shopping Cart.
              </p>
            </div>
          </div>

          <!-- STEP 2: TRADER IDENTITY & AUTOMATED PLATFORM TARGETS -->
          <div style="padding-bottom: 20px; margin-bottom: 20px; border-bottom: 1px solid var(--border-hairline);">
            <div class="meta-line" style="margin-bottom: 12px;">
              <span class="meta-accent">Step 02</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Customer Identity &amp; Platform Provisioning Handles</span>
            </div>

            <div class="form-row-2">
              <paymentForm.Field name="customerName">
                <template #default="{ field }">
                  <div class="form-field">
                    <label :for="`chk-${field.name}`" class="form-label">
                      Full Name / Desk Name *
                    </label>
                    <input
                      :id="`chk-${field.name}`"
                      :value="field.state.value"
                      type="text"
                      class="form-input"
                      placeholder="Marcus Vance"
                      @input="(e) => field.handleChange((e.target as HTMLInputElement).value)"
                    />
                    <span v-if="fieldErrors.customerName" class="form-error" role="alert">
                      {{ fieldErrors.customerName }}
                    </span>
                  </div>
                </template>
              </paymentForm.Field>

              <paymentForm.Field name="customerEmail">
                <template #default="{ field }">
                  <div class="form-field">
                    <label :for="`chk-${field.name}`" class="form-label">
                      Customer Email (Vault &amp; Receipt) *
                    </label>
                    <input
                      :id="`chk-${field.name}`"
                      :value="field.state.value"
                      type="email"
                      class="form-input"
                      placeholder="marcus.vance@apexquant.io"
                      @input="(e) => field.handleChange((e.target as HTMLInputElement).value)"
                    />
                    <span v-if="fieldErrors.customerEmail" class="form-error" role="alert">
                      {{ fieldErrors.customerEmail }}
                    </span>
                  </div>
                </template>
              </paymentForm.Field>
            </div>

            <div class="form-row-2">
              <paymentForm.Field name="tradingViewUsername">
                <template #default="{ field }">
                  <div class="form-field" style="margin-bottom: 0;">
                    <label :for="`chk-${field.name}`" class="form-label">
                      TradingView Username (Invite-Only ACL) *
                    </label>
                    <input
                      :id="`chk-${field.name}`"
                      :value="field.state.value"
                      type="text"
                      class="form-input mono"
                      placeholder="MarcusVance_ES"
                      @input="(e) => field.handleChange((e.target as HTMLInputElement).value)"
                    />
                    <span class="form-hint">
                      Exact handle whitelisted on Pine Script v6 server
                    </span>
                    <span v-if="fieldErrors.tradingViewUsername" class="form-error" role="alert">
                      {{ fieldErrors.tradingViewUsername }}
                    </span>
                  </div>
                </template>
              </paymentForm.Field>

              <paymentForm.Field name="thinkorswimAccountId">
                <template #default="{ field }">
                  <div class="form-field" style="margin-bottom: 0;">
                    <label :for="`chk-${field.name}`" class="form-label">
                      Charles Schwab thinkorswim ID
                    </label>
                    <input
                      :id="`chk-${field.name}`"
                      :value="field.state.value"
                      type="text"
                      class="form-input mono"
                      placeholder="TOS-994182"
                      @input="(e) => field.handleChange((e.target as HTMLInputElement).value)"
                    />
                    <span class="form-hint">
                      Embedded in your watermarked .ts study download
                    </span>
                  </div>
                </template>
              </paymentForm.Field>
            </div>
          </div>

          <!-- STEP 3: ENCRYPTED PAYMENT & SETTLEMENT DETAILS -->
          <div>
            <div class="meta-line" style="margin-bottom: 12px;">
              <span class="meta-accent">Step 03</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Encrypted Payment &amp; Settlement Method</span>
            </div>

            <div class="form-field">
              <label class="form-label">Select Payment Rail</label>
              <div class="segmented-group" style="width: 100%; display: grid; grid-template-columns: repeat(3, 1fr);">
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
              Your indicator license and TradingView ACL will be provisioned immediately upon submitting
              this settlement order.
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
                      I authorize immediate digital license provisioning and agree to the single-seat
                      TradingView &amp; thinkorswim license terms.
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

            <button
              type="submit"
              class="btn-primary"
              style="width: 100%; min-height: 48px; font-size: 0.95rem;"
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
        </form>

        <!-- RIGHT COLUMN: LIVE ORDER SUMMARY & AUTOMATED FULFILLMENT SPEC -->
        <div style="display: flex; flex-direction: column; gap: 20px;">
          <div class="bento-panel">
            <div class="meta-line">
              <span class="meta-accent">Live Order Summary</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Instant Delivery Included</span>
            </div>

            <div v-if="checkoutMode === 'single' && store.selectedIndicator">
              <h2 style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 700; margin-top: 6px;">
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

            <!-- Promo Code Application -->
            <div style="padding-top: 14px; border-top: 1px solid var(--border-hairline);">
              <label for="chk-coupon-input" class="form-label" style="display: block; margin-bottom: 6px;">
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
                style="display: flex; justify-content: space-between; color: var(--accent-emerald-bright);"
              >
                <span>Promo Discount ({{ singleOrderPricing.discountPct }}% Off)</span>
                <span class="mono">-${{ singleOrderPricing.discountAmount.toLocaleString() }} USD</span>
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
                <span class="price-figure" style="color: var(--accent-emerald-bright); font-size: 1.65rem;">
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
                style="display: flex; justify-content: space-between; color: var(--accent-emerald-bright);"
              >
                <span>Promo Discount</span>
                <span class="mono">-${{ store.cartTotals.discountTotal.toLocaleString() }} USD</span>
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
                <span class="price-figure" style="color: var(--accent-emerald-bright); font-size: 1.65rem;">
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
              What Happens the Millisecond You Submit
            </h3>
            <ol style="padding-left: 18px; color: var(--text-secondary); font-size: 0.875rem; display: flex; flex-direction: column; gap: 8px;">
              <li>
                <strong>Deterministic Key Generation:</strong> Issues a unique `SE-XXXX-XXXX-XXXX` cryptographic license key bound to your email.
              </li>
              <li>
                <strong>TradingView Invite-Only Whitelist:</strong> Dispatches a sub-second webhook to grant your `@tradingViewUsername` access to the Pine Script v6 study.
              </li>
              <li>
                <strong>Watermarked thinkorswim Artifact:</strong> Unlocks immediate `.ts` ThinkScript download and `tos.mx` workspace import in your Customer Dashboard.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
