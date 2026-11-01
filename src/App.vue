<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useHead, useSeoMeta } from '@unhead/vue';
import { usePlatformStore } from './stores/platformStore';
import StorefrontView from './components/StorefrontView.vue';
import CheckoutView from './components/CheckoutView.vue';
import ClientDashboard from './components/ClientDashboard.vue';
import AdminFulfillmentView from './components/AdminFulfillmentView.vue';
import AuthModal from './components/AuthModal.vue';
import CartDrawer from './components/CartDrawer.vue';

const store = usePlatformStore();
const activeView = ref<'storefront' | 'checkout' | 'dashboard' | 'admin'>('storefront');

// Reactive Unhead SEO Metadata (@unhead/vue) matching exact StratEdge Algo brand table
const seoTitle = computed(() => {
  if (activeView.value === 'checkout') {
    return 'Secure License Checkout & Instant Provisioning — StratEdge Algo';
  }
  if (activeView.value === 'dashboard') {
    return 'Client Dashboard, Downloads & Support Keys — StratEdge Algo';
  }
  if (activeView.value === 'admin') {
    return 'Admin E-Commerce & Webhook Operations — StratEdge Algo';
  }
  return 'StratEdge Algo — Advanced Trading Indicators';
});

const seoDescription = computed(() => {
  if (activeView.value === 'checkout') {
    return 'Complete your StratEdge Algo indicator order with Zod-validated checkout and instant TradingView + Charles Schwab thinkorswim license provisioning.';
  }
  if (activeView.value === 'dashboard') {
    return 'Manage your StratEdge Algo memberships, active indicator subscriptions, TradingView Invite-Only handles, support keys, and Charles Schwab thinkorswim .ts study downloads.';
  }
  return 'StratEdge Algo — Precision Engineered. Evidence Driven. Premium Trading Technology featuring StratEdge Algo Gamma, Flow, and Structure for TradingView and thinkorswim.';
});

const canonicalUrl = computed(() => {
  if (activeView.value === 'checkout') return 'https://stratedgealgo.com/checkout';
  if (activeView.value === 'dashboard') return 'https://stratedgealgo.com/dashboard';
  if (activeView.value === 'admin') return 'https://stratedgealgo.com/admin';
  return 'https://stratedgealgo.com/';
});

useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  ogTitle: seoTitle,
  ogDescription: seoDescription,
  ogSiteName: 'StratEdge Algo',
  ogUrl: canonicalUrl,
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterTitle: seoTitle,
  twitterDescription: seoDescription,
});

useHead({
  link: [
    {
      rel: 'canonical',
      href: canonicalUrl,
    },
  ],
});

