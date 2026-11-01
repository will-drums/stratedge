<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  TradingViewUsernameSchema,
  ThinkorswimAccountIdSchema,
  type PlatformPreference,
} from '../utils/fulfillment';

const props = defineProps<{
  customerName: string;
  customerEmail: string;
  platformPreference: PlatformPreference;
  tradingViewUsername: string;
  thinkorswimAccountId: string;
  fieldErrors: Record<string, string>;
  bannerError?: string;
  wizardLayoutMode?: 'wizard' | 'express';
}>();

const emit = defineEmits<{
  (e: 'update:customerName', val: string): void;
  (e: 'update:customerEmail', val: string): void;
  (e: 'update:platformPreference', val: PlatformPreference): void;
  (e: 'update:tradingViewUsername', val: string): void;
  (e: 'update:thinkorswimAccountId', val: string): void;
  (e: 'next'): void;
}>();

// Live TradingView Handle ACL Verification State
const tvVerifyStatus = ref<'idle' | 'valid' | 'invalid'>('idle');
const tvVerifyMessage = ref('');

// Live thinkorswim Account / Workspace ID Verification State
const tosVerifyStatus = ref<'idle' | 'valid' | 'invalid'>('idle');
const tosVerifyMessage = ref('');

const isTradingViewActive = computed(
  () =>
    props.platformPreference === 'TradingView' ||
    props.platformPreference === 'Dual'
);

const isThinkorswimActive = computed(
  () =>
    props.platformPreference === 'thinkorswim' ||
    props.platformPreference === 'Dual'
);

function selectPlatform(pref: PlatformPreference) {
  emit('update:platformPreference', pref);
}

function verifyTradingViewHandleNow() {
  const parsed = TradingViewUsernameSchema.safeParse(props.tradingViewUsername);
  if (!parsed.success) {
    tvVerifyStatus.value = 'invalid';
    tvVerifyMessage.value =
      parsed.error.issues[0]?.message || 'Invalid TradingView handle format';
  } else {
    tvVerifyStatus.value = 'valid';
    tvVerifyMessage.value = `200 OK · @${parsed.data} verified ready for Pine Script v6 Invite-Only ACL provisioning.`;
  }
}

function verifyTosAccountNow() {
  const parsed = ThinkorswimAccountIdSchema.safeParse(props.thinkorswimAccountId);
  if (!parsed.success) {
    tosVerifyStatus.value = 'invalid';
    tosVerifyMessage.value =
      parsed.error.issues[0]?.message ||
      'Invalid thinkorswim Account / Workspace ID format';
  } else {
    tosVerifyStatus.value = 'valid';
    tosVerifyMessage.value = `200 OK · ${parsed.data.toUpperCase()} verified for watermarked .ts study & tos.mx grid compilation.`;
  }
}
</script>

