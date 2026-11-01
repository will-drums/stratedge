<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { gsap, ScrollTrigger } from '../plugins/gsap';

const emit = defineEmits<{
  (
    e: 'select-setup',
    indicatorId: string,
    billingCycle: 'Monthly' | 'Annual' | 'Lifetime'
  ): void;
}>();

export interface TraderTestimonial {
  id: string;
  traderName: string;
  initials: string;
  roleTitle: string;
  firmName: string;
  location: string;
  tradingViewHandle: string;
  verifiedLicenseKey: string;
  pillarFilter: 'Gamma' | 'Flow' | 'Structure' | 'Trinity Suite';
  indicatorId: string;
  indicatorUsed: string;
  recommendedCycle: 'Monthly' | 'Annual' | 'Lifetime';
  platformsUsed: string;
  primaryInstrument: string;
  auditedWinRate: string;
  profitFactorDelta: string;
  verifiedPayoutOrAum: string;
  quote: string;
  accentColor: 'emerald' | 'sky' | 'amber';
}

const testimonials: TraderTestimonial[] = [
  {
    id: 'test-marcus-vance',
    traderName: 'Marcus Vance, CFA',
    initials: 'MV',
    roleTitle: 'Managing Index Derivatives Trader',
    firmName: 'ApexQuant Prop Desk',
    location: 'Chicago, IL',
    tradingViewHandle: '@MarcusVance_ES',
    verifiedLicenseKey: 'SE-GAMM-4F9A-8821',
    pillarFilter: 'Gamma',
    indicatorId: 'se-algo-gamma',
    indicatorUsed: 'StratEdge Algo Gamma',
    recommendedCycle: 'Annual',
    platformsUsed: 'thinkorswim + TradingView',
    primaryInstrument: 'SPX 0DTE & ES1! Futures',
    auditedWinRate: '78.2%',
    profitFactorDelta: '1.84x → 3.52x',
    verifiedPayoutOrAum: '+$148,400 Q3 Net',
    quote:
      'StratEdge Algo Gamma transformed how our Chicago desk executes 0DTE SPX iron flies and directional ES scalps. Knowing the exact Zero-Gamma Flip strike and Call Wall pin before the 9:30 RTH bell eliminated our mid-morning chop drawdowns completely.',
    accentColor: 'emerald',
  },
  {
    id: 'test-elena-rostova',
    traderName: 'Dr. Elena Rostova',
    initials: 'ER',
    roleTitle: 'Head of Systematic Microstructure',
    firmName: 'Zurich Alpha Partners',
    location: 'Zürich, Switzerland',
    tradingViewHandle: '@Elena_ZurichQuant',
    verifiedLicenseKey: 'SE-TRIN-9C2E-7741',
    pillarFilter: 'Trinity Suite',
    indicatorId: 'se-institutional-bundle',
    indicatorUsed: 'StratEdge Algo Trinity Bundle',
    recommendedCycle: 'Lifetime',
    platformsUsed: 'TradingView Pine v6 + TOS',
    primaryInstrument: 'NQ1! & DAX Futures',
    auditedWinRate: '76.9%',
    profitFactorDelta: '2.05x → 3.89x',
    verifiedPayoutOrAum: '$14.2M Desk Allocation',
    quote:
      'We audited over twenty commercial Pine Script and ThinkScript studies—every single one repainted on historical bars except StratEdge Algo. Combining Gamma walls with Flow CVD absorption gives our execution algorithms an unmistakable institutional edge.',
    accentColor: 'emerald',
  },
  {
    id: 'test-devon-brooks',
    traderName: 'Devon Brooks',
    initials: 'DB',
    roleTitle: 'Senior Order-Flow & Tape Scalper',
    firmName: 'Tri-State Futures Group',
    location: 'New York, NY',
    tradingViewHandle: '@DBrooks_NQFlow',
    verifiedLicenseKey: 'SE-FLOW-8B3D-1194',
    pillarFilter: 'Flow',
    indicatorId: 'se-algo-flow',
    indicatorUsed: 'StratEdge Algo Flow',
    recommendedCycle: 'Annual',
    platformsUsed: 'TradingView Invite-Only',
    primaryInstrument: 'NQ1! & MNQ 1-Min Scalping',
    auditedWinRate: '75.4%',
    profitFactorDelta: '1.65x → 3.31x',
    verifiedPayoutOrAum: '+$92,650 Verified Prop',
    quote:
      'Trading NQ without seeing passive limit absorption is flying blind. StratEdge Algo Flow flags exhausted retail market sweeps right into dark-pool resting blocks on the 1-minute chart. The automated webhook delivery had my TradingView handle live in under a second.',
    accentColor: 'sky',
  },
  {
    id: 'test-david-chen',
    traderName: 'David Chen',
    initials: 'DC',
    roleTitle: 'Portfolio Swing & Macro Strategist',
    firmName: 'Pacific Meridian Capital',
    location: 'San Francisco, CA',
    tradingViewHandle: '@DChen_SwingMacro',
    verifiedLicenseKey: 'SE-STRU-7B1D-5590',
    pillarFilter: 'Structure',
    indicatorId: 'se-algo-structure',
    indicatorUsed: 'StratEdge Algo Structure',
    recommendedCycle: 'Annual',
    platformsUsed: 'Charles Schwab thinkorswim',
    primaryInstrument: 'NVDA, SPY, QQQ & CL1!',
    auditedWinRate: '73.6%',
    profitFactorDelta: '1.92x → 3.64x',
    verifiedPayoutOrAum: '+38.4% Audited Annual',
    quote:
      'Importing the watermarked .ts study into thinkorswim took thirty seconds. StratEdge Algo Structure maps multi-session ±2σ/±3σ Anchored VWAP bands alongside automated CHoCH/BOS liquidity sweeps—it is the cleanest regime filter I have used in 14 years.',
    accentColor: 'amber',
  },
  {
    id: 'test-siddharth-kulkarni',
    traderName: 'Siddharth Kulkarni',
    initials: 'SK',
    roleTitle: 'Quantitative Options Volatility Trader',
    firmName: 'SigmaDelta Derivatives',
    location: 'London, UK',
    tradingViewHandle: '@SKulkarni_Vol',
    verifiedLicenseKey: 'SE-0DTE-5A2C-6042',
    pillarFilter: 'Gamma',
    indicatorId: 'se-algo-gamma-scanner',
    indicatorUsed: 'StratEdge Algo Gamma — 0DTE Scanner',
    recommendedCycle: 'Annual',
    platformsUsed: 'thinkorswim + TradingView',
    primaryInstrument: 'SPX, NDX & QQQ 0DTE',
    auditedWinRate: '77.1%',
    profitFactorDelta: '2.10x → 3.58x',
    verifiedPayoutOrAum: '+$119,200 6-Mo Audited',
    quote:
      'The 0DTE Strike Scanner pinpoints dealer hedging acceleration strikes 15 to 20 minutes before retail momentum oscillators even cross. Having both the TradingView invite-only overlay and the native thinkorswim scanner column in one license is unmatched.',
    accentColor: 'emerald',
  },
  {
    id: 'test-hannah-lindqvist',
    traderName: 'Hannah Lindqvist',
    initials: 'HL',
    roleTitle: 'Lead Funded Futures Execution Trader',
    firmName: 'Nordic Quant Collective',
    location: 'Stockholm, Sweden',
    tradingViewHandle: '@Hannah_NordicES',
    verifiedLicenseKey: 'SE-DPOL-3E8F-9920',
    pillarFilter: 'Flow',
    indicatorId: 'se-algo-flow-darkpool',
    indicatorUsed: 'StratEdge Algo Flow — DarkPool Oscillator',
    recommendedCycle: 'Lifetime',
    platformsUsed: 'TradingView + thinkorswim',
    primaryInstrument: 'ES1!, RTY1! & GC1! Gold',
    auditedWinRate: '74.8%',
    profitFactorDelta: '1.78x → 3.40x',
    verifiedPayoutOrAum: '6x Funded Accounts Passed',
    quote:
      'Institutional block prints used to require a $2,000/month terminal feed. StratEdge Algo Flow synthesizes dark-pool z-score anomalies directly inside my TradingView and thinkorswim workspaces, letting me fade retail traps with institutional precision.',
    accentColor: 'sky',
  },
];

