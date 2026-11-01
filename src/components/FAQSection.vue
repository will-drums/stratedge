<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  TRADER_FAQ_ITEMS,
  filterTraderFaqs,
  type TraderFaqCategory,
  type TraderFaqItem,
} from '../utils/fulfillment';

const emit = defineEmits<{
  (e: 'navigate', view: 'storefront' | 'checkout' | 'dashboard' | 'admin'): void;
}>();

const categories: TraderFaqCategory[] = [
  'All',
  'Installation',
  'Licensing',
  'Indicator Usage',
];

const activeCategory = ref<TraderFaqCategory>('All');
const searchQuery = ref('');
const openFaqIds = ref<string[]>([TRADER_FAQ_ITEMS[0]?.id ?? 'faq-install-dual-delivery']);
const copiedFaqId = ref<string | null>(null);

const filteredFaqs = computed<TraderFaqItem[]>(() =>
  filterTraderFaqs(TRADER_FAQ_ITEMS, activeCategory.value, searchQuery.value)
);

function getCategoryCount(category: TraderFaqCategory): number {
  if (category === 'All') {
    return TRADER_FAQ_ITEMS.length;
  }
  return TRADER_FAQ_ITEMS.filter((item) => item.category === category).length;
}

function isFaqOpen(id: string): boolean {
  return openFaqIds.value.includes(id);
}

function toggleFaq(id: string): void {
  if (openFaqIds.value.includes(id)) {
    openFaqIds.value = openFaqIds.value.filter((item) => item !== id);
  } else {
    openFaqIds.value = [...openFaqIds.value, id];
  }
}

function selectCategory(category: TraderFaqCategory): void {
  activeCategory.value = category;
  const matching = filterTraderFaqs(TRADER_FAQ_ITEMS, category, searchQuery.value);
  if (matching.length > 0 && !matching.some((item) => openFaqIds.value.includes(item.id))) {
    openFaqIds.value = [matching[0].id];
  }
}

function expandAllVisible(): void {
  openFaqIds.value = filteredFaqs.value.map((item) => item.id);
}

function collapseAllVisible(): void {
  openFaqIds.value = [];
}

function resetFaqFilters(): void {
  activeCategory.value = 'All';
  searchQuery.value = '';
  openFaqIds.value = [TRADER_FAQ_ITEMS[0]?.id ?? 'faq-install-dual-delivery'];
}

async function copyTechnicalSnippet(id: string, snippet: string): Promise<void> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(snippet);
    }
  } catch {
    // Fallback silent ignore in restricted headless contexts
  }
  copiedFaqId.value = id;
  setTimeout(() => {
    if (copiedFaqId.value === id) {
      copiedFaqId.value = null;
    }
  }, 1800);
}

function getCategoryAccentColor(category: TraderFaqItem['category']): string {
  if (category === 'Installation') return 'var(--accent-sky)';
  if (category === 'Licensing') return 'var(--accent-emerald-bright)';
  return 'var(--accent-amber)';
}
</script>

