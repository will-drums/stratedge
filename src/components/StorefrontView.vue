<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
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
import { gsap, ScrollTrigger } from '../plugins/gsap';
import { usePlatformStore, type IndicatorItem } from '../stores/platformStore';
import {
  CheckoutFormSchema,
  calculateOrderPricing,
} from '../utils/fulfillment';
import Quant3DSurface from './Quant3DSurface.vue';
import TestimonialsSection from './TestimonialsSection.vue';
import FAQSection from './FAQSection.vue';

const emit = defineEmits<{
  (e: 'navigate', view: 'storefront' | 'checkout' | 'dashboard' | 'admin'): void;
}>();

const store = usePlatformStore();

// 3D Quantitative Surface Active State
const active3DModel = ref<'Gamma' | 'Flow' | 'Structure'>('Gamma');
const active3DInstrument = ref<'SPX 0DTE' | 'ES1! Futures' | 'NQ1! Futures'>('SPX 0DTE');

// GSAP Animated Quantitative KPI Counters (Initialized to real targets for zero-latency DOM availability)
const kpiTargets = reactive({
  winRate: 76.4,
  webhookLatency: 0.85,
  profitFactor: 3.74,
  activeTraders: 5420,
});

const storefrontRootRef = ref<HTMLElement | null>(null);
const heroHeadlineRef = ref<HTMLElement | null>(null);
let gsapCtx: gsap.Context | null = null;

function initScrollTriggeredCards() {
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;
  if (prefersReducedMotion || !storefrontRootRef.value) return;

  gsapCtx?.revert();
  gsapCtx = gsap.context(() => {
    const pillarCards = gsap.utils.toArray<HTMLElement>('.trinity-pillar-card');
    if (pillarCards.length > 0) {
      gsap.fromTo(
        pillarCards,
        { y: 26, opacity: 0.12, scale: 0.985 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.65,
          stagger: 0.12,
          ease: 'power3.out',
          clearProps: 'transform,opacity,scale',
          scrollTrigger: {
            trigger: '.trinity-spotlight-grid',
            start: 'top 90%',
            toggleActions: 'play none none none',
            once: true,
          },
        }
      );
    }

    const catalogCards = gsap.utils.toArray<HTMLElement>('.indicator-card');
    if (catalogCards.length > 0) {
      gsap.fromTo(
        catalogCards,
        { y: 28, opacity: 0.12, scale: 0.985 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.62,
          stagger: 0.08,
          ease: 'power3.out',
          clearProps: 'transform,opacity,scale',
          scrollTrigger: {
            trigger: '.catalog-grid',
            start: 'top 90%',
            toggleActions: 'play none none none',
            once: true,
          },
        }
      );
    }
  }, storefrontRootRef.value);

  ScrollTrigger.refresh();
}

onMounted(() => {
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  if (!prefersReducedMotion) {
    gsap.fromTo(
      kpiTargets,
      {
        winRate: 64.0,
        webhookLatency: 2.4,
        profitFactor: 2.1,
        activeTraders: 4100,
      },
      {
        winRate: 76.4,
        webhookLatency: 0.85,
        profitFactor: 3.74,
        activeTraders: 5420,
        duration: 1.1,
        ease: 'power3.out',
      }
    );

    if (heroHeadlineRef.value) {
      gsap.fromTo(
        heroHeadlineRef.value,
        { y: 10, opacity: 0.85 },
        { y: 0, opacity: 1, duration: 0.45, ease: 'power2.out' }
      );
    }

    nextTick(() => {
      initScrollTriggeredCards();
    });
  }
});

onUnmounted(() => {
  gsapCtx?.revert();
});

// Catalog Category & Platform Filters
const activeCategoryFilter = ref<string>('All');
const billingCadencePreview = ref<'Monthly' | 'Annual' | 'Lifetime'>('Annual');
const inspectedIndicator = ref<IndicatorItem | null>(null);

const filteredCatalog = computed(() => {
  if (activeCategoryFilter.value === 'All') {
    return store.indicators;
  }
  return store.indicators.filter((ind) =>
    ind.category.toLowerCase().includes(activeCategoryFilter.value.toLowerCase())
  );
});

watch(
  () => [filteredCatalog.value.length, activeCategoryFilter.value],
  async () => {
    await nextTick();
    initScrollTriggeredCards();
  }
);

function formatPriceByCadence(ind: IndicatorItem) {
  if (billingCadencePreview.value === 'Monthly') {
    return { amount: `$${ind.priceMonthly}`, suffix: '/ month' };
  }
  if (billingCadencePreview.value === 'Lifetime') {
    return { amount: `$${ind.priceLifetime.toLocaleString()}`, suffix: 'one-time' };
  }
  return { amount: `$${ind.priceAnnual.toLocaleString()}`, suffix: '/ year' };
}

// TanStack Table (@tanstack/vue-table) for Quantitative Backtest Matrix
const tableSearchQuery = ref('');
const sorting = ref<SortingState>([{ id: 'profitFactor', desc: true }]);

const columnHelper = createColumnHelper<IndicatorItem>();