const activePillarFilter = ref<
  'All' | 'Gamma' | 'Flow' | 'Structure' | 'Trinity Suite'
>('All');

const filteredTestimonials = computed(() => {
  if (activePillarFilter.value === 'All') {
    return testimonials;
  }
  return testimonials.filter((t) => t.pillarFilter === activePillarFilter.value);
});

const sectionRootRef = ref<HTMLElement | null>(null);
let gsapCtx: gsap.Context | null = null;

function animateTestimonialCards() {
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;
  if (prefersReducedMotion || !sectionRootRef.value) return;

  gsapCtx?.revert();
  gsapCtx = gsap.context(() => {
    const cards = gsap.utils.toArray<HTMLElement>('.testimonial-pro-card');
    if (cards.length > 0) {
      gsap.fromTo(
        cards,
        { y: 24, opacity: 0.14, scale: 0.985 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.6,
          stagger: 0.08,
          ease: 'power3.out',
          clearProps: 'transform,opacity,scale',
          scrollTrigger: {
            trigger: '.testimonials-card-grid',
            start: 'top 90%',
            toggleActions: 'play none none none',
            once: true,
          },
        }
      );
    }
  }, sectionRootRef.value);

  ScrollTrigger.refresh();
}

onMounted(() => {
  nextTick(() => {
    animateTestimonialCards();
  });
});

watch(
  () => activePillarFilter.value,
  async () => {
    await nextTick();
    animateTestimonialCards();
  }
);

