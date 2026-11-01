import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const indicatorsTable = sqliteTable('indicators', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  tagline: text('tagline').notNull(),
  category: text('category').notNull(), // 'Scalping' | 'Day Trading' | 'Swing Trading' | 'Full Suite'
  platforms: text('platforms').notNull(), // JSON string: ['TradingView', 'thinkorswim']
  priceMonthly: real('price_monthly').notNull(),
  priceAnnual: real('price_annual').notNull(),
  priceLifetime: real('price_lifetime').notNull(),
  winRatePct: real('win_rate_pct').notNull(),
  profitFactor: real('profit_factor').notNull(),
  sharpeRatio: real('sharpe_ratio').notNull(),
  maxDrawdownPct: real('max_drawdown_pct').notNull(),
  signalsPerDay: text('signals_per_day').notNull(),
  timeframes: text('timeframes').notNull(),
  markets: text('markets').notNull(),
  version: text('version').notNull(),
  tosShareLink: text('tos_share_link').notNull(),
  tosStudyFilename: text('tos_study_filename').notNull(),
  tvScriptId: text('tv_script_id').notNull(),
  description: text('description').notNull(),
  thinkScriptCode: text('thinkscript_code').notNull(),
  pineScriptPreview: text('pinescript_preview').notNull(),
});

export const usersTable = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role').notNull().default('customer'), // 'customer' | 'admin'
  tradingViewUsername: text('tradingview_username').notNull().default(''),
  thinkorswimAccountId: text('thinkorswim_account_id').notNull().default(''),
  createdAt: text('created_at').notNull(),
});

export const licensesTable = sqliteTable('licenses', {
  id: text('id').primaryKey(),
  licenseKey: text('license_key').notNull().unique(),
  userId: text('user_id').notNull(),
  customerEmail: text('customer_email').notNull(),
  customerName: text('customer_name').notNull(),
  indicatorId: text('indicator_id').notNull(),
  indicatorName: text('indicator_name').notNull(),
  billingCycle: text('billing_cycle').notNull(), // 'Monthly' | 'Annual' | 'Lifetime'
  amountPaid: real('amount_paid').notNull(),
  tradingViewUsername: text('tradingview_username').notNull(),
  tvAccessStatus: text('tv_access_status').notNull(), // 'Provisioned' | 'Pending Username' | 'Revoked'
  tosDownloadCount: integer('tos_download_count').notNull().default(0),
  tosShareLink: text('tos_share_link').notNull(),
  tosStudyFilename: text('tos_study_filename').notNull(),
  provisionedAt: text('provisioned_at').notNull(),
  expiresAt: text('expires_at').notNull(),
});

export const webhookLogsTable = sqliteTable('webhook_logs', {
  id: text('id').primaryKey(),
  eventType: text('event_type').notNull(),
  licenseKey: text('license_key').notNull(),
  customerEmail: text('customer_email').notNull(),
  tradingViewUsername: text('tradingview_username').notNull(),
  platformTarget: text('platform_target').notNull(),
  status: text('status').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  payloadSummary: text('payload_summary').notNull(),
  createdAt: text('created_at').notNull(),
});
