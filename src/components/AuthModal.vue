<script setup lang="ts">
import { ref } from 'vue';
import { usePlatformStore } from '../stores/platformStore';

const emit = defineEmits<{
  (e: 'navigate', view: 'storefront' | 'dashboard' | 'admin'): void;
}>();

const store = usePlatformStore();

// Login Form State
const loginEmail = ref('marcus.vance@apexquant.io');
const loginPassword = ref('StratEdge#2026');
const loginError = ref('');
const loginSubmitting = ref(false);

// Register Form State
const regName = ref('');
const regEmail = ref('');
const regPassword = ref('');
const regTvUsername = ref('');
const regTosAccount = ref('');
const regRole = ref<'customer' | 'admin'>('customer');
const regError = ref('');
const regSubmitting = ref(false);

async function handleLoginSubmit() {
  loginError.value = '';
  loginSubmitting.value = true;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: loginEmail.value,
        password: loginPassword.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      loginError.value = data.error || 'Authentication failed';
      return;
    }

    await store.switchCustomerProfile(data.user.email);
    store.isAuthModalOpen = false;
    store.showNotification(
      'success',
      `Signed In as ${data.user.name}`,
      `Session active (${data.user.role.toUpperCase()}) · TradingView ACL Handle: @${data.user.tradingViewUsername}`
    );

    if (data.user.role === 'admin') {
      emit('navigate', 'admin');
    } else {
      emit('navigate', 'dashboard');
    }
  } catch (err) {
    loginError.value =
      err instanceof Error ? err.message : 'Network error during login';
  } finally {
    loginSubmitting.value = false;
  }
}

async function handleRegisterSubmit() {
  regError.value = '';
  regSubmitting.value = true;
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: regName.value,
        email: regEmail.value,
        password: regPassword.value,
        tradingViewUsername: regTvUsername.value,
        thinkorswimAccountId: regTosAccount.value,
        role: regRole.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      regError.value = data.error || 'Registration failed';
      return;
    }

    await store.switchCustomerProfile(data.user.email);
    store.isAuthModalOpen = false;
    store.showNotification(
      'success',
      `Account Created: ${data.user.name}`,
      `Your StratEdge Algo membership vault and @${data.user.tradingViewUsername} handle are now active.`
    );

    if (data.user.role === 'admin') {
      emit('navigate', 'admin');
    } else {
      emit('navigate', 'dashboard');
    }
  } catch (err) {
    regError.value =
      err instanceof Error ? err.message : 'Network error during registration';
  } finally {
    regSubmitting.value = false;
  }
}

async function quickDemoSignIn(
  email: string,
  targetView: 'dashboard' | 'admin'
) {
  loginEmail.value = email;
  loginPassword.value = 'StratEdge#2026';
  await store.switchCustomerProfile(email);
  store.isAuthModalOpen = false;
  store.showNotification(
    'success',
    `Authenticated Session: ${store.activeCustomerName}`,
    `Switched active workspace to ${email} (${store.activeUserRole.toUpperCase()})`
  );
  emit('navigate', targetView);
}
</script>