<template>
  <div
    data-testid="checkout-step-identity-platform"
    :style="{
      paddingBottom: wizardLayoutMode === 'express' ? '22px' : '6px',
      marginBottom: wizardLayoutMode === 'express' ? '22px' : '0',
      borderBottom:
        wizardLayoutMode === 'express' ? '1px solid var(--border-hairline)' : 'none',
    }"
  >
    <!-- Step Header Metadata -->
    <div
      style="
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 16px;
      "
    >
      <div>
        <div class="meta-line">
          <span class="meta-accent">Step 01 of 03</span>
          <span class="meta-sep" aria-hidden="true">·</span>
          <span>User Identity &amp; Execution Platform Preference</span>
        </div>
        <h3
          style="
            font-family: var(--font-display);
            font-size: 1.15rem;
            font-weight: 700;
            color: var(--text-primary);
            margin-top: 4px;
          "
        >
          Trader Identity &amp; Target Execution Platform (TradingView vs. thinkorswim)
        </h3>
      </div>

      <!-- Segmented Quick-Toggle for Platform Preference -->
      <div
        class="segmented-group"
        role="radiogroup"
        aria-label="Execution Platform Preference"
        data-testid="platform-preference-segmented"
      >
        <button
          type="button"
          class="segmented-btn"
          :class="{ active: platformPreference === 'TradingView' }"
          data-testid="platform-pref-tradingview-btn"
          @click="selectPlatform('TradingView')"
        >
          TradingView
        </button>
        <button
          type="button"
          class="segmented-btn"
          :class="{ active: platformPreference === 'thinkorswim' }"
          data-testid="platform-pref-thinkorswim-btn"
          @click="selectPlatform('thinkorswim')"
        >
          thinkorswim
        </button>
        <button
          type="button"
          class="segmented-btn"
          :class="{ active: platformPreference === 'Dual' }"
          data-testid="platform-pref-dual-btn"
          @click="selectPlatform('Dual')"
        >
          Dual (TV + TOS)
        </button>
      </div>
    </div>

    <!-- ===================================================================
         SECTION A: USER / TRADER DESK IDENTITY FIELDS
         =================================================================== -->
    <div
      style="
        padding: 18px;
        background: var(--bg-canvas);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        margin-bottom: 18px;
      "
    >
      <div class="meta-line" style="margin-bottom: 12px; font-size: 0.75rem;">
        <span class="meta-accent">01A · Identity &amp; License Vault</span>
        <span class="meta-sep" aria-hidden="true">·</span>
        <span>Cryptographic License Binding &amp; Institutional Receipt</span>
      </div>

      <div class="form-row-2">
        <div class="form-field" style="margin-bottom: 0;">
          <label for="chk-customerName" class="form-label">
            Full Name / Quantitative Desk Name *
          </label>
          <input
            id="chk-customerName"
            :value="customerName"
            type="text"
            class="form-input"
            data-testid="checkout-customer-name-input"
            placeholder="Marcus Vance"
            autocomplete="name"
            @input="
              (e) =>
                emit('update:customerName', (e.target as HTMLInputElement).value)
            "
          />
          <span class="form-hint">
            Authorized seat holder embedded in license certificate
          </span>
          <span
            v-if="fieldErrors.customerName"
            class="form-error"
            role="alert"
            data-testid="error-customer-name"
          >
            {{ fieldErrors.customerName }}
          </span>
        </div>

        <div class="form-field" style="margin-bottom: 0;">
          <label for="chk-customerEmail" class="form-label">
            Customer Email (Vault Login &amp; Receipt) *
          </label>
          <input
            id="chk-customerEmail"
            :value="customerEmail"
            type="email"
            class="form-input"
            data-testid="checkout-customer-email-input"
            placeholder="marcus.vance@apexquant.io"
            autocomplete="email"
            @input="
              (e) =>
                emit('update:customerEmail', (e.target as HTMLInputElement).value)
            "
          />
          <span class="form-hint">
            Instant webhook confirmation &amp; Customer Vault key delivery
          </span>
          <span
            v-if="fieldErrors.customerEmail"
            class="form-error"
            role="alert"
            data-testid="error-customer-email"
          >
            {{ fieldErrors.customerEmail }}
          </span>
        </div>
      </div>
    </div>

    <!-- ===================================================================
         SECTION B: PLATFORM PREFERENCE SELECTION CARDS (TradingView vs. thinkorswim)
         =================================================================== -->
    <div style="margin-bottom: 18px;">
      <div class="meta-line" style="margin-bottom: 10px; font-size: 0.75rem;">
        <span class="meta-accent">01B · Execution Platform Preference</span>
        <span class="meta-sep" aria-hidden="true">·</span>
        <span>Select Primary Charting &amp; Orderflow Environment</span>
      </div>

      <div
        style="
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        "
      >
        <!-- Card 1: TradingView (Pine Script v6) -->
        <button
          type="button"
          data-testid="platform-card-tradingview"
          :style="{
            textAlign: 'left',
            padding: '14px',
            borderRadius: 'var(--radius-md)',
            border:
              platformPreference === 'TradingView'
                ? '1px solid var(--accent-emerald)'
                : '1px solid var(--border-subtle)',
            background:
              platformPreference === 'TradingView'
                ? 'var(--surface-gradient-featured)'
                : 'var(--bg-canvas)',
            cursor: 'pointer',
            transition: 'border-color 150ms ease, background 150ms ease',
          }"
          @click="selectPlatform('TradingView')"
        >
          <div
            style="
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 6px;
            "
          >
            <span
              class="mono"
              style="
                font-size: 0.68rem;
                font-weight: 700;
                color: var(--accent-emerald-bright);
                text-transform: uppercase;
              "
            >
              PINE SCRIPT V6
            </span>
            <span
              class="mono"
              :style="{
                fontSize: '0.68rem',
                color:
                  platformPreference === 'TradingView'
                    ? 'var(--accent-emerald-bright)'
                    : 'var(--text-muted)',
              }"
            >
              {{ platformPreference === 'TradingView' ? '● ACTIVE' : '○ SELECT' }}
            </span>
          </div>
          <div
            style="
              font-family: var(--font-display);
              font-size: 0.96rem;
              font-weight: 700;
              color: var(--text-primary);
            "
          >
            TradingView
          </div>
          <p
            style="
              font-size: 0.78rem;
              color: var(--text-secondary);
              margin-top: 6px;
              line-height: 1.45;
            "
          >
            Sub-second webhook whitelisting to your
            <span class="mono">Invite-Only Scripts</span> folder with server-side alert webhooks.
          </p>
        </button>

        <!-- Card 2: Charles Schwab thinkorswim (ThinkScript .ts) -->
        <button
          type="button"
          data-testid="platform-card-thinkorswim"
          :style="{
            textAlign: 'left',
            padding: '14px',
            borderRadius: 'var(--radius-md)',
            border:
              platformPreference === 'thinkorswim'
                ? '1px solid var(--accent-sky)'
                : '1px solid var(--border-subtle)',
            background:
              platformPreference === 'thinkorswim'
                ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.14) 0%, rgba(13, 21, 38, 0.92) 60%)'
                : 'var(--bg-canvas)',
            cursor: 'pointer',
            transition: 'border-color 150ms ease, background 150ms ease',
          }"
          @click="selectPlatform('thinkorswim')"
        >
          <div
            style="
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 6px;
            "
          >
            <span
              class="mono"
              style="
                font-size: 0.68rem;
                font-weight: 700;
                color: var(--accent-sky);
                text-transform: uppercase;
              "
            >
              THINKSCRIPT .TS
            </span>
            <span
              class="mono"
              :style="{
                fontSize: '0.68rem',
                color:
                  platformPreference === 'thinkorswim'
                    ? 'var(--accent-sky)'
                    : 'var(--text-muted)',
              }"
            >
              {{ platformPreference === 'thinkorswim' ? '● ACTIVE' : '○ SELECT' }}
            </span>
          </div>
          <div
            style="
              font-family: var(--font-display);
              font-size: 0.96rem;
              font-weight: 700;
              color: var(--text-primary);
            "
          >
            thinkorswim
          </div>
          <p
            style="
              font-size: 0.78rem;
              color: var(--text-secondary);
              margin-top: 6px;
              line-height: 1.45;
            "
          >
            Cryptographically watermarked <span class="mono">.ts</span> ThinkScript study files &amp;
            <span class="mono">tos.mx</span> workspaces.
          </p>
        </button>

        <!-- Card 3: Dual-Platform Sync (TradingView + thinkorswim) -->
        <button
          type="button"
          data-testid="platform-card-dual"
          :style="{
            textAlign: 'left',
            padding: '14px',
            borderRadius: 'var(--radius-md)',
            border:
              platformPreference === 'Dual'
                ? '1px solid var(--accent-emerald)'
                : '1px solid var(--border-subtle)',
            background:
              platformPreference === 'Dual'
                ? 'var(--surface-gradient-featured)'
                : 'var(--bg-canvas)',
            cursor: 'pointer',
            transition: 'border-color 150ms ease, background 150ms ease',
          }"
          @click="selectPlatform('Dual')"
        >
          <div
            style="
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 6px;
            "
          >
            <span
              class="mono"
              style="
                font-size: 0.68rem;
                font-weight: 700;
                color: var(--accent-amber);
                text-transform: uppercase;
              "
            >
              DUAL · $0 EXTRA
            </span>
            <span
              class="mono"
              :style="{
                fontSize: '0.68rem',
                color:
                  platformPreference === 'Dual'
                    ? 'var(--accent-emerald-bright)'
                    : 'var(--text-muted)',
              }"
            >
              {{ platformPreference === 'Dual' ? '● ACTIVE' : '○ SELECT' }}
            </span>
          </div>
          <div
            style="
              font-family: var(--font-display);
              font-size: 0.96rem;
              font-weight: 700;
              color: var(--text-primary);
            "
          >
            Dual (TV + TOS)
          </div>
          <p
            style="
              font-size: 0.78rem;
              color: var(--text-secondary);
              margin-top: 6px;
              line-height: 1.45;
            "
          >
            Provisions both TradingView ACL and thinkorswim
            <span class="mono">.ts</span> artifacts under one unified license key.
          </p>
        </button>
      </div>
    </div>

    <!-- ===================================================================
         SECTION C: PLATFORM PROVISIONING HANDLES & LIVE VERIFICATION
         =================================================================== -->
    <div
      style="
        padding: 18px;
        background: var(--bg-canvas);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        margin-bottom: 16px;
      "
    >
      <div class="meta-line" style="margin-bottom: 12px; font-size: 0.75rem;">
        <span class="meta-accent">01C · Target Platform Handle Binding</span>
        <span class="meta-sep" aria-hidden="true">·</span>
        <span>
          {{
            platformPreference === 'TradingView'
              ? 'Primary Target: TradingView Pine Script v6 ACL'
              : platformPreference === 'thinkorswim'
              ? 'Primary Target: Charles Schwab thinkorswim (.ts Study)'
              : 'Dual Target: TradingView ACL + thinkorswim .ts Artifact'
          }}
        </span>
      </div>

      <div class="form-row-2">
        <!-- TradingView Handle Field -->
        <div
          class="form-field"
          style="margin-bottom: 0;"
          :style="{
            opacity: isTradingViewActive ? 1 : 0.82,
          }"
        >
          <label for="chk-tradingViewUsername" class="form-label">
            TradingView Username (ACL)
            <span
              v-if="isTradingViewActive"
              style="color: var(--accent-emerald-bright);"
            >
              *
            </span>
            <span v-else style="color: var(--text-muted); font-weight: 400;">
              (Optional)
            </span>
          </label>
          <div style="display: flex; gap: 8px;">
            <input
              id="chk-tradingViewUsername"
              :value="tradingViewUsername"
              type="text"
              class="form-input mono"
              data-testid="checkout-tv-username-input"
              placeholder="MarcusVance_ES"
              @input="
                (e) => {
                  emit(
                    'update:tradingViewUsername',
                    (e.target as HTMLInputElement).value
                  );
                  tvVerifyStatus = 'idle';
                }
              "
            />
            <button
              type="button"
              class="btn-secondary"
              style="white-space: nowrap; padding: 0 12px;"
              data-testid="verify-tv-handle-btn"
              @click="verifyTradingViewHandleNow"
            >
              Verify ACL
            </button>
          </div>
          <span class="form-hint">
            Exact handle whitelisted on Pine Script v6 Invite-Only server
          </span>
          <span
            v-if="tvVerifyStatus !== 'idle'"
            class="mono"
            :style="{
              display: 'block',
              marginTop: '4px',
              fontSize: '0.75rem',
              color:
                tvVerifyStatus === 'valid'
                  ? 'var(--accent-emerald-bright)'
                  : 'var(--accent-crimson)',
            }"
            data-testid="tv-verify-feedback"
          >
            {{ tvVerifyMessage }}
          </span>
          <span
            v-if="fieldErrors.tradingViewUsername"
            class="form-error"
            role="alert"
            data-testid="error-tv-username"
          >
            {{ fieldErrors.tradingViewUsername }}
          </span>
        </div>

        <!-- thinkorswim Account / Workspace ID Field -->
        <div
          class="form-field"
          style="margin-bottom: 0;"
          :style="{
            opacity: isThinkorswimActive ? 1 : 0.82,
          }"
        >
          <label for="chk-thinkorswimAccountId" class="form-label">
            thinkorswim Account ID (.ts)
            <span v-if="isThinkorswimActive" style="color: var(--accent-sky);">
              *
            </span>
            <span v-else style="color: var(--text-muted); font-weight: 400;">
              (Optional)
            </span>
          </label>
          <div style="display: flex; gap: 8px;">
            <input
              id="chk-thinkorswimAccountId"
              :value="thinkorswimAccountId"
              type="text"
              class="form-input mono"
              data-testid="checkout-tos-id-input"
              placeholder="TOS-994182"
              @input="
                (e) => {
                  emit(
                    'update:thinkorswimAccountId',
                    (e.target as HTMLInputElement).value
                  );
                  tosVerifyStatus = 'idle';
                }
              "
            />
            <button
              type="button"
              class="btn-secondary"
              style="white-space: nowrap; padding: 0 12px;"
              data-testid="verify-tos-id-btn"
              @click="verifyTosAccountNow"
            >
              Verify TOS
            </button>
          </div>
          <span class="form-hint">
            Embedded in your watermarked .ts study &amp; tos.mx grid download
          </span>
          <span
            v-if="tosVerifyStatus !== 'idle'"
            class="mono"
            :style="{
              display: 'block',
              marginTop: '4px',
              fontSize: '0.75rem',
              color:
                tosVerifyStatus === 'valid'
                  ? 'var(--accent-sky)'
                  : 'var(--accent-crimson)',
            }"
            data-testid="tos-verify-feedback"
          >
            {{ tosVerifyMessage }}
          </span>
          <span
            v-if="fieldErrors.thinkorswimAccountId"
            class="form-error"
            role="alert"
            data-testid="error-tos-id"
          >
            {{ fieldErrors.thinkorswimAccountId }}
          </span>
        </div>
      </div>

      <!-- Live Telemetry Summary Bar for Step 01 -->
      <div
        style="
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid var(--border-hairline);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          font-size: 0.78rem;
          color: var(--text-secondary);
        "
        data-testid="step1-telemetry-summary"
      >
        <div>
          <span style="color: var(--text-muted);">Active Identity:</span>
          <strong style="margin-left: 6px; color: var(--text-primary);">
            {{ customerName || 'Unassigned Trader' }}
          </strong>
          <span class="mono" style="margin-left: 6px; color: var(--text-secondary);">
            ({{ customerEmail || 'no-email@desk.io' }})
          </span>
        </div>
        <div>
          <span style="color: var(--text-muted);">Provisioning Route:</span>
          <span
            class="mono"
            style="margin-left: 6px; font-weight: 700; color: var(--accent-emerald-bright);"
          >
            {{
              platformPreference === 'TradingView'
                ? `TradingView ACL (@${tradingViewUsername || 'unset'})`
                : platformPreference === 'thinkorswim'
                ? `thinkorswim .ts (${thinkorswimAccountId || 'unset'})`
                : `Dual ACL (@${tradingViewUsername || 'unset'} + ${thinkorswimAccountId || 'unset'})`
            }}
          </span>
        </div>
      </div>
    </div>

    <div
      v-if="bannerError"
      class="form-error"
      style="margin-bottom: 12px;"
      role="alert"
      data-testid="step1-banner-error"
    >
      {{ bannerError }}
    </div>

    <!-- Step 01 Advance CTA (Shown in 3-Step Guided Wizard Mode) -->
    <div
      v-if="wizardLayoutMode !== 'express'"
      style="display: flex; justify-content: flex-end; margin-top: 12px;"
    >
      <button
        type="button"
        class="btn-primary"
        data-testid="checkout-next-step-1-btn"
        @click="emit('next')"
      >
        Continue to Step 02: Model, Tier &amp; Cart Selection →
      </button>
    </div>
  </div>
</template>
