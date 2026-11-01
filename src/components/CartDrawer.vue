<script setup lang="ts">
import { ref, watch } from 'vue';
import { usePlatformStore } from '../stores/platformStore';

const emit = defineEmits<{
  (e: 'navigate', view: 'storefront' | 'dashboard' | 'admin'): void;
}>();

const store = usePlatformStore();

const customerName = ref(store.activeCustomerName);
const customerEmail = ref(store.activeCustomerEmail);
const tradingViewUsername = ref(store.activeTradingViewHandle);
const thinkorswimAccountId = ref(store.activeTosAccountId);
const paymentMethod = ref<'Card' | 'Wire' | 'USDC'>('Card');
const checkoutError = ref('');
const isSubmitting = ref(false);

watch(
  () => [
    store.activeCustomerName,
    store.activeCustomerEmail,
    store.activeTradingViewHandle,
    store.activeTosAccountId,
  ],
  ([name, email, tv, tos]) => {
    customerName.value = name;
    customerEmail.value = email;
    tradingViewUsername.value = tv;
    thinkorswimAccountId.value = tos;
  }
);

async function submitCartCheckout() {
  checkoutError.value = '';
  if (store.cartItems.length === 0) {
    checkoutError.value = 'Add at least one indicator or membership bundle to your cart.';
    return;
  }

  isSubmitting.value = true;
  try {
    const res = await fetch('/api/cart/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: customerName.value,
        customerEmail: customerEmail.value,
        tradingViewUsername: tradingViewUsername.value,
        thinkorswimAccountId: thinkorswimAccountId.value,
        couponCode: store.cartCouponCode,
        paymentMethod: paymentMethod.value,
        items: store.cartItems,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      checkoutError.value = data.error || 'Cart checkout failed';
      return;
    }

    store.activeCustomerEmail = customerEmail.value.trim().toLowerCase();
    store.activeCustomerName = customerName.value.trim();
    store.activeTradingViewHandle = tradingViewUsername.value.trim();
    store.isAuthenticated = true;
    store.clearCart();
    store.isCartDrawerOpen = false;

    await store.fetchAllData();
    store.showNotification(
      'success',
      `Order Fulfilled (${data.licenses.length} Indicator License${data.licenses.length > 1 ? 's' : ''} Provisioned)`,
      `Whitelisted @${store.activeTradingViewHandle} on TradingView & unlocked thinkorswim .ts downloads in your Customer Dashboard.`
    );

    emit('navigate', 'dashboard');
  } catch (err) {
    checkoutError.value =
      err instanceof Error ? err.message : 'Network error during cart checkout';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div
    v-if="store.isCartDrawerOpen"
    class="modal-backdrop"
    style="justify-content: flex-end; padding: 0;"
    role="dialog"
    aria-modal="true"
    aria-labelledby="cart-drawer-title"
    data-testid="cart-drawer"
    @click.self="store.isCartDrawerOpen = false"
  >
    <div
      style="
        width: 100%;
        max-width: 540px;
        height: 100vh;
        overflow-y: auto;
        background: var(--bg-surface);
        border-left: 1px solid var(--border-hairline);
        padding: 28px 24px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 24px;
      "
    >
      <div>
        <!-- Drawer Header -->
        <div
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--border-hairline);
          "
        >
          <div>
            <div class="meta-line">
              <span class="meta-accent">Automated E-Commerce Fulfillment Cart</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>{{ store.cartTotals.itemCount }} Item(s)</span>
            </div>
            <h2
              id="cart-drawer-title"
              style="
                font-family: var(--font-display);
                font-size: 1.4rem;
                font-weight: 700;
                margin-top: 4px;
              "
            >
              Your Indicator &amp; Membership Cart
            </h2>
          </div>

          <button
            type="button"
            class="btn-ghost"
            aria-label="Close shopping cart"
            @click="store.isCartDrawerOpen = false"
          >
            Close ✕
          </button>
        </div>

        <!-- Cart Item List -->
        <div
          v-if="store.detailedCartItems.length > 0"
          style="margin-top: 18px; display: flex; flex-direction: column; gap: 14px;"
        >
          <div
            v-for="item in store.detailedCartItems"
            :key="`${item.indicator.id}-${item.index}`"
            style="
              padding: 16px;
              background: var(--bg-elevated);
              border: 1px solid var(--border-hairline);
              border-radius: var(--radius-inner);
            "
            data-testid="cart-line-item"
          >
            <div
              style="
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                gap: 12px;
              "
            >
              <div>
                <div class="meta-line" style="font-size: 0.75rem;">
                  <span class="meta-accent">{{ item.indicator.category }}</span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span class="mono">{{ item.indicator.version }}</span>
                </div>
                <strong style="font-size: 1rem; display: block; margin-top: 2px;">
                  {{ item.indicator.name }}
                </strong>
              </div>

              <button
                type="button"
                class="btn-ghost"
                style="padding: 4px 10px; min-height: 28px; font-size: 0.75rem;"
                @click="store.removeFromCart(item.index)"
              >
                Remove
              </button>
            </div>

            <!-- Billing Cadence Selector & Line Price -->
            <div
              style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                margin-top: 12px;
                padding-top: 12px;
                border-top: 1px solid var(--border-hairline);
                flex-wrap: wrap;
              "
            >
              <div class="segmented-group" style="padding: 2px;">
                <button
                  v-for="cad in (['Monthly', 'Annual', 'Lifetime'] as const)"
                  :key="cad"
                  type="button"
                  class="segmented-btn"
                  style="padding: 4px 10px; min-height: 28px; font-size: 0.75rem;"
                  :class="{ active: item.billingCycle === cad }"
                  @click="store.updateCartItemCycle(item.index, cad)"
                >
                  {{ cad }}
                </button>
              </div>

              <div style="text-align: right;">
                <span
                  v-if="item.discountAmount > 0"
                  class="mono"
                  style="
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    text-decoration: line-through;
                    margin-right: 6px;
                  "
                >
                  ${{ item.basePrice.toLocaleString() }}
                </span>
                <span class="mono" style="font-size: 1.1rem; font-weight: 700; color: var(--accent-emerald-bright);">
                  ${{ item.finalPrice.toLocaleString() }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty Cart State with Quick Add -->
        <div
          v-else
          style="
            margin-top: 20px;
            padding: 28px 18px;
            background: var(--bg-elevated);
            border: 1px solid var(--border-hairline);
            border-radius: var(--radius-inner);
            text-align: center;
          "
        >
          <p style="font-weight: 600; color: var(--text-primary);">
            Your Shopping Cart is Empty
          </p>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 6px;">
            Quick-add one of our flagship institutional indicators below:
          </p>
          <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 14px;">
            <button
              type="button"
              class="btn-secondary"
              @click="store.addToCart('se-algo-gamma', 'Annual', true)"
            >
              + Algo Gamma
            </button>
            <button
              type="button"
              class="btn-secondary"
              @click="store.addToCart('se-algo-flow', 'Annual', true)"
            >
              + Algo Flow
            </button>
            <button
              type="button"
              class="btn-primary"
              @click="store.addToCart('se-institutional-bundle', 'Annual', true)"
            >
              + Trinity Bundle
            </button>
          </div>
        </div>

        <!-- Promo Code + Order Summary Box -->
        <div
          v-if="store.detailedCartItems.length > 0"
          style="
            margin-top: 18px;
            padding: 16px;
            background: rgba(5, 8, 16, 0.75);
            border: 1px solid var(--border-hairline);
            border-radius: var(--radius-inner);
          "
        >
          <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 12px;">
            <input
              v-model="store.cartCouponCode"
              type="text"
              class="form-input mono"
              placeholder="Promo Code (PROP15, ALPHA20, TRINITY25)"
              aria-label="Cart coupon code"
            />
            <button
              type="button"
              class="btn-ghost"
              @click="store.cartCouponCode = 'TRINITY25'"
            >
              Apply 25% Off
            </button>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--text-secondary);">
            <span>Cart Subtotal</span>
            <span class="mono">${{ store.cartTotals.subtotal.toLocaleString() }}</span>
          </div>
          <div
            v-if="store.cartTotals.discountTotal > 0"
            style="display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--accent-emerald-bright); margin-top: 4px;"
          >
            <span>Institutional Promo Discount ({{ store.cartCouponCode.toUpperCase() }})</span>
            <span class="mono">-${{ store.cartTotals.discountTotal.toLocaleString() }}</span>
          </div>
          <div
            style="
              display: flex;
              justify-content: space-between;
              align-items: baseline;
              margin-top: 10px;
              padding-top: 10px;
              border-top: 1px solid var(--border-hairline);
            "
          >
            <span style="font-weight: 700;">Total Due Today</span>
            <span class="price-figure" style="color: var(--accent-emerald-bright);">
              ${{ store.cartTotals.finalTotal.toLocaleString() }} USD
            </span>
          </div>
        </div>

        <!-- Instant Cart Fulfillment Form -->
        <form
          v-if="store.detailedCartItems.length > 0"
          style="margin-top: 18px;"
          novalidate
          @submit.prevent="submitCartCheckout"
        >
          <div class="meta-line" style="margin-bottom: 10px;">
            <span class="meta-accent">Instant Delivery Target</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span>TradingView ACL + thinkorswim .ts</span>
          </div>

          <div class="form-row-2">
            <div class="form-field">
              <label for="cart-name" class="form-label">Full Name</label>
              <input
                id="cart-name"
                v-model="customerName"
                type="text"
                class="form-input"
                required
              />
            </div>
            <div class="form-field">
              <label for="cart-email" class="form-label">Customer Email</label>
              <input
                id="cart-email"
                v-model="customerEmail"
                type="email"
                class="form-input"
                required
              />
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-field">
              <label for="cart-tv" class="form-label">TradingView Handle</label>
              <input
                id="cart-tv"
                v-model="tradingViewUsername"
                type="text"
                class="form-input mono"
                required
              />
            </div>
            <div class="form-field">
              <label for="cart-tos" class="form-label">thinkorswim Account ID</label>
              <input
                id="cart-tos"
                v-model="thinkorswimAccountId"
                type="text"
                class="form-input mono"
              />
            </div>
          </div>

          <div class="form-field">
            <label class="form-label">Settlement Rail</label>
            <div class="segmented-group" style="width: 100%; display: grid; grid-template-columns: repeat(3, 1fr);">
              <button
                v-for="rail in (['Card', 'Wire', 'USDC'] as const)"
                :key="rail"
                type="button"
                class="segmented-btn"
                :class="{ active: paymentMethod === rail }"
                @click="paymentMethod = rail"
              >
                {{ rail === 'Card' ? 'Credit / Debit' : rail === 'Wire' ? 'Desk Wire' : 'USDC Instant' }}
              </button>
            </div>
          </div>

          <div
            v-if="checkoutError"
            class="form-error"
            style="margin-bottom: 10px;"
            role="alert"
          >
            {{ checkoutError }}
          </div>

          <button
            type="submit"
            class="btn-primary"
            style="width: 100%;"
            :disabled="isSubmitting"
          >
            {{
              isSubmitting
                ? 'Provisioning Licenses...'
                : `Complete Order ($${store.cartTotals.finalTotal.toLocaleString()}) & Provision Now →`
            }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