function setView(
  view: 'storefront' | 'checkout' | 'dashboard' | 'admin',
  hashAnchor?: string
) {
  activeView.value = view;
  if (view === 'storefront' && hashAnchor) {
    setTimeout(() => {
      const el = document.querySelector(hashAnchor);
      el?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

onMounted(() => {
  store.fetchAllData();
});
</script>

<template>
  <div>
    <!-- TOP BAR: Brand Wordmark + Core E-Commerce/Dashboard Links + Auth & Cart Actions -->
    <header class="topbar">
      <div class="topbar-inner">
        <!-- Zone 1: Brand Wordmark -->
        <a
          href="#top"
          class="brand-wordmark"
          @click.prevent="setView('storefront')"
        >
          StratEdge Algo
        </a>

        <!-- Zone 2: Primary Navigation -->
        <nav class="topbar-nav" aria-label="Primary Navigation">
          <a
            href="#indicator-catalog"
            class="topbar-link"
            :class="{ active: activeView === 'storefront' }"
            @click.prevent="setView('storefront', '#indicator-catalog')"
          >
            Indicators
          </a>
          <a
            href="#pricing-plans"
            class="topbar-link"
            @click.prevent="setView('storefront', '#pricing-plans')"
          >
            Memberships
          </a>
          <a
            href="#checkout"
            class="topbar-link"
            :class="{ active: activeView === 'checkout' }"
            data-testid="nav-checkout-view"
            @click.prevent="setView('checkout')"
          >
            Checkout
          </a>
          <a
            href="#customer-portal"
            class="topbar-link"
            :class="{ active: activeView === 'dashboard' }"
            data-testid="nav-customer-dashboard"
            @click.prevent="setView('dashboard')"
          >
            Client Dashboard ({{ store.customerLicenses.length }})
          </a>
          <a
            href="#admin-console"
            class="topbar-link"
            :class="{ active: activeView === 'admin' }"
            data-testid="nav-admin-dashboard"
            @click.prevent="setView('admin')"
          >
            Admin Dashboard
          </a>
        </nav>

        <!-- Zone 3: Sign In / Account + Shopping Cart Drawer Trigger -->
        <div class="topbar-actions" style="gap: 10px;">
          <button
            type="button"
            class="btn-ghost"
            data-testid="open-auth-modal-btn"
            @click="store.openAuthModal('login')"
          >
            {{
              store.isAuthenticated
                ? `Account: ${store.activeCustomerName.split(' ')[0]}`
                : 'Sign In / Sign Up'
            }}
          </button>

          <button
            type="button"
            class="btn-primary"
            data-testid="open-cart-drawer-btn"
            @click="store.isCartDrawerOpen = true"
          >
            Cart ({{ store.cartTotals.itemCount }}) · ${{
              store.cartTotals.finalTotal.toLocaleString()
            }}
          </button>
        </div>
      </div>
    </header>

    <!-- Customizable Enterprise Announcement & Promo Bar -->
    <div
      v-if="store.platformSettings.announcementEnabled"
      data-testid="enterprise-announcement-bar"
      style="
        background: linear-gradient(90deg, rgba(16, 185, 129, 0.14), rgba(56, 189, 248, 0.12));
        border-bottom: 1px solid rgba(16, 185, 129, 0.28);
        padding: 8px 24px;
      "
    >
      <div
        class="container"
        style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          font-size: 0.8125rem;
        "
      >
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <span
            class="mono"
            style="
              color: var(--accent-emerald-bright);
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.08em;
            "
          >
            LIVE DESK NOTICE
          </span>
          <span style="color: var(--text-primary);">
            {{ store.platformSettings.announcementBannerText }}
          </span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span class="mono" style="color: var(--accent-amber);">
            Code: <strong>{{ store.platformSettings.announcementPromoCode }}</strong> ({{
              store.platformSettings.announcementDiscountPct
            }}% Off)
          </span>
          <button
            type="button"
            class="btn-ghost"
            style="padding: 4px 10px; min-height: 26px; font-size: 0.75rem;"
            @click="
              store.cartCouponCode = store.platformSettings.announcementPromoCode;
              setView('checkout');
            "
          >
            Apply Code &amp; Checkout →
          </button>
        </div>
      </div>
    </div>

    <!-- Live Fulfillment Notification Banner -->
    <div
      v-if="store.notificationBanner"
      class="notification-bar"
      role="status"
      aria-live="polite"
    >
      <div class="notification-inner">
        <div>
          <strong style="color: var(--accent-emerald-bright); margin-right: 10px;">
            {{ store.notificationBanner.title }}
          </strong>
          <span style="font-size: 0.875rem; color: var(--text-secondary);">
            {{ store.notificationBanner.detail }}
          </span>
        </div>
        <button
          type="button"
          class="btn-ghost"
          @click="store.notificationBanner = null"
        >
          Dismiss
        </button>
      </div>
    </div>

    <!-- Main Application View -->
    <main>
      <StorefrontView
        v-if="activeView === 'storefront'"
        @navigate="setView"
      />
      <CheckoutView
        v-else-if="activeView === 'checkout'"
        @navigate="setView"
      />
      <ClientDashboard
        v-else-if="activeView === 'dashboard'"
        @navigate="setView"
      />
      <AdminFulfillmentView
        v-else
        @navigate="setView"
      />
    </main>

    <!-- Global Login / Sign Up Modal -->
    <AuthModal @navigate="setView" />

    <!-- Global Slide-Over Shopping Cart & Multi-Item Checkout Drawer -->
    <CartDrawer @navigate="setView" />

    <!-- Quiet Institutional Footer -->
    <footer class="site-footer">
      <div class="container footer-inner">
        <div>
          <strong style="color: var(--text-primary); font-family: var(--font-display);">
            StratEdge Algo
          </strong>
          <span style="margin-left: 10px; color: var(--accent-emerald-bright); font-weight: 600;">
            Precision Engineered. Evidence Driven.
          </span>
          <span style="margin-left: 10px;">
            Premium Trading Technology · stratedgealgo.com
          </span>
        </div>

        <div class="meta-line">
          <button
            type="button"
            class="btn-ghost"
            style="padding: 4px 10px; min-height: 28px;"
            @click="store.openAuthModal('login')"
          >
            Member Login / Register
          </button>
          <span class="meta-sep" aria-hidden="true">·</span>
          <button
            type="button"
            class="btn-ghost"
            style="padding: 4px 10px; min-height: 28px;"
            @click="setView('checkout')"
          >
            Secure Checkout
          </button>
          <span class="meta-sep" aria-hidden="true">·</span>
          <button
            type="button"
            class="btn-ghost"
            style="padding: 4px 10px; min-height: 28px;"
            @click="setView('dashboard')"
          >
            Customer Dashboard
          </button>
          <span class="meta-sep" aria-hidden="true">·</span>
          <button
            type="button"
            class="btn-ghost"
            style="padding: 4px 10px; min-height: 28px;"
            @click="setView('admin')"
          >
            Admin Ops
          </button>
          <span class="meta-sep" aria-hidden="true">·</span>
          <a href="/sitemap.xml" target="_blank" style="color: var(--text-muted);">
            XML Sitemap
          </a>
        </div>
      </div>
    </footer>
  </div>
</template>