<template>
  <div
    v-if="store.isAuthModalOpen"
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="auth-modal-title"
    data-testid="auth-modal"
    @click.self="store.isAuthModalOpen = false"
  >
    <div class="modal-card" style="max-width: 540px;">
      <!-- Modal Header -->
      <div
        style="
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border-hairline);
        "
      >
        <div>
          <div class="meta-line">
            <span class="meta-accent">StratEdge Algo Identity &amp; Membership</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span>Encrypted Session</span>
          </div>
          <h2
            id="auth-modal-title"
            style="
              font-family: var(--font-display);
              font-size: 1.45rem;
              font-weight: 700;
              margin-top: 6px;
            "
          >
            {{
              store.authModalTab === 'login'
                ? 'Sign In to Customer & Admin Portal'
                : 'Create Your StratEdge Algo Account'
            }}
          </h2>
        </div>

        <button
          type="button"
          class="btn-ghost"
          aria-label="Close authentication modal"
          @click="store.isAuthModalOpen = false"
        >
          Close ✕
        </button>
      </div>

      <!-- Mode Switcher Tabs (Sign In vs Sign Up) -->
      <div
        class="segmented-group"
        style="width: 100%; margin-top: 18px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr;"
      >
        <button
          type="button"
          class="segmented-btn"
          :class="{ active: store.authModalTab === 'login' }"
          @click="store.authModalTab = 'login'"
        >
          Sign In
        </button>
        <button
          type="button"
          class="segmented-btn"
          :class="{ active: store.authModalTab === 'register' }"
          @click="store.authModalTab = 'register'"
        >
          Create Account (Sign Up)
        </button>
      </div>

      <!-- TAB 1: SIGN IN -->
      <form
        v-if="store.authModalTab === 'login'"
        novalidate
        @submit.prevent="handleLoginSubmit"
      >
        <div class="form-field">
          <label for="auth-login-email" class="form-label">
            Account Email Address
          </label>
          <input
            id="auth-login-email"
            v-model="loginEmail"
            type="email"
            class="form-input"
            placeholder="trader@propdesk.io"
            required
          />
        </div>

        <div class="form-field">
          <label for="auth-login-password" class="form-label">
            Password
          </label>
          <input
            id="auth-login-password"
            v-model="loginPassword"
            type="password"
            class="form-input"
            placeholder="••••••••••••"
            required
          />
        </div>

        <div
          v-if="loginError"
          class="form-error"
          style="margin-bottom: 12px;"
          role="alert"
        >
          {{ loginError }}
        </div>

        <button
          type="submit"
          class="btn-primary"
          style="width: 100%;"
          :disabled="loginSubmitting"
        >
          {{ loginSubmitting ? 'Authenticating...' : 'Sign In to Workspace →' }}
        </button>

        <!-- Instant 1-Click Demo Credentials for Testing Customer vs Admin E2E -->
        <div
          style="
            margin-top: 22px;
            padding-top: 18px;
            border-top: 1px solid var(--border-hairline);
          "
        >
          <div class="form-label" style="margin-bottom: 10px;">
            Instant 1-Click Verified Sessions (Customer Vault &amp; Admin Ops):
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <button
              type="button"
              class="btn-secondary"
              style="width: 100%; justify-content: space-between; padding: 10px 14px; font-size: 0.8125rem;"
              @click="quickDemoSignIn('marcus.vance@apexquant.io', 'dashboard')"
            >
              <span>Customer: Marcus Vance (2 Licenses)</span>
              <span class="mono" style="color: var(--accent-emerald-bright); font-size: 0.75rem;">
                Customer Vault →
              </span>
            </button>
            <button
              type="button"
              class="btn-secondary"
              style="width: 100%; justify-content: space-between; padding: 10px 14px; font-size: 0.8125rem;"
              @click="quickDemoSignIn('elena.rostova@zurichprop.ch', 'dashboard')"
            >
              <span>Customer: Elena Rostova (Trinity Lifetime)</span>
              <span class="mono" style="color: var(--accent-emerald-bright); font-size: 0.75rem;">
                Customer Vault →
              </span>
            </button>
            <button
              type="button"
              class="btn-secondary"
              style="width: 100%; justify-content: space-between; padding: 10px 14px; font-size: 0.8125rem;"
              @click="quickDemoSignIn('admin@stratedgealgo.com', 'admin')"
            >
              <span>Admin Ops: Managing Partner</span>
              <span class="mono" style="color: var(--accent-sky); font-size: 0.75rem;">
                Admin Console →
              </span>
            </button>
          </div>
        </div>
      </form>

      <!-- TAB 2: CREATE ACCOUNT / SIGN UP -->
      <form
        v-else
        novalidate
        @submit.prevent="handleRegisterSubmit"
      >
        <div class="form-row-2">
          <div class="form-field">
            <label for="auth-reg-name" class="form-label">Full Name</label>
            <input
              id="auth-reg-name"
              v-model="regName"
              type="text"
              class="form-input"
              placeholder="Alex Mercer"
              required
            />
          </div>

          <div class="form-field">
            <label for="auth-reg-email" class="form-label">Email Address</label>
            <input
              id="auth-reg-email"
              v-model="regEmail"
              type="email"
              class="form-input"
              placeholder="alex@mercerquant.io"
              required
            />
          </div>
        </div>

        <div class="form-row-2">
          <div class="form-field">
            <label for="auth-reg-tv" class="form-label">
              TradingView Username
            </label>
            <input
              id="auth-reg-tv"
              v-model="regTvUsername"
              type="text"
              class="form-input mono"
              placeholder="AlexMercer_NQ"
              required
            />
            <span class="form-hint">For automatic Invite-Only script whitelisting</span>
          </div>

          <div class="form-field">
            <label for="auth-reg-tos" class="form-label">
              thinkorswim Account ID (Optional)
            </label>
            <input
              id="auth-reg-tos"
              v-model="regTosAccount"
              type="text"
              class="form-input mono"
              placeholder="TOS-884120"
            />
            <span class="form-hint">Embedded in your .ts study watermark</span>
          </div>
        </div>

        <div class="form-row-2">
          <div class="form-field">
            <label for="auth-reg-password" class="form-label">Password</label>
            <input
              id="auth-reg-password"
              v-model="regPassword"
              type="password"
              class="form-input"
              placeholder="Min. 6 characters"
              required
            />
          </div>

          <div class="form-field">
            <label for="auth-reg-role" class="form-label">Account Role</label>
            <select
              id="auth-reg-role"
              v-model="regRole"
              class="form-select"
            >
              <option value="customer">Customer / Prop Trader</option>
              <option value="admin">Operations Administrator</option>
            </select>
          </div>
        </div>

        <div
          v-if="regError"
          class="form-error"
          style="margin-bottom: 12px;"
          role="alert"
        >
          {{ regError }}
        </div>

        <button
          type="submit"
          class="btn-primary"
          style="width: 100%;"
          :disabled="regSubmitting"
        >
          {{
            regSubmitting
              ? 'Creating Membership Account...'
              : 'Create Account & Access Member Dashboard →'
          }}
        </button>
      </form>
    </div>
  </div>
</template>