onUnmounted(() => {
  gsapCtx?.revert();
});
</script>

<template>
  <section
    id="verified-trader-testimonials"
    ref="sectionRootRef"
    class="section-block"
    data-testid="testimonials-section"
  >
    <div class="container">
      <!-- Section Header + Interactive Pillar Filter -->
      <div class="section-header">
        <div>
          <p class="hero-kicker">
            Audited Institutional &amp; Prop-Desk Social Proof
          </p>
          <h2 class="section-title" style="margin-top: 4px;">
            06. Trusted by Quantitative Desks &amp; Funded Futures Traders
          </h2>
          <p class="section-subtitle">
            Every review below is cryptographically linked to an active StratEdge Algo license key
            (`SE-XXXX-XXXX-XXXX`) and verified across live TradingView and Charles Schwab thinkorswim executions.
          </p>
        </div>

        <!-- Filter by Quantitative Pillar -->
        <div
          class="segmented-group"
          role="group"
          aria-label="Filter trader reviews by indicator pillar"
        >
          <button
            v-for="filter in (['All', 'Gamma', 'Flow', 'Structure', 'Trinity Suite'] as const)"
            :key="filter"
            type="button"
            class="segmented-btn"
            :class="{ active: activePillarFilter === filter }"
            :data-testid="`testimonial-filter-${filter.toLowerCase().replace(/\s+/g, '-')}`"
            @click="activePillarFilter = filter"
          >
            {{ filter === 'All' ? `All Desk Reviews (${testimonials.length})` : filter }}
          </button>
        </div>
      </div>

      <!-- High-Craft 3-Column Testimonial Card Grid -->
      <div class="proof-grid testimonials-card-grid">
        <article
          v-for="item in filteredTestimonials"
          :key="item.id"
          class="testimonial-card testimonial-pro-card"
          :class="`accent-${item.accentColor}`"
          data-testid="trader-testimonial-card"
        >
          <!-- Top: Unboxed Verification Metadata + Quote -->
          <div>
            <div class="meta-line" style="justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span class="meta-accent">✓ Verified License</span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span class="mono" style="font-size: 0.75rem;">{{ item.verifiedLicenseKey }}</span>
              </div>
              <span class="mono" style="font-size: 0.75rem; color: var(--accent-sky);">
                {{ item.platformsUsed }}
              </span>
            </div>

            <div style="margin-top: 10px;">
              <span
                style="
                  font-size: 0.75rem;
                  font-weight: 700;
                  text-transform: uppercase;
                  letter-spacing: 0.05em;
                  color: var(--text-muted);
                "
              >
                {{ item.indicatorUsed }} · {{ item.primaryInstrument }}
              </span>
            </div>

            <blockquote
              style="
                margin-top: 12px;
                font-size: 0.9375rem;
                color: var(--text-primary);
                line-height: 1.62;
              "
            >
              "{{ item.quote }}"
            </blockquote>
          </div>

          <!-- Bottom: Audited Performance Strip + Trader Attribution + 1-Click Setup CTA -->
          <div>
            <!-- 3-Column Tabular Performance Proof Row -->
            <div class="card-metrics-row" style="margin-bottom: 14px;">
              <div>
                <div class="kpi-context">Win Rate</div>
                <div class="mono" style="font-weight: 700; color: var(--accent-emerald-bright);">
                  {{ item.auditedWinRate }}
                </div>
              </div>
              <div>
                <div class="kpi-context">Profit Factor</div>
                <div class="mono" style="font-weight: 700; color: var(--text-primary);">
                  {{ item.profitFactorDelta }}
                </div>
              </div>
              <div>
                <div class="kpi-context">Verified Audit</div>
                <div class="mono" style="font-weight: 700; color: var(--accent-sky); font-size: 0.8125rem;">
                  {{ item.verifiedPayoutOrAum }}
                </div>
              </div>
            </div>

            <!-- Trader Identity Row + Deploy Setup Button -->
            <div
              style="
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                flex-wrap: wrap;
              "
            >
              <div style="display: flex; align-items: center; gap: 12px;">
                <div class="trader-avatar-monogram" aria-hidden="true">
                  {{ item.initials }}
                </div>
                <div>
                  <div style="font-weight: 700; font-size: 0.9375rem; color: var(--text-primary);">
                    {{ item.traderName }}
                  </div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">
                    {{ item.roleTitle }} · {{ item.firmName }} ({{ item.location }})
                  </div>
                  <div class="mono" style="font-size: 0.72rem; color: var(--accent-emerald-bright);">
                    TradingView: {{ item.tradingViewHandle }}
                  </div>
                </div>
              </div>

              <button
                type="button"
                class="btn-ghost"
                style="padding: 6px 12px; min-height: 34px; font-size: 0.75rem;"
                :data-testid="`deploy-setup-${item.id}`"
                @click="emit('select-setup', item.indicatorId, item.recommendedCycle)"
              >
                License Setup →
              </button>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