<template>
  <section
    id="technical-faq"
    class="section-block"
    style="border-bottom: none;"
    data-testid="faq-section"
  >
    <div class="container">
      <div class="section-header">
        <div>
          <p class="hero-kicker">Technical Documentation &amp; Licensing FAQ</p>
          <h2 class="section-title" style="margin-top: 4px;">
            07. Frequently Asked Questions
          </h2>
          <p class="section-subtitle">
            Comprehensive technical reference covering TradingView Pine Script v6 Invite-Only ACL
            provisioning, Charles Schwab thinkorswim <span class="mono">.ts</span> study imports,
            cryptographic desk licensing, and non-repainting signal execution.
          </p>
        </div>

        <div
          style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;"
          role="tablist"
          aria-label="Filter FAQ by inquiry category"
        >
          <button
            v-for="cat in categories"
            :key="cat"
            type="button"
            role="tab"
            :aria-selected="activeCategory === cat"
            class="segmented-btn"
            :class="{ active: activeCategory === cat }"
            :data-testid="`faq-category-${cat.toLowerCase().replace(/\s+/g, '-')}`"
            @click="selectCategory(cat)"
          >
            <span>{{ cat }}</span>
            <span
              class="mono"
              style="margin-left: 6px; font-size: 0.75rem; opacity: 0.8;"
            >
              ({{ getCategoryCount(cat) }})
            </span>
          </button>
        </div>
      </div>

      <!-- Search & Accordion Bulk Controls Toolbar -->
      <div
        class="table-toolbar"
        style="margin-bottom: 20px; padding: 14px 18px; background: var(--surface-gradient); border: 1px solid var(--border-hairline); border-radius: var(--radius-outer);"
      >
        <div style="flex: 1; min-width: 240px; max-width: 520px; position: relative;">
          <label for="faq-search-input" class="form-label" style="display: block; margin-bottom: 6px;">
            Search Installation, Licensing, or Indicator Usage
          </label>
          <input
            id="faq-search-input"
            v-model="searchQuery"
            type="search"
            class="search-input"
            placeholder="Filter by keyword (e.g. thinkorswim, repaint, webhook, SE-XXXX, prop firm)..."
            data-testid="faq-search-input"
          />
        </div>

        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <span class="mono" style="font-size: 0.8125rem; color: var(--text-muted);" data-testid="faq-results-count">
            Showing {{ filteredFaqs.length }} of {{ TRADER_FAQ_ITEMS.length }} technical entries
          </span>
          <button
            type="button"
            class="btn-ghost"
            data-testid="faq-expand-all-btn"
            @click="expandAllVisible"
          >
            Expand All
          </button>
          <button
            type="button"
            class="btn-ghost"
            data-testid="faq-collapse-all-btn"
            @click="collapseAllVisible"
          >
            Collapse All
          </button>
          <button
            v-if="activeCategory !== 'All' || searchQuery.trim().length > 0"
            type="button"
            class="btn-secondary"
            data-testid="faq-reset-filters-btn"
            @click="resetFaqFilters"
          >
            Reset Filters
          </button>
        </div>
      </div>

      <!-- Empty Filter State -->
      <div
        v-if="filteredFaqs.length === 0"
        class="bento-panel"
        style="text-align: center; padding: 36px 24px;"
        data-testid="faq-empty-state"
      >
        <p style="font-family: var(--font-display); font-size: 1.15rem; font-weight: 700; color: var(--text-primary);">
          No technical FAQ entries matched "{{ searchQuery }}" in {{ activeCategory }}
        </p>
        <p style="font-size: 0.9375rem; color: var(--text-secondary); margin-top: 6px;">
          Try clearing your search filter or jump directly to the Customer Portal to open a priority engineering support ticket.
        </p>
        <div style="display: flex; justify-content: center; gap: 12px; margin-top: 16px;">
          <button
            type="button"
            class="btn-secondary"
            @click="resetFaqFilters"
          >
            Show All {{ TRADER_FAQ_ITEMS.length }} FAQs
          </button>
          <button
            type="button"
            class="btn-primary"
            @click="emit('navigate', 'dashboard')"
          >
            Open Customer Portal
          </button>
        </div>
      </div>

      <!-- FAQ Accordion List using canonical .faq-list, .faq-item, and .faq-question-btn patterns -->
      <div v-else class="faq-list" data-testid="faq-list">
        <div
          v-for="item in filteredFaqs"
          :key="item.id"
          class="faq-item"
          :data-testid="`faq-item-${item.id}`"
          :style="{
            borderColor: isFaqOpen(item.id)
              ? 'rgba(52, 211, 153, 0.45)'
              : undefined,
          }"
        >
          <button
            type="button"
            class="faq-question-btn"
            :aria-expanded="isFaqOpen(item.id)"
            :aria-controls="`faq-answer-${item.id}`"
            :data-testid="`faq-question-btn-${item.id}`"
            @click="toggleFaq(item.id)"
          >
            <div style="display: flex; flex-direction: column; gap: 6px; padding-right: 12px;">
              <div class="meta-line" style="font-family: var(--font-body); font-weight: 500;">
                <span
                  class="mono"
                  :style="{
                    color: getCategoryAccentColor(item.category),
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }"
                >
                  {{ item.category }}
                </span>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span class="mono" style="font-size: 0.75rem; color: var(--text-muted);">
                  {{ item.platformBadge }}
                </span>
              </div>
              <span>{{ item.question }}</span>
            </div>

            <span
              class="mono"
              style="color: var(--accent-emerald-bright); font-size: 1.25rem; font-weight: 700; flex-shrink: 0;"
              aria-hidden="true"
            >
              {{ isFaqOpen(item.id) ? '−' : '+' }}
            </span>
          </button>

          <div
            v-if="isFaqOpen(item.id)"
            :id="`faq-answer-${item.id}`"
            :data-testid="`faq-answer-${item.id}`"
            style="margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border-hairline); display: flex; flex-direction: column; gap: 14px;"
          >
            <p
              style="font-size: 0.9375rem; color: var(--text-secondary); line-height: 1.65;"
            >
              {{ item.answer }}
            </p>

            <!-- Technical Path / Command Callout Box -->
            <div
              v-if="item.technicalPathOrSnippet"
              style="background-color: #050912; border: 1px solid var(--border-hairline); border-radius: var(--radius-inner); padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;"
            >
              <div style="display: flex; flex-direction: column; gap: 4px;">
                <span
                  v-if="item.snippetLabel"
                  style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em;"
                >
                  {{ item.snippetLabel }}
                </span>
                <code
                  class="mono"
                  style="font-size: 0.8125rem; color: var(--accent-emerald-bright); word-break: break-word;"
                >
                  {{ item.technicalPathOrSnippet }}
                </code>
              </div>

              <button
                type="button"
                class="btn-ghost"
                :aria-label="`Copy ${item.snippetLabel || 'technical reference'}`"
                @click.stop="copyTechnicalSnippet(item.id, item.technicalPathOrSnippet)"
              >
                <span class="mono" style="font-size: 0.75rem;">
                  {{ copiedFaqId === item.id ? 'Copied ✓' : 'Copy Reference' }}
                </span>
              </button>
            </div>

            <!-- Key Verification Highlights -->
            <ul
              v-if="item.keyHighlights && item.keyHighlights.length > 0"
              style="list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; padding: 0; margin: 0;"
            >
              <li
                v-for="(point, pIdx) in item.keyHighlights"
                :key="pIdx"
                style="font-size: 0.8125rem; color: var(--text-secondary); background-color: rgba(15, 23, 42, 0.55); border: 1px solid rgba(148, 163, 184, 0.14); border-radius: var(--radius-sm); padding: 8px 12px; display: flex; align-items: flex-start; gap: 8px;"
              >
                <span class="mono" style="color: var(--accent-emerald-bright); font-weight: 700;">✓</span>
                <span>{{ point }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Institutional Desk Support & Direct Provisioning Footer Strip -->
      <div
        class="bento-panel"
        style="margin-top: 24px; display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap;"
      >
        <div>
          <div class="meta-line">
            <span class="meta-accent">24/5 Quantitative Engineering Desk</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span class="mono">Sub-2s ACL Sync SLA</span>
          </div>
          <h3 style="font-family: var(--font-display); font-size: 1.15rem; font-weight: 700; margin-top: 4px; color: var(--text-primary);">
            Need custom multi-seat prop desk provisioning or webhook routing assistance?
          </h3>
          <p style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 4px;">
            Manage your active TradingView handles, download watermarked <span class="mono">.ts</span> artifacts, or dispatch a priority engineering ticket from your Customer Portal.
          </p>
        </div>

        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <button
            type="button"
            class="btn-secondary"
            data-testid="faq-portal-cta"
            @click="emit('navigate', 'dashboard')"
          >
            Access Customer Portal
          </button>
          <button
            type="button"
            class="btn-primary"
            data-testid="faq-checkout-cta"
            @click="emit('navigate', 'checkout')"
          >
            Start 3-Step License Checkout
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