const columns = [
  columnHelper.accessor('name', {
    header: 'StratEdge Algo Model',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('category', {
    header: 'Quantitative Pillar',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('winRatePct', {
    header: 'Verified Win Rate',
    cell: (info) => `${info.getValue().toFixed(1)}%`,
  }),
  columnHelper.accessor('profitFactor', {
    header: 'Profit Factor',
    cell: (info) => `${info.getValue().toFixed(2)}x`,
  }),
  columnHelper.accessor('sharpeRatio', {
    header: 'Sharpe Ratio',
    cell: (info) => info.getValue().toFixed(2),
  }),
  columnHelper.accessor('maxDrawdownPct', {
    header: 'Max Drawdown',
    cell: (info) => `-${info.getValue().toFixed(1)}%`,
  }),
  columnHelper.accessor('timeframes', {
    header: 'Supported Timeframes',
    cell: (info) => info.getValue(),
  }),
];

const table = useVueTable({
  get data() {
    return store.indicators;
  },
  columns,
  state: {
    get sorting() {
      return sorting.value;
    },
    get globalFilter() {
      return tableSearchQuery.value;
    },
  },
  onSortingChange: (updaterOrValue) => {
    sorting.value =
      typeof updaterOrValue === 'function'
        ? updaterOrValue(sorting.value)
        : updaterOrValue;
  },
  onGlobalFilterChange: (updaterOrValue) => {
    tableSearchQuery.value =
      typeof updaterOrValue === 'function'
        ? updaterOrValue(tableSearchQuery.value)
        : updaterOrValue;
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
});

// TanStack Form (@tanstack/vue-form) + Zod for Instant Automated Checkout & Provisioning
const checkoutSectionRef = ref<HTMLElement | null>(null);
const checkoutErrorBanner = ref('');
const checkoutSubmitting = ref(false);
const couponInput = ref('INSTITUTIONAL15');

const checkoutForm = useForm({
  defaultValues: {
    customerName: 'Marcus Vance',
    customerEmail: 'marcus.vance@apexquant.io',
    tradingViewUsername: 'MarcusVance_ES',
    thinkorswimAccountId: 'TOS-994182',
  },
  onSubmit: async ({ value }) => {
    checkoutErrorBanner.value = '';
    const fullPayload = {
      ...value,
      indicatorId: store.selectedIndicatorId,
      billingCycle: store.selectedBillingCycle,
      couponCode: couponInput.value,
    };

    const validation = CheckoutFormSchema.safeParse(fullPayload);
    if (!validation.success) {
      checkoutErrorBanner.value =
        validation.error.issues[0]?.message || 'Please check your order fields.';
      return;
    }

    checkoutSubmitting.value = true;
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validation.data),
      });

      const data = await response.json();
      if (!response.ok) {
        checkoutErrorBanner.value =
          data.issues?.[0]?.message || data.error || 'Checkout failed';
        return;
      }

      store.activeCustomerEmail = validation.data.customerEmail.toLowerCase();
      store.activeCustomerName = validation.data.customerName;
      store.activeTradingViewHandle = validation.data.tradingViewUsername;
      store.lastProvisionedLicense = data.license;

      await store.fetchAllData();

      store.showNotification(
        'success',
        `License ${data.license.licenseKey} Provisioned Immediately`,
        `Whitelisted @${data.license.tradingViewUsername} on TradingView & unlocked ${data.license.tosStudyFilename} in your Customer Portal.`
      );

      emit('navigate', 'dashboard');
    } catch (err) {
      checkoutErrorBanner.value =
        err instanceof Error ? err.message : 'Network error during fulfillment';
    } finally {
      checkoutSubmitting.value = false;
    }
  },
});

const liveOrderPricing = computed(() => {
  const ind = store.selectedIndicator;
  if (!ind) {
    return {
      basePrice: 1990,
      discountPct: 15,
      discountAmount: 298.5,
      finalPrice: 1691.5,
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

function selectIndicatorForCheckout(
  indicatorId: string,
  cadence?: 'Monthly' | 'Annual' | 'Lifetime'
) {
  store.selectedIndicatorId = indicatorId;
  if (cadence) {
    store.selectedBillingCycle = cadence;
  } else {
    store.selectedBillingCycle = billingCadencePreview.value;
  }
  emit('navigate', 'checkout');
}
</script>

<template>
  <div ref="storefrontRootRef">
    <!-- 1. HERO SECTION: 2-Column Split (Brand Proposition + 3D Quantitative Surface) + 4-Col GSAP KPI Strip -->
    <section class="hero-section">
      <div class="container">
        <div class="hero-grid">
          <!-- Left Column: Official Brand Identity & Positioning -->
          <div class="hero-copy">
            <div>
              <p class="hero-kicker">
                Premium Trading Technology · Precision Engineered. Evidence Driven.
              </p>
              <h1 ref="heroHeadlineRef" class="hero-headline" style="margin-top: 12px;">
                StratEdge Algo — Advanced Trading Indicators for TradingView &amp; thinkorswim
              </h1>
              <p class="hero-description" style="margin-top: 18px;">
                Deploy institutional quantitative execution across <strong>StratEdge Algo Gamma</strong>,
                <strong>StratEdge Algo Flow</strong>, and <strong>StratEdge Algo Structure</strong>.
                Engineered for 0DTE index options, futures scalping, and systematic swing trading with
                sub-second automated license delivery.
              </p>
            </div>

            <div>
              <div class="meta-line" style="margin-bottom: 18px;">
                <span class="meta-accent">Precision Engineered. Evidence Driven.</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span>stratedgealgo.com</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span>Zero Historical Repainting</span>
              </div>

              <div class="hero-cta-row">
                <button
                  type="button"
                  class="btn-primary"
                  @click="selectIndicatorForCheckout('se-institutional-bundle', 'Annual')"
                >
                  License Trinity Bundle (Gamma + Flow + Structure)
                </button>
                <a href="#indicator-catalog" class="btn-secondary">
                  Compare Indicator Cards &amp; Pricing
                </a>
                <button
                  type="button"
                  class="btn-ghost"
                  @click="emit('navigate', 'dashboard')"
                >
                  Open Customer Portal ({{ store.customerLicenses.length }})
                </button>
              </div>
            </div>
          </div>

          <!-- Right Column: Interactive Three.js + GSAP 3D Quantitative Surface -->
          <Quant3DSurface
            v-model:active-model="active3DModel"
            v-model:active-instrument="active3DInstrument"
          />
        </div>

        <!-- Full-Width 4-Column GSAP Animated Quantitative KPI Strip Below Hero -->
        <div class="kpi-strip">
          <div class="kpi-item">
            <span class="kpi-number">{{ kpiTargets.winRate.toFixed(1) }}%</span>
            <span class="kpi-label">Audited Trinity Win Rate</span>
            <span class="kpi-context">Verified across 16,400 ES, NQ &amp; SPX RTH sessions</span>
          </div>
          <div class="kpi-item">
            <span class="kpi-number">{{ kpiTargets.webhookLatency.toFixed(2) }}s</span>
            <span class="kpi-label">Automated Webhook Delivery</span>
            <span class="kpi-context">Instant TradingView ACL whitelist + thinkorswim .ts artifact</span>
          </div>
          <div class="kpi-item">
            <span class="kpi-number">{{ kpiTargets.profitFactor.toFixed(2) }}x</span>
            <span class="kpi-label">Net Profit Factor (Gamma + Flow)</span>
            <span class="kpi-context">Net of 1.5-tick slippage &amp; exchange clearing fees</span>
          </div>
          <div class="kpi-item">
            <span class="kpi-number">{{ Math.round(kpiTargets.activeTraders).toLocaleString() }}+</span>
            <span class="kpi-label">Institutional &amp; Prop Desk Seats</span>
            <span class="kpi-context">Executing daily on TradingView &amp; Charles Schwab thinkorswim</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 2. FLAGSHIP TRINITY ARCHITECTURE SPOTLIGHT (GAMMA · FLOW · STRUCTURE) -->
    <section id="trinity-architecture" class="section-block">
      <div class="container">
        <div class="section-header">
          <div>
            <p class="hero-kicker">Precision Engineered. Evidence Driven.</p>
            <h2 class="section-title" style="margin-top: 4px;">
              01. The StratEdge Algo Core Architecture: Gamma, Flow &amp; Structure
            </h2>
            <p class="section-subtitle">
              Most retail indicators lag price because they only average historical closes. StratEdge Algo
              synthesizes three orthogonal institutional data pillars in real time.
            </p>
          </div>
        </div>

        <div class="trinity-spotlight-grid">
          <article class="trinity-pillar-card">
            <div>
              <div class="meta-line">
                <span class="meta-accent">Pillar 01</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span>Options &amp; Dealer Hedging</span>
              </div>
              <h3 class="card-title" style="margin-top: 8px;">StratEdge Algo Gamma</h3>
              <p class="card-tagline" style="margin-top: 8px;">
                Maps live market-maker gamma exposure (GEX), pinpointing exact Call Wall resistance,
                Put Wall support, and the Zero-Gamma Flip axis where dealer stabilization turns into
                explosive directional trend expansion.
              </p>
            </div>
            <div style="padding-top: 14px; border-top: 1px solid var(--border-hairline);">
              <div class="meta-line">
                <span>Win Rate: <strong class="mono" style="color: var(--accent-emerald);">76.4%</strong></span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span>Profit Factor: <strong class="mono">3.45x</strong></span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span class="mono">$199/mo</span>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px;">
                <button
                  type="button"
                  class="btn-secondary"
                  @click="store.addToCart('se-algo-gamma', billingCadencePreview, true)"
                >
                  + Add to Cart
                </button>
                <button
                  type="button"
                  class="btn-primary"
                  @click="
                    active3DModel = 'Gamma';
                    selectIndicatorForCheckout('se-algo-gamma');
                  "
                >
                  License Gamma
                </button>
              </div>
            </div>
          </article>

          <article class="trinity-pillar-card">
            <div>
              <div class="meta-line">
                <span class="meta-accent">Pillar 02</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span>Order-Book Tape &amp; CVD</span>
              </div>
              <h3 class="card-title" style="margin-top: 8px;">StratEdge Algo Flow</h3>
              <p class="card-tagline" style="margin-top: 8px;">
                Detects aggressive market-order sweeps absorbed by passive institutional limit orders.
                Combines Cumulative Volume Delta (CVD) divergence with off-exchange dark-pool block
                print synthesis.
              </p>
            </div>
            <div style="padding-top: 14px; border-top: 1px solid var(--border-hairline);">
              <div class="meta-line">
                <span>Win Rate: <strong class="mono" style="color: var(--accent-emerald);">74.9%</strong></span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span>Profit Factor: <strong class="mono">3.28x</strong></span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span class="mono">$189/mo</span>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px;">
                <button
                  type="button"
                  class="btn-secondary"
                  @click="store.addToCart('se-algo-flow', billingCadencePreview, true)"
                >
                  + Add to Cart
                </button>
                <button
                  type="button"
                  class="btn-primary"
                  @click="
                    active3DModel = 'Flow';
                    selectIndicatorForCheckout('se-algo-flow');
                  "
                >
                  License Flow
                </button>
              </div>
            </div>
          </article>

          <article class="trinity-pillar-card">
            <div>
              <div class="meta-line">
                <span class="meta-accent">Pillar 03</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span>Market Regime &amp; VWAP Topology</span>
              </div>
              <h3 class="card-title" style="margin-top: 8px;">StratEdge Algo Structure</h3>
              <p class="card-tagline" style="margin-top: 8px;">
                Automates institutional Break of Structure (BOS), Change of Character (CHoCH), and
                liquidity sweep validation paired with multi-session ±2σ/±3σ Anchored VWAP fair-value
                bands.
              </p>
            </div>
            <div style="padding-top: 14px; border-top: 1px solid var(--border-hairline);">
              <div class="meta-line">
                <span>Win Rate: <strong class="mono" style="color: var(--accent-emerald);">72.8%</strong></span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span>Profit Factor: <strong class="mono">3.62x</strong></span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span class="mono">$179/mo</span>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px;">
                <button
                  type="button"
                  class="btn-secondary"
                  @click="store.addToCart('se-algo-structure', billingCadencePreview, true)"
                >
                  + Add to Cart
                </button>
                <button
                  type="button"
                  class="btn-primary"
                  @click="
                    active3DModel = 'Structure';
                    selectIndicatorForCheckout('se-algo-structure');
                  "
                >
                  License Structure
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- 3. INDICATOR CATALOG CARDS WITH LIVE PRICING CADENCE -->
    <section id="indicator-catalog" class="section-block">
      <div class="container">
        <div class="section-header">
          <div>
            <h2 class="section-title">02. Indicator Cards, Specifications &amp; Live Pricing</h2>
            <p class="section-subtitle">
              Every StratEdge Algo indicator includes instant automated delivery for both TradingView
              (Invite-Only Pine Script v6) and Charles Schwab thinkorswim (.ts study download + tos.mx link).
            </p>
          </div>

          <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            <!-- Strategy Category Filter -->
            <div class="segmented-group" role="group" aria-label="Filter indicators by pillar">
              <button
                v-for="cat in ['All', 'Gamma', 'Flow', 'Structure', 'Full Suite']"
                :key="cat"
                type="button"
                class="segmented-btn"
                :class="{ active: activeCategoryFilter === cat }"
                @click="activeCategoryFilter = cat"
              >
                {{ cat }}
              </button>
            </div>

            <!-- Billing Cadence Selector -->
            <div class="segmented-group" role="group" aria-label="Select pricing cadence">
              <button
                v-for="cad in (['Monthly', 'Annual', 'Lifetime'] as const)"
                :key="cad"
                type="button"
                class="segmented-btn"
                :class="{ active: billingCadencePreview === cad }"
                @click="billingCadencePreview = cad"
              >
                {{ cad }}
              </button>
            </div>
          </div>
        </div>

        <div class="catalog-grid">
          <article
            v-for="ind in filteredCatalog"
            :key="ind.id"
            class="indicator-card"
            :class="{ featured: ind.id === 'se-institutional-bundle' }"
            data-testid="indicator-catalog-card"
          >
            <div>
              <!-- Zero-Pill Unboxed Metadata Line -->
              <div class="meta-line">
                <span class="meta-accent">{{ ind.category }}</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span>{{ ind.platforms.join(' + ') }}</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span class="mono">{{ ind.version }}</span>
              </div>

              <h3 class="card-title">{{ ind.name }}</h3>
              <p class="card-tagline" style="margin-top: 8px;">{{ ind.tagline }}</p>
            </div>

            <!-- Styled Technical SVG Visual Preview (Zero-Broken-Image Policy) -->
            <div class="card-visual-preview">
              <svg
                viewBox="0 0 320 90"
                width="100%"
                height="100%"
                role="img"
                :aria-label="`${ind.name} signal vector diagram`"
              >
                <line x1="0" y1="22" x2="320" y2="22" stroke="#1e293b" stroke-dasharray="2 2" />
                <line x1="0" y1="45" x2="320" y2="45" stroke="#1e293b" stroke-dasharray="2 2" />
                <line x1="0" y1="68" x2="320" y2="68" stroke="#1e293b" stroke-dasharray="2 2" />
                <path
                  v-if="ind.id.includes('gamma')"
                  d="M 8 68 L 48 56 L 88 74 L 128 38 L 168 46 L 208 22 L 248 30 L 308 12"
                  fill="none"
                  stroke="#10b981"
                  stroke-width="2.2"
                />
                <path
                  v-else-if="ind.id.includes('structure')"
                  d="M 8 74 C 65 72, 95 48, 155 42 C 215 36, 255 18, 308 10"
                  fill="none"
                  stroke="#38bdf8"
                  stroke-width="2.2"
                />
                <path
                  v-else
                  d="M 8 64 L 58 52 L 108 60 L 158 34 L 208 40 L 258 18 L 308 14"
                  fill="none"
                  stroke="#10b981"
                  stroke-width="2.2"
                />
                <circle cx="128" cy="38" r="4" fill="#10b981" />
                <text x="12" y="16" fill="#94a3b8" font-family="JetBrains Mono" font-size="9">
                  {{ ind.markets.slice(0, 38) }}
                </text>
              </svg>
            </div>

            <div>
              <div class="card-metrics-row">
                <div>
                  <div class="kpi-context">Win Rate</div>
                  <div class="mono" style="font-weight: 600; color: var(--accent-emerald);">
                    {{ ind.winRatePct.toFixed(1) }}%
                  </div>
                </div>
                <div>
                  <div class="kpi-context">Profit Factor</div>
                  <div class="mono" style="font-weight: 600;">
                    {{ ind.profitFactor.toFixed(2) }}x
                  </div>
                </div>
                <div>
                  <div class="kpi-context">Sharpe</div>
                  <div class="mono" style="font-weight: 600;">
                    {{ ind.sharpeRatio.toFixed(2) }}
                  </div>
                </div>
              </div>

              <!-- Explicit All-Tier Price Reference Strip -->
              <div class="meta-line" style="margin-top: 12px; font-size: 0.75rem;">
                <span class="mono">${{ ind.priceMonthly }}/mo</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span class="mono">${{ ind.priceAnnual.toLocaleString() }}/yr</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span class="mono">${{ ind.priceLifetime.toLocaleString() }} life</span>
              </div>

              <div class="card-price-footer" style="margin-top: 12px;">
                <div style="white-space: nowrap; flex-shrink: 0;">
                  <span class="price-figure">{{ formatPriceByCadence(ind).amount }}</span>
                  <span style="font-size: 0.8125rem; color: var(--text-muted); margin-left: 4px;">
                    {{ formatPriceByCadence(ind).suffix }}
                  </span>
                </div>

                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <button
                    type="button"
                    class="btn-ghost"
                    :aria-label="`Inspect script code for ${ind.name}`"
                    @click="inspectedIndicator = ind"
                  >
                    Code Spec
                  </button>
                  <button
                    type="button"
                    class="btn-secondary"
                    style="padding: 8px 12px; min-height: 38px; font-size: 0.8125rem;"
                    :aria-label="`Add ${ind.name} to cart`"
                    @click="store.addToCart(ind.id, billingCadencePreview, true)"
                  >
                    + Cart
                  </button>
                  <button
                    type="button"
                    class="btn-primary"
                    style="padding: 8px 14px; min-height: 38px; font-size: 0.8125rem;"
                    :aria-label="`License ${ind.name}`"
                    @click="selectIndicatorForCheckout(ind.id)"
                  >
                    Buy Now
                  </button>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- 4. MARKETING PRICING TIERS & PLAN COMPARISON -->
    <section id="pricing-plans" class="section-block">
      <div class="container">
        <div class="section-header">
          <div>
            <p class="hero-kicker">Transparent Institutional Licensing</p>
            <h2 class="section-title" style="margin-top: 4px;">
              03. Choose Your Execution Tier
            </h2>
            <p class="section-subtitle">
              Whether you specialize in single-model 0DTE scalping or run a multi-asset prop desk,
              every tier includes instant automated webhook provisioning.
            </p>
          </div>
        </div>

        <div class="pricing-tiers-grid">
          <!-- Tier 1: Single Model Monthly/Annual -->
          <div class="pricing-tier-card">
            <div>
              <div class="meta-line">
                <span class="meta-accent">For Focused Specialists</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span>Single Indicator Access</span>
              </div>
              <h3 style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 700; margin-top: 8px;">
                Single Quantitative Pillar
              </h3>
              <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 6px;">
                Choose any individual indicator—<strong>StratEdge Algo Gamma</strong>,
                <strong>Flow</strong>, or <strong>Structure</strong>.
              </p>

              <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-hairline);">
                <span class="price-figure" style="font-size: 2rem;">$179 – $199</span>
                <span style="color: var(--text-muted); font-size: 0.875rem; margin-left: 6px;">/ month</span>
                <div class="form-hint" style="margin-top: 4px;">
                  Or $1,390 – $1,490 billed annually
                </div>
              </div>

              <ul style="list-style: none; margin-top: 20px; display: flex; flex-direction: column; gap: 10px; font-size: 0.875rem; color: var(--text-secondary);">
                <li>✓ Dual-platform license (TradingView + thinkorswim)</li>
                <li>✓ Instant TradingView Invite-Only ACL whitelisting</li>
                <li>✓ Watermarked Charles Schwab thinkorswim .ts study file</li>
                <li>✓ Real-time webhook alert templates included</li>
              </ul>
            </div>

            <button
              type="button"
              class="btn-secondary"
              style="width: 100%;"
              @click="selectIndicatorForCheckout('se-algo-gamma', 'Monthly')"
            >
              Select Single Pillar License
            </button>
          </div>

          <!-- Tier 2: Trinity Annual Desk Suite (Highlighted) -->
          <div class="pricing-tier-card highlighted">
            <div>
              <div class="meta-line">
                <span class="meta-accent">Most Popular · Prop &amp; Funded Traders</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span>Save 45%</span>
              </div>
              <h3 style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 700; margin-top: 8px;">
                StratEdge Algo Trinity Annual
              </h3>
              <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 6px;">
                Full-stack access to <strong>Gamma + Flow + Structure</strong> plus the unified
                Trinity Master Workspace.
              </p>

              <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-hairline);">
                <span class="price-figure" style="font-size: 2rem; color: var(--accent-emerald);">$1,990</span>
                <span style="color: var(--text-muted); font-size: 0.875rem; margin-left: 6px;">/ year</span>
                <div class="form-hint" style="margin-top: 4px;">
                  Equivalent to $165/mo · Use code <strong class="mono">INSTITUTIONAL15</strong> for 15% off
                </div>
              </div>

              <ul style="list-style: none; margin-top: 20px; display: flex; flex-direction: column; gap: 10px; font-size: 0.875rem; color: var(--text-secondary);">
                <li>✓ Unlocks <strong>StratEdge Algo Gamma, Flow &amp; Structure</strong></li>
                <li>✓ Pre-built thinkorswim MarketWatch Scanners &amp; Watchlist Columns</li>
                <li>✓ Multi-timeframe TradingView Pine v6 Master Bundle</li>
                <li>✓ Self-service TradingView handle switching in Customer Portal</li>
              </ul>
            </div>

            <button
              type="button"
              class="btn-primary"
              style="width: 100%;"
              @click="selectIndicatorForCheckout('se-institutional-bundle', 'Annual')"
            >
              Provision Trinity Annual Suite
            </button>
          </div>

          <!-- Tier 3: Lifetime Institutional Seat -->
          <div class="pricing-tier-card">
            <div>
              <div class="meta-line">
                <span class="meta-accent">For Quantitative Desks</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span>Zero Recurring Fees</span>
              </div>
              <h3 style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 700; margin-top: 8px;">
                Trinity Lifetime Desk License
              </h3>
              <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 6px;">
                Permanent perpetual license to every StratEdge Algo indicator, scanner, and future
                quantitative release.
              </p>

              <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-hairline);">
                <span class="price-figure" style="font-size: 2rem;">$3,890</span>
                <span style="color: var(--text-muted); font-size: 0.875rem; margin-left: 6px;">one-time</span>
                <div class="form-hint" style="margin-top: 4px;">
                  Perpetual license key · Eligible for <strong class="mono">DESK20</strong> (20% off)
                </div>
              </div>

              <ul style="list-style: none; margin-top: 20px; display: flex; flex-direction: column; gap: 10px; font-size: 0.875rem; color: var(--text-secondary);">
                <li>✓ Perpetual ownership of Gamma, Flow, Structure &amp; Trinity Suite</li>
                <li>✓ Uncapped thinkorswim .ts study artifact downloads</li>
                <li>✓ Priority Pine Script v6 &amp; ThinkScript version upgrades</li>
                <li>✓ Direct quantitative engineering support channel</li>
              </ul>
            </div>

            <button
              type="button"
              class="btn-secondary"
              style="width: 100%;"
              @click="selectIndicatorForCheckout('se-institutional-bundle', 'Lifetime')"
            >
              Select Lifetime Desk License
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- 5. TANSTACK TABLE: AUDITED PERFORMANCE & MULTI-TIMEFRAME MATRIX -->
    <section id="backtest-matrix" class="section-block">
      <div class="container">
        <div class="section-header">
          <div>
            <h2 class="section-title">04. Audited Quantitative Benchmark Matrix</h2>
            <p class="section-subtitle">
              Evidence-driven out-of-sample performance metrics powered by TanStack Table. Click any
              column header to sort by Win Rate, Profit Factor, Sharpe Ratio, or Max Drawdown.
            </p>
          </div>
        </div>

        <div class="table-toolbar">
          <div style="max-width: 380px; width: 100%;">
            <label for="matrix-search" class="form-label" style="display: block; margin-bottom: 6px;">
              Filter Models by Name, Pillar, or Timeframe
            </label>
            <input
              id="matrix-search"
              v-model="tableSearchQuery"
              type="search"
              class="search-input"
              placeholder="e.g. Gamma, Flow, Structure, 0DTE, 1m..."
            />
          </div>

          <div class="meta-line">
            <span>Slippage Assumption: 1.5 Ticks / Side</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span>Audit Window: Jan 2022 – Oct 2026</span>
          </div>
        </div>

        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
                <th
                  v-for="header in headerGroup.headers"
                  :key="header.id"
                  class="sortable"
                  @click="header.column.getToggleSortingHandler()?.($event)"
                >
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <FlexRender
                      v-if="!header.isPlaceholder"
                      :render="header.column.columnDef.header"
                      :props="header.getContext()"
                    />
                    <span class="mono" style="font-size: 0.75rem; color: var(--accent-emerald);">
                      {{
                        header.column.getIsSorted() === 'asc'
                          ? '↑'
                          : header.column.getIsSorted() === 'desc'
                          ? '↓'
                          : '↕'
                      }}
                    </span>
                  </div>
                </th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in table.getRowModel().rows" :key="row.id">
                <td
                  v-for="cell in row.getVisibleCells()"
                  :key="cell.id"
                  :class="{
                    mono: ['winRatePct', 'profitFactor', 'sharpeRatio', 'maxDrawdownPct'].includes(
                      cell.column.id
                    ),
                  }"
                >
                  <FlexRender
                    :render="cell.column.columnDef.cell"
                    :props="cell.getContext()"
                  />
                </td>
                <td>
                  <button
                    type="button"
                    class="btn-ghost"
                    @click="selectIndicatorForCheckout(row.original.id)"
                  >
                    Select Model
                  </button>
                </td>
              </tr>
              <tr v-if="table.getRowModel().rows.length === 0">
                <td colspan="8" style="text-align: center; padding: 32px; color: var(--text-muted);">
                  No quantitative indicators match "{{ tableSearchQuery }}".
                  <button
                    type="button"
                    class="btn-ghost"
                    style="margin-left: 12px;"
                    @click="tableSearchQuery = ''"
                  >
                    Reset Filter
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- 6. AUTOMATED FULFILLMENT PIPELINE ARCHITECTURE & SOCIAL PROOF -->
    <section id="delivery-architecture" class="section-block">
      <div class="container">
        <div class="section-header">
          <div>
            <h2 class="section-title">05. Zero-Touch Automated Indicator Delivery Pipeline</h2>
            <p class="section-subtitle">
              No manual waiting for email attachments. The moment your checkout completes on
              stratedgealgo.com, our fulfillment engine executes three deterministic provisioning actions.
            </p>
          </div>
        </div>

        <div class="bento-grid">
          <div class="bento-panel">
            <div class="step-list">
              <div class="step-item">
                <div class="meta-line">
                  <span class="meta-accent">Step 01</span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span>Cryptographic License Key Generation (0–150ms)</span>
                </div>
                <h3 style="font-size: 1.125rem; font-weight: 700; margin-top: 6px;">
                  Deterministic License &amp; Account Binding
                </h3>
                <p style="font-size: 0.9375rem; color: var(--text-secondary); margin-top: 4px;">
                  Drizzle ORM persists your license record (SE-XXXX-XXXX-XXXX) and binds it to your
                  email, TradingView handle, and Charles Schwab thinkorswim workspace profile.
                </p>
              </div>

              <div class="step-item">
                <div class="meta-line">
                  <span class="meta-accent">Step 02</span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span>TradingView Invite-Only Script ACL Sync (150–650ms)</span>
                </div>
                <h3 style="font-size: 1.125rem; font-weight: 700; margin-top: 6px;">
                  Instant Pine Script v6 Invite-Only Whitelisting
                </h3>
                <p style="font-size: 0.9375rem; color: var(--text-secondary); margin-top: 4px;">
                  Our webhook dispatches your TradingView username directly to our permission server.
                  Refresh TradingView and find StratEdge Algo Gamma, Flow, and Structure immediately
                  under <em>Indicators → Invite-Only Scripts</em>.
                </p>
              </div>

              <div class="step-item">
                <div class="meta-line">
                  <span class="meta-accent">Step 03</span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span>thinkorswim .ts Study Artifact &amp; tos.mx Link (650–850ms)</span>
                </div>
                <h3 style="font-size: 1.125rem; font-weight: 700; margin-top: 6px;">
                  Watermarked ThinkScript .ts Download &amp; One-Click Shared Link
                </h3>
                <p style="font-size: 0.9375rem; color: var(--text-secondary); margin-top: 4px;">
                  Your Customer Portal unlocks direct .ts study file downloads embedded with your
                  license header alongside one-click http://tos.mx/ workspace import URLs.
                </p>
              </div>
            </div>
          </div>

          <!-- Claim-to-Proof Adjacent Institutional Desk Testimonials -->
          <div class="bento-panel" style="justify-content: space-between;">
            <div>
              <div class="meta-line">
                <span class="meta-accent">Verified Desk Deployments</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span>Claim-to-Proof Audit</span>
              </div>
              <h3 style="font-size: 1.2rem; font-weight: 700; margin-top: 8px;">
                Execution Feedback from Quantitative &amp; Funded Traders
              </h3>

              <div style="margin-top: 18px; padding-bottom: 18px; border-bottom: 1px solid var(--border-hairline);">
                <p style="font-size: 0.9375rem; color: var(--text-secondary); font-style: italic;">
                  "Before StratEdge Algo, our ES scalpers struggled with false breakout entries during
                  opening range chop. Deploying StratEdge Algo Flow and Structure cut false entries by
                  41% and lifted our desk's 90-day profit factor from 1.72 to 3.28."
                </p>
                <div class="meta-line" style="margin-top: 10px;">
                  <strong style="color: var(--text-primary);">Marcus Vance</strong>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span>Senior Index Futures Trader, ApexQuant Prop</span>
                </div>
              </div>

              <div style="margin-top: 18px;">
                <p style="font-size: 0.9375rem; color: var(--text-secondary); font-style: italic;">
                  "StratEdge Algo Gamma is indispensable for our SPX 0DTE desk. The automated delivery
                  whitelisted my TradingView handle and generated the thinkorswim .ts study file in
                  under a second."
                </p>
                <div class="meta-line" style="margin-top: 10px;">
                  <strong style="color: var(--text-primary);">Elena Rostova, CFA</strong>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span>Derivatives Strategist, Zurich Quant Capital</span>
                </div>
              </div>
            </div>

            <div style="padding-top: 14px; border-top: 1px solid var(--border-hairline);">
              <div class="meta-line">
                <span>Partner Promo Code:</span>
                <code class="mono" style="color: var(--accent-emerald); font-weight: 600;">INSTITUTIONAL15</code>
                <span>(15% Off Annual &amp; Lifetime Licenses)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 6B. DEDICATED SOCIAL PROOF & TRADER TESTIMONIALS SECTION -->
    <TestimonialsSection @select-setup="selectIndicatorForCheckout" />

    <!-- 7. TANSTACK FORM + ZOD: INSTANT AUTOMATED CHECKOUT & DELIVERY -->
    <section id="instant-checkout" ref="checkoutSectionRef" class="section-block">
      <div class="container">
        <div class="section-header">
          <div>
            <h2 class="section-title">07. Instant License Checkout &amp; Automated Provisioning</h2>
            <p class="section-subtitle">
              Validated end-to-end with TanStack Form and Zod. Completing this order immediately
              provisions your license in the SQLite + Drizzle database and redirects you to your
              Customer Portal with active downloads.
            </p>
          </div>
        </div>

        <div class="checkout-grid">
          <!-- Left: TanStack Form -->
          <form
            class="form-panel"
            novalidate
            @submit.prevent.stop="checkoutForm.handleSubmit()"
          >
            <div class="form-row-2">
              <!-- Indicator Selection -->
              <div class="form-field">
                <label for="checkout-indicator" class="form-label">
                  1. Select StratEdge Algo Product
                </label>
                <select
                  id="checkout-indicator"
                  v-model="store.selectedIndicatorId"
                  class="form-select"
                >
                  <option
                    v-for="ind in store.indicators"
                    :key="ind.id"
                    :value="ind.id"
                  >
                    {{ ind.name }} ({{ ind.version }})
                  </option>
                </select>
              </div>

              <!-- Billing Cadence Selection -->
              <div class="form-field">
                <label for="checkout-cadence" class="form-label">
                  2. License Billing Cadence
                </label>
                <select
                  id="checkout-cadence"
                  v-model="store.selectedBillingCycle"
                  class="form-select"
                >
                  <option value="Monthly">Monthly Subscription</option>
                  <option value="Annual">Annual License (Save 35%)</option>
                  <option value="Lifetime">Lifetime Desk License (One-Time)</option>
                </select>
              </div>
            </div>

            <div class="form-row-2">
              <checkoutForm.Field
                name="customerName"
                :validators="{
                  onChange: ({ value }) =>
                    value.trim().length < 2
                      ? 'Full name must be at least 2 characters'
                      : undefined,
                }"
              >
                <template #default="{ field, state }">
                  <div class="form-field">
                    <label :for="field.name" class="form-label">
                      Full Name / Desk Contact
                    </label>
                    <input
                      :id="field.name"
                      :name="field.name"
                      :value="field.state.value"
                      type="text"
                      class="form-input"
                      placeholder="e.g. Marcus Vance"
                      @blur="field.handleBlur"
                      @input="(e) => field.handleChange((e.target as HTMLInputElement).value)"
                    />
                    <span
                      v-if="state.meta.errors.length"
                      class="form-error"
                      role="alert"
                    >
                      {{ state.meta.errors[0] }}
                    </span>
                  </div>
                </template>
              </checkoutForm.Field>

              <checkoutForm.Field
                name="customerEmail"
                :validators="{
                  onChange: ({ value }) =>
                    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
                      ? 'Enter a valid email address for license delivery'
                      : undefined,
                }"
              >
                <template #default="{ field, state }">
                  <div class="form-field">
                    <label :for="field.name" class="form-label">
                      License Delivery Email
                    </label>
                    <input
                      :id="field.name"
                      :name="field.name"
                      :value="field.state.value"
                      type="email"
                      class="form-input"
                      placeholder="trader@propdesk.io"
                      @blur="field.handleBlur"
                      @input="(e) => field.handleChange((e.target as HTMLInputElement).value)"
                    />
                    <span
                      v-if="state.meta.errors.length"
                      class="form-error"
                      role="alert"
                    >
                      {{ state.meta.errors[0] }}
                    </span>
                  </div>
                </template>
              </checkoutForm.Field>
            </div>

            <div class="form-row-2">
              <checkoutForm.Field
                name="tradingViewUsername"
                :validators="{
                  onChange: ({ value }) =>
                    !/^[a-zA-Z0-9_-]{3,30}$/.test(value.trim())
                      ? '3–30 chars (letters, numbers, _ or -)'
                      : undefined,
                }"
              >
                <template #default="{ field, state }">
                  <div class="form-field">
                    <label :for="field.name" class="form-label">
                      TradingView Username (For Automated ACL Whitelist)
                    </label>
                    <input
                      :id="field.name"
                      :name="field.name"
                      :value="field.state.value"
                      type="text"
                      class="form-input mono"
                      placeholder="e.g. MarcusVance_ES"
                      @blur="field.handleBlur"
                      @input="(e) => field.handleChange((e.target as HTMLInputElement).value)"
                    />
                    <span class="form-hint">
                      Used by our webhook to grant instant Invite-Only Script access.
                    </span>
                    <span
                      v-if="state.meta.errors.length"
                      class="form-error"
                      role="alert"
                    >
                      {{ state.meta.errors[0] }}
                    </span>
                  </div>
                </template>
              </checkoutForm.Field>

              <checkoutForm.Field name="thinkorswimAccountId">
                <template #default="{ field }">
                  <div class="form-field">
                    <label :for="field.name" class="form-label">
                      thinkorswim Workspace Tag (Optional)
                    </label>
                    <input
                      :id="field.name"
                      :name="field.name"
                      :value="field.state.value"
                      type="text"
                      class="form-input mono"
                      placeholder="e.g. TOS-994182"
                      @blur="field.handleBlur"
                      @input="(e) => field.handleChange((e.target as HTMLInputElement).value)"
                    />
                    <span class="form-hint">
                      Embedded in your personalized .ts ThinkScript study header.
                    </span>
                  </div>
                </template>
              </checkoutForm.Field>
            </div>

            <div class="form-field">
              <label for="coupon-code-input" class="form-label">
                Institutional Partner / Desk Coupon Code
              </label>
              <div style="display: flex; gap: 10px;">
                <input
                  id="coupon-code-input"
                  v-model="couponInput"
                  type="text"
                  class="form-input mono"
                  placeholder="Try INSTITUTIONAL15 or DESK20"
                />
                <button
                  type="button"
                  class="btn-secondary"
                  @click="couponInput = 'DESK20'"
                >
                  Apply DESK20 (20% Off)
                </button>
              </div>
            </div>

            <div
              v-if="checkoutErrorBanner"
              style="padding: 12px 14px; background: rgba(239, 68, 68, 0.12); border: 1px solid var(--accent-crimson); border-radius: var(--radius-inner); color: var(--accent-crimson); font-size: 0.875rem; margin-bottom: 16px;"
              role="alert"
            >
              {{ checkoutErrorBanner }}
            </div>

            <button
              type="submit"
              class="btn-primary"
              style="width: 100%; padding: 14px 24px; font-size: 0.95rem;"
              :disabled="checkoutSubmitting"
            >
              {{
                checkoutSubmitting
                  ? 'Executing Automated Webhook Provisioning...'
                  : `Complete Payment ($${liveOrderPricing.finalPrice.toLocaleString()}) & Provision Indicator Now`
              }}
            </button>
          </form>

          <!-- Right: Live Order & Fulfillment Summary -->
          <aside class="form-panel">
            <div class="meta-line">
              <span class="meta-accent">Automated Fulfillment Summary</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>stratedgealgo.com</span>
            </div>

            <h3 style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 700; margin-top: 8px;">
              {{ store.selectedIndicator?.name || 'StratEdge Algo Trinity Bundle' }}
            </h3>
            <p style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 6px;">
              {{ store.selectedIndicator?.tagline }}
            </p>

            <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-hairline); display: flex; flex-direction: column; gap: 10px; font-size: 0.875rem;">
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-muted);">Platforms Included</span>
                <span class="mono">TradingView + thinkorswim</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-muted);">thinkorswim Artifact</span>
                <span class="mono">{{ store.selectedIndicator?.tosStudyFilename }}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-muted);">TradingView Script ID</span>
                <span class="mono">{{ store.selectedIndicator?.tvScriptId }}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-muted);">Billing Cadence</span>
                <span class="mono">{{ liveOrderPricing.billingCycle }}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-muted);">Base Price</span>
                <span class="mono">${{ liveOrderPricing.basePrice.toLocaleString() }}</span>
              </div>
              <div
                v-if="liveOrderPricing.discountPct > 0"
                style="display: flex; justify-content: space-between; color: var(--accent-emerald);"
              >
                <span>Coupon Discount ({{ liveOrderPricing.discountPct }}%)</span>
                <span class="mono">-${{ liveOrderPricing.discountAmount.toLocaleString() }}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding-top: 12px; border-top: 1px solid var(--border-hairline); font-size: 1.125rem; font-weight: 700;">
                <span>Total Due Today</span>
                <span class="mono" style="color: var(--accent-emerald);">
                  ${{ liveOrderPricing.finalPrice.toLocaleString() }} USD
                </span>
              </div>
            </div>

            <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-hairline); font-size: 0.8125rem; color: var(--text-muted);">
              Upon submission, your license key is generated immediately and your Customer Portal opens
              with one-click .ts study downloads and TradingView ACL verification.
            </div>
          </aside>
        </div>
      </div>
    </section>

    <!-- 8. TECHNICAL FAQ & SCHEMA.ORG STRUCTURED KNOWLEDGE BASE -->
    <FAQSection @navigate="emit('navigate', $event)" />

    <!-- MODAL: INSPECT THINKSCRIPT & PINE SCRIPT CODE SPECIFICATION -->
    <div
      v-if="inspectedIndicator"
      class="modal-backdrop"
      role="dialog"
      aria-modal="true"
      :aria-label="`${inspectedIndicator.name} code specification`"
      @click.self="inspectedIndicator = null"
    >
      <div class="modal-card">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
          <div>
            <div class="meta-line">
              <span class="meta-accent">{{ inspectedIndicator.category }}</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span class="mono">{{ inspectedIndicator.version }}</span>
            </div>
            <h3 style="font-family: var(--font-display); font-size: 1.4rem; font-weight: 700; margin-top: 4px;">
              {{ inspectedIndicator.name }}
            </h3>
          </div>
          <button
            type="button"
            class="btn-ghost"
            @click="inspectedIndicator = null"
          >
            Close
          </button>
        </div>

        <p style="font-size: 0.9375rem; color: var(--text-secondary); margin-top: 12px;">
          {{ inspectedIndicator.description }}
        </p>

        <div class="code-drawer">
          <div class="meta-line" style="margin-bottom: 8px;">
            <span class="meta-accent">thinkorswim ThinkScript Preview</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span class="mono">{{ inspectedIndicator.tosStudyFilename }}</span>
          </div>
          <pre>{{ inspectedIndicator.thinkScriptCode }}</pre>
        </div>

        <div class="code-drawer" style="margin-top: 14px;">
          <div class="meta-line" style="margin-bottom: 8px;">
            <span class="meta-accent">TradingView Pine Script v6 Architecture</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span class="mono">{{ inspectedIndicator.tvScriptId }}</span>
          </div>
          <pre>{{ inspectedIndicator.pineScriptPreview }}</pre>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;">
          <button
            type="button"
            class="btn-secondary"
            @click="inspectedIndicator = null"
          >
            Dismiss
          </button>
          <button
            type="button"
            class="btn-primary"
            @click="
              selectIndicatorForCheckout(inspectedIndicator.id);
              inspectedIndicator = null;
            "
          >
            License {{ inspectedIndicator.name }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
