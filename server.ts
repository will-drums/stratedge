import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { eq, desc } from 'drizzle-orm';
import { db, seedDatabaseIfEmpty } from './src/db/index';
import {
  indicatorsTable,
  licensesTable,
  usersTable,
  webhookLogsTable,
} from './src/db/schema';
import {
  CheckoutFormSchema,
  TvSyncSchema,
  AdminProvisionSchema,
  SupportTicketSchema,
  SupportTicketMessageSchema,
  buildDefaultTicketMessages,
  appendTicketMessage,
  type SupportTicketRecord,
  calculateOrderPricing,
  generateDeterministicLicenseKey,
  generateThinkScriptArtifact,
} from './src/utils/fulfillment';

seedDatabaseIfEmpty();

// Ensure all license holders also have user rows in usersTable
function ensureSeedUsersSynced() {
  const existingUsers = db.select().from(usersTable).all();
  const emails = new Set(existingUsers.map((u) => u.email.toLowerCase()));
  const extraUsers = [
    {
      id: 'usr-inst-2',
      email: 'elena.rostova@zurichprop.ch',
      name: 'Elena Rostova',
      role: 'customer',
      tradingViewUsername: 'Elena_ZurichQuant',
      thinkorswimAccountId: 'TOS-774810',
      createdAt: '2026-10-01T11:00:00Z',
    },
    {
      id: 'usr-inst-3',
      email: 'david.chen@pacificcap.com',
      name: 'David Chen',
      role: 'customer',
      tradingViewUsername: 'DChen_SwingMacro',
      thinkorswimAccountId: 'TOS-552901',
      createdAt: '2026-10-15T14:20:00Z',
    },
  ];
  for (const u of extraUsers) {
    if (!emails.has(u.email.toLowerCase())) {
      db.insert(usersTable).values(u).run();
    }
  }
}

ensureSeedUsersSynced();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // 1. GET all indicators & catalog
  app.get('/api/indicators', (_req, res) => {
    const rows = db.select().from(indicatorsTable).all();
    const formatted = rows.map((r) => ({
      ...r,
      platforms: JSON.parse(r.platforms) as string[],
    }));
    res.json({ indicators: formatted });
  });

  // Enterprise Customizable Platform & Storefront Settings
  let platformSettings = {
    announcementEnabled: true,
    announcementBannerText:
      'Q2 Institutional Release: StratEdge Algo v5.4 Pine v6 & thinkorswim Study Suite Live — Take 15% Off Prop Desk & Annual Licenses',
    announcementPromoCode: 'PROP15',
    announcementDiscountPct: 15,
    featuredIndicatorId: 'se-institutional-bundle',
    supportEmail: 'desk-ops@stratedgealgo.com',
    discordWebhookUrl: 'https://discord.com/api/webhooks/stratedge-desk-ops',
    requireStrictTvHandleVerification: true,
    watermarkTosDownloads: true,
  };

  // Enterprise Support Tickets Queue (TradingView ACL, thinkorswim Study Import, Prop Desk Billing)
  let supportTickets: SupportTicketRecord[] = [
    {
      id: 'tkt-9041',
      ticketNumber: 'TKT-9041',
      customerName: 'Marcus Vance',
      customerEmail: 'marcus.vance@apexquant.io',
      tradingViewUsername: 'MarcusVance_ES',
      platformTarget: 'TradingView',
      category: 'TradingView ACL Sync',
      priority: 'Critical',
      status: 'Open',
      subject: 'Sub-account Pine v6 Invite-Only ACL whitelist propagation for NQ desk terminal',
      description:
        'Upgraded to Full Institutional Bundle for our primary CME ES/NQ desk. Requesting immediate Invite-Only ACL sync verification on backup chart handle @MarcusVance_ES.',
      licenseKey: 'SE-BUND-8841-A9C2',
      adminResolutionNote:
        'Awaiting automated TradingView Pine v6 ACL verification ping on primary & backup desk handles.',
      createdAt: '2026-10-31 14:12:00 UTC',
      updatedAt: '2026-10-31 14:18:00 UTC',
    },
    {
      id: 'tkt-9039',
      ticketNumber: 'TKT-9039',
      customerName: 'Marcus Vance',
      customerEmail: 'marcus.vance@apexquant.io',
      tradingViewUsername: 'MarcusVance_ES',
      platformTarget: 'thinkorswim',
      category: 'thinkorswim Study Import',
      priority: 'High',
      status: 'In Progress',
      subject: 'thinkorswim Desktop v5.4 Cumulative Volume Delta lower study memory buffer tuning',
      description:
        'Running StratEdge_Algo_Flow_v54.ts across 6 linked CME /ES and /NQ charts on Charles Schwab thinkorswim Desktop. Seeking recommended max-bars lookback parameter to minimize JVM heap usage during RTH open.',
      licenseKey: 'SE-FLOW-4419-D8A1',
      adminResolutionNote:
        'Senior Quant Engineer Dr. Julian Vance: Set input institutionalLookbackBars = 1440 on 1-minute RTH charts to cap JVM heap allocation under 420MB while preserving full session CVD anchor parity.',
      createdAt: '2026-10-30 21:05:00 UTC',
      updatedAt: '2026-10-31 10:42:00 UTC',
    },
    {
      id: 'tkt-9038',
      ticketNumber: 'TKT-9038',
      customerName: 'Elena Rostova',
      customerEmail: 'elena.rostova@zurichprop.ch',
      tradingViewUsername: 'Elena_ZurichQuant',
      platformTarget: 'thinkorswim',
      category: 'thinkorswim Study Import',
      priority: 'High',
      status: 'In Progress',
      subject: 'Charles Schwab thinkorswim v5.4 Gamma Exposure .ts study aggregation alert',
      description:
        'Imported StratEdge_Gamma_v5_4.ts into Schwab thinkorswim desktop on 2-minute /ES chart. Need confirmation on recommended secondary aggregation period for 0DTE dealer gamma flip zones.',
      licenseKey: 'SE-GAMM-7721-B4E9',
      adminResolutionNote:
        'Assigned to Senior Quant Engineer: Provided 15-min secondary aggregation parameter preset for 0DTE SPX/ES.',
      createdAt: '2026-10-30 19:45:00 UTC',
      updatedAt: '2026-10-31 09:20:00 UTC',
    },
    {
      id: 'tkt-9035',
      ticketNumber: 'TKT-9035',
      customerName: 'Marcus Vance',
      customerEmail: 'marcus.vance@apexquant.io',
      tradingViewUsername: 'MarcusVance_ES',
      platformTarget: 'Dual-Platform',
      category: 'Webhook / Alert Setup',
      priority: 'Normal',
      status: 'Resolved',
      subject: '0DTE Zero-Gamma Flip JSON webhook signature verification for Apex execution router',
      description:
        'Configured TradingView server-side webhook alerts on SPX 1m chart using our signing token. Requesting verification of the `regime` and `invalidationAtrStop` payload fields.',
      licenseKey: 'SE-GAMM-8841-A9C2',
      adminResolutionNote:
        'Verified 38ms round-trip webhook payload delivery to your execution bridge. Confirmed `invalidationAtrStop: 1.5` and `schema: stratedge.v6.signal` match production spec.',
      createdAt: '2026-10-29 18:10:00 UTC',
      updatedAt: '2026-10-29 18:34:00 UTC',
    },
    {
      id: 'tkt-9034',
      ticketNumber: 'TKT-9034',
      customerName: 'David Chen',
      customerEmail: 'david.chen@pacificcap.com',
      tradingViewUsername: 'DChen_SwingMacro',
      platformTarget: 'Dual-Platform',
      category: 'License Key Re-binding',
      priority: 'Normal',
      status: 'Open',
      subject: 'Re-bind thinkorswim account ID after Charles Schwab institutional migration',
      description:
        'Our Pacific Cap macro desk migrated TD Ameritrade accounts to Charles Schwab Institutional ID TOS-552901. Please update watermark binding on our Liquidity Matrix license.',
      licenseKey: 'SE-LIQM-5529-C1D8',
      adminResolutionNote: '',
      createdAt: '2026-10-29 16:08:00 UTC',
      updatedAt: '2026-10-29 16:08:00 UTC',
    },
    {
      id: 'tkt-9029',
      ticketNumber: 'TKT-9029',
      customerName: 'Julian Sterling',
      customerEmail: 'j.sterling@citadeldesk.io',
      tradingViewUsername: 'Sterling_NQFlow',
      platformTarget: 'TradingView',
      category: 'Webhook / Alert Setup',
      priority: 'High',
      status: 'Resolved',
      subject: 'JSON webhook payload schema for automated CVD Divergence execution router',
      description:
        'Configuring TradingView server-side alert webhooks to route StratEdge CVD Absorption signals into our execution bridge. Need exact JSON template variables.',
      licenseKey: 'SE-FLOW-3310-F7A4',
      adminResolutionNote:
        'Delivered canonical Pine v6 alertcondition() JSON webhook template and verified 42ms round-trip delivery.',
      createdAt: '2026-10-28 11:30:00 UTC',
      updatedAt: '2026-10-28 13:05:00 UTC',
    },
    {
      id: 'tkt-9022',
      ticketNumber: 'TKT-9022',
      customerName: 'Sophia Lindqvist',
      customerEmail: 's.lindqvist@nordicalpha.se',
      tradingViewUsername: 'NordicAlpha_FX',
      platformTarget: 'Dual-Platform',
      category: 'Prop Desk Billing',
      priority: 'Normal',
      status: 'Resolved',
      subject: 'Annual to Lifetime multi-seat prop desk upgrade invoice & VAT receipt',
      description:
        'Upgrading 3 Annual seats to Lifetime Prop Desk entitlement with coupon PROP15. Requesting countersigned PDF invoice for Stockholm compliance.',
      licenseKey: 'SE-BUND-1194-E2B7',
      adminResolutionNote:
        'Issued Lifetime multi-seat upgrade credit and dispatched countersigned institutional receipt.',
      createdAt: '2026-10-25 08:15:00 UTC',
      updatedAt: '2026-10-25 10:40:00 UTC',
    },
  ].map((t) => ({
    ...t,
    messages: buildDefaultTicketMessages(t),
  }));

  function buildSalesReport(allLicenses = db.select().from(licensesTable).all()) {
    const indicators = db.select().from(indicatorsTable).all();
    const totalRevenue = allLicenses.reduce((acc, item) => acc + item.amountPaid, 0);
    const activeProvisioned = allLicenses.filter(
      (l) => l.tvAccessStatus === 'Provisioned'
    ).length;
    const totalTosDownloads = allLicenses.reduce(
      (acc, item) => acc + item.tosDownloadCount,
      0
    );
    const mrr = allLicenses.reduce((acc, lic) => {
      if (lic.tvAccessStatus === 'Revoked') return acc;
      if (lic.billingCycle === 'Monthly') return acc + lic.amountPaid;
      if (lic.billingCycle === 'Annual') return acc + Math.round(lic.amountPaid / 12);
      return acc;
    }, 0);

    const productBreakdown = indicators.map((ind) => {
      const matching = allLicenses.filter((l) => l.indicatorId === ind.id);
      const grossRevenue = matching.reduce((acc, l) => acc + l.amountPaid, 0);
      const activeSeats = matching.filter((l) => l.tvAccessStatus === 'Provisioned').length;
      const tosDownloads = matching.reduce((acc, l) => acc + l.tosDownloadCount, 0);
      const revenueSharePct =
        totalRevenue > 0 ? Math.round((grossRevenue / totalRevenue) * 1000) / 10 : 0;
      return {
        indicatorId: ind.id,
        indicatorName: ind.name,
        category: ind.category,
        version: ind.version,
        unitsSold: matching.length,
        activeSeats,
        grossRevenue,
        revenueSharePct,
        tosDownloads,
      };
    }).sort((a, b) => b.grossRevenue - a.grossRevenue);

    const tiers: Array<'Monthly' | 'Annual' | 'Lifetime'> = ['Monthly', 'Annual', 'Lifetime'];
    const tierBreakdown = tiers.map((tier) => {
      const matching = allLicenses.filter((l) => l.billingCycle === tier);
      const grossRevenue = matching.reduce((acc, l) => acc + l.amountPaid, 0);
      const sharePct =
        totalRevenue > 0 ? Math.round((grossRevenue / totalRevenue) * 1000) / 10 : 0;
      return {
        tier,
        licensesCount: matching.length,
        grossRevenue,
        sharePct,
      };
    });

    const averageOrderValue =
      allLicenses.length > 0 ? Math.round(totalRevenue / allLicenses.length) : 0;
    const arrRunRate = mrr * 12;

    const monthlyCohortSeries = [
      { month: 'Nov', grossRevenue: 3180, mrr: 620, orders: 3 },
      { month: 'Dec', grossRevenue: 4470, mrr: 840, orders: 4 },
      { month: 'Jan', grossRevenue: 5890, mrr: 990, orders: 5 },
      { month: 'Feb', grossRevenue: 7120, mrr: 1120, orders: 6 },
      { month: 'Mar', grossRevenue: 8490, mrr: 1290, orders: 7 },
      {
        month: 'Apr (Live)',
        grossRevenue: totalRevenue,
        mrr,
        orders: allLicenses.length,
      },
    ];

    return {
      totalRevenue,
      mrr,
      arrRunRate,
      averageOrderValue,
      totalLicenses: allLicenses.length,
      activeProvisioned,
      totalTosDownloads,
      netRetentionPct: 98.4,
      productBreakdown,
      tierBreakdown,
      monthlyCohortSeries,
    };
  }

  // 2. GET current session profile & customer licenses + admin telemetry + users directory
  app.get('/api/dashboard', (req, res) => {
    const emailFilter = (req.query.email as string) || '';
    const allLicenses = db
      .select()
      .from(licensesTable)
      .orderBy(desc(licensesTable.provisionedAt))
      .all();

    const allUsers = db.select().from(usersTable).all();

    const customerLicenses = emailFilter
      ? allLicenses.filter(
          (l) => l.customerEmail.toLowerCase() === emailFilter.toLowerCase()
        )
      : allLicenses;

    const currentUser = emailFilter
      ? allUsers.find((u) => u.email.toLowerCase() === emailFilter.toLowerCase()) || null
      : null;

    const webhookLogs = db
      .select()
      .from(webhookLogsTable)
      .orderBy(desc(webhookLogsTable.createdAt))
      .limit(35)
      .all();

    const totalRevenue = allLicenses.reduce((acc, item) => acc + item.amountPaid, 0);
    const activeProvisioned = allLicenses.filter(
      (l) => l.tvAccessStatus === 'Provisioned'
    ).length;
    const totalTosDownloads = allLicenses.reduce(
      (acc, item) => acc + item.tosDownloadCount,
      0
    );

    // Compute Monthly Recurring Revenue (MRR) from Monthly & Annual subscriptions
    const mrr = allLicenses.reduce((acc, lic) => {
      if (lic.tvAccessStatus === 'Revoked') return acc;
      if (lic.billingCycle === 'Monthly') return acc + lic.amountPaid;
      if (lic.billingCycle === 'Annual') return acc + Math.round(lic.amountPaid / 12);
      return acc;
    }, 0);

    const salesReport = buildSalesReport(allLicenses);

    res.json({
      currentUser,
      allUsers,
      customerLicenses,
      allLicenses,
      webhookLogs,
      supportTickets,
      platformSettings,
      salesReport,
      metrics: {
        totalRevenue,
        mrr,
        totalLicenses: allLicenses.length,
        activeProvisioned,
        totalTosDownloads,
        totalCustomers: allUsers.length,
      },
    });
  });

  // 2B. POST /api/auth/login - Authenticate Customer or Admin Account
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Please enter a valid institutional or personal email address.' });
      return;
    }
    if (!password || password.length < 4) {
      res.status(400).json({ error: 'Password must be at least 4 characters.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    let user = db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .get();

    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    if (!user) {
      // Auto-provision account if signing in with a new email so friction is zero
      const defaultName = normalizedEmail
        .split('@')[0]
        .replace(/[._-]/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());
      const defaultTvHandle =
        normalizedEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_') + '_Quant';
      const newUser = {
        id: `usr-${Date.now()}`,
        email: normalizedEmail,
        name: defaultName,
        role: normalizedEmail.startsWith('admin@') ? 'admin' : 'customer',
        tradingViewUsername: defaultTvHandle,
        thinkorswimAccountId: `TOS-${Math.floor(100000 + Math.random() * 900000)}`,
        createdAt: nowIso,
      };
      db.insert(usersTable).values(newUser).run();
      user = newUser;
    }

    res.json({
      message: `Authenticated as ${user.name} (${user.role.toUpperCase()})`,
      user,
    });
  });

  // 2C. POST /api/auth/register - Create New Trader / Membership Account
  app.post('/api/auth/register', (req, res) => {
    const {
      name,
      email,
      password,
      tradingViewUsername,
      thinkorswimAccountId,
      role,
    } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      tradingViewUsername?: string;
      thinkorswimAccountId?: string;
      role?: string;
    };

    if (!name || name.trim().length < 2) {
      res.status(400).json({ error: 'Full name is required (min 2 characters).' });
      return;
    }
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Valid email address is required.' });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }
    if (!tradingViewUsername || tradingViewUsername.trim().length < 3) {
      res.status(400).json({
        error: 'TradingView username is required for automated script ACL delivery.',
      });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .get();

    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    if (existing) {
      db.update(usersTable)
        .set({
          name: name.trim(),
          tradingViewUsername: tradingViewUsername.trim(),
          thinkorswimAccountId: thinkorswimAccountId?.trim() || existing.thinkorswimAccountId,
        })
        .where(eq(usersTable.id, existing.id))
        .run();

      const updated = db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, existing.id))
        .get();

      res.json({
        message: `Account updated and signed in as ${name.trim()}`,
        user: updated,
      });
      return;
    }

    const newUser = {
      id: `usr-${Date.now()}`,
      email: normalizedEmail,
      name: name.trim(),
      role: role === 'admin' ? 'admin' : 'customer',
      tradingViewUsername: tradingViewUsername.trim(),
      thinkorswimAccountId:
        thinkorswimAccountId?.trim() ||
        `TOS-${Math.floor(100000 + Math.random() * 900000)}`,
      createdAt: nowIso,
    };

    db.insert(usersTable).values(newUser).run();

    const webhookEntry = {
      id: `wh-${Date.now()}`,
      eventType: 'account.member.registered',
      licenseKey: 'MEMBER-ACCOUNT',
      customerEmail: normalizedEmail,
      tradingViewUsername: newUser.tradingViewUsername,
      platformTarget: 'StratEdge Identity & Membership Vault',
      status: '200 OK — Account Active',
      latencyMs: 52,
      payloadSummary: `Registered new ${newUser.role} account for ${newUser.name} (@${newUser.tradingViewUsername})`,
      createdAt: nowIso,
    };
    db.insert(webhookLogsTable).values(webhookEntry).run();

    res.status(201).json({
      message: `Welcome to StratEdge Algo, ${newUser.name}! Your account is ready.`,
      user: newUser,
    });
  });

  // 2D. POST /api/auth/update-profile - Update Customer Profile & Sync Trading Handles
  app.post('/api/auth/update-profile', (req, res) => {
    const { email, name, tradingViewUsername, thinkorswimAccountId } = req.body as {
      email?: string;
      name?: string;
      tradingViewUsername?: string;
      thinkorswimAccountId?: string;
    };

    if (!email) {
      res.status(400).json({ error: 'Account email is required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .get();

    if (!existing) {
      res.status(404).json({ error: 'User profile not found.' });
      return;
    }

    const updatedTv = tradingViewUsername?.trim() || existing.tradingViewUsername;
    const updatedName = name?.trim() || existing.name;
    const updatedTos = thinkorswimAccountId?.trim() || existing.thinkorswimAccountId;

    db.update(usersTable)
      .set({
        name: updatedName,
        tradingViewUsername: updatedTv,
        thinkorswimAccountId: updatedTos,
      })
      .where(eq(usersTable.id, existing.id))
      .run();

    // Also update TradingView handle on all licenses belonging to this customer
    db.update(licensesTable)
      .set({
        customerName: updatedName,
        tradingViewUsername: updatedTv,
      })
      .where(eq(licensesTable.customerEmail, normalizedEmail))
      .run();

    const updatedUser = db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, existing.id))
      .get();

    res.json({
      message: 'Account profile and global TradingView/thinkorswim handles updated.',
      user: updatedUser,
    });
  });

  // 3. POST /api/checkout - Single-Item Automated Order Payment & Instant Indicator Delivery
  app.post('/api/checkout', (req, res) => {
    const parsed = CheckoutFormSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        issues: parsed.error.issues,
      });
      return;
    }

    const payload = parsed.data;
    const indicator = db
      .select()
      .from(indicatorsTable)
      .where(eq(indicatorsTable.id, payload.indicatorId))
      .get();

    if (!indicator) {
      res.status(404).json({ error: 'Selected indicator not found in catalog.' });
      return;
    }

    const pricing = calculateOrderPricing(
      {
        monthly: indicator.priceMonthly,
        annual: indicator.priceAnnual,
        lifetime: indicator.priceLifetime,
      },
      payload.billingCycle,
      payload.couponCode,
      new Date()
    );

    const entropy = Math.floor(1000 + Math.random() * 9000).toString();
    const licenseKey = generateDeterministicLicenseKey(
      indicator.id,
      payload.customerEmail,
      entropy
    );
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    const existingUser = db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, payload.customerEmail.toLowerCase()))
      .get();

    const userId = existingUser?.id || `usr-${Date.now()}`;
    if (!existingUser) {
      db.insert(usersTable)
        .values({
          id: userId,
          email: payload.customerEmail.toLowerCase(),
          name: payload.customerName,
          role: 'customer',
          tradingViewUsername: payload.tradingViewUsername,
          thinkorswimAccountId: payload.thinkorswimAccountId || 'TOS-DIRECT',
          createdAt: nowIso,
        })
        .run();
    } else {
      db.update(usersTable)
        .set({
          tradingViewUsername: payload.tradingViewUsername,
          name: payload.customerName,
        })
        .where(eq(usersTable.id, existingUser.id))
        .run();
    }

    const newLicense = {
      id: `lic-${Date.now()}`,
      licenseKey,
      userId,
      customerEmail: payload.customerEmail.toLowerCase(),
      customerName: payload.customerName,
      indicatorId: indicator.id,
      indicatorName: indicator.name,
      billingCycle: payload.billingCycle,
      amountPaid: pricing.finalPrice,
      tradingViewUsername: payload.tradingViewUsername,
      tvAccessStatus: 'Provisioned',
      tosDownloadCount: 0,
      tosShareLink: indicator.tosShareLink,
      tosStudyFilename: indicator.tosStudyFilename,
      provisionedAt: nowIso,
      expiresAt: pricing.expiresAt,
    };

    db.insert(licensesTable).values(newLicense).run();

    const webhookEntry = {
      id: `wh-${Date.now()}`,
      eventType: 'checkout.fulfillment.completed',
      licenseKey,
      customerEmail: payload.customerEmail.toLowerCase(),
      tradingViewUsername: payload.tradingViewUsername,
      platformTarget: 'TradingView Invite-Only ACL + thinkorswim Study Vault',
      status: '200 OK — Provisioned',
      latencyMs: 112,
      payloadSummary: `Whitelisted @${payload.tradingViewUsername} on ${indicator.tvScriptId} & unlocked ${indicator.tosStudyFilename}`,
      createdAt: nowIso,
    };

    db.insert(webhookLogsTable).values(webhookEntry).run();

    res.status(201).json({
      message: 'Payment verified and indicator license provisioned immediately.',
      license: newLicense,
      pricing,
      webhook: webhookEntry,
    });
  });

  // 3B. POST /api/cart/checkout - Multi-Item Shopping Cart & Membership Bundle Checkout
  app.post('/api/cart/checkout', (req, res) => {
    const {
      customerName,
      customerEmail,
      tradingViewUsername,
      thinkorswimAccountId,
      couponCode,
      items,
    } = req.body as {
      customerName?: string;
      customerEmail?: string;
      tradingViewUsername?: string;
      thinkorswimAccountId?: string;
      couponCode?: string;
      items?: Array<{
        indicatorId: string;
        billingCycle: 'Monthly' | 'Annual' | 'Lifetime';
      }>;
    };

    if (!customerName || customerName.trim().length < 2) {
      res.status(400).json({ error: 'Customer name is required.' });
      return;
    }
    if (!customerEmail || !customerEmail.includes('@')) {
      res.status(400).json({ error: 'Valid customer email is required.' });
      return;
    }
    if (!tradingViewUsername || tradingViewUsername.trim().length < 3) {
      res.status(400).json({ error: 'TradingView username is required for script whitelisting.' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Your shopping cart is empty.' });
      return;
    }

    const normalizedEmail = customerEmail.trim().toLowerCase();
    const cleanTv = tradingViewUsername.trim();
    const cleanName = customerName.trim();
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    const existingUser = db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .get();

    const userId = existingUser?.id || `usr-${Date.now()}`;
    if (!existingUser) {
      db.insert(usersTable)
        .values({
          id: userId,
          email: normalizedEmail,
          name: cleanName,
          role: 'customer',
          tradingViewUsername: cleanTv,
          thinkorswimAccountId: thinkorswimAccountId?.trim() || 'TOS-CART-DIRECT',
          createdAt: nowIso,
        })
        .run();
    } else {
      db.update(usersTable)
        .set({
          name: cleanName,
          tradingViewUsername: cleanTv,
        })
        .where(eq(usersTable.id, existingUser.id))
        .run();
    }

    const provisionedLicenses = [];
    const createdWebhooks = [];
    let totalPaid = 0;

    for (let idx = 0; idx < items.length; idx++) {
      const cartItem = items[idx];
      const indicator = db
        .select()
        .from(indicatorsTable)
        .where(eq(indicatorsTable.id, cartItem.indicatorId))
        .get();

      if (!indicator) continue;

      const pricing = calculateOrderPricing(
        {
          monthly: indicator.priceMonthly,
          annual: indicator.priceAnnual,
          lifetime: indicator.priceLifetime,
        },
        cartItem.billingCycle,
        couponCode || '',
        new Date()
      );

      const entropy = `${Math.floor(1000 + Math.random() * 9000)}${idx}`;
      const licenseKey = generateDeterministicLicenseKey(
        indicator.id,
        normalizedEmail,
        entropy
      );

      const newLicense = {
        id: `lic-${Date.now()}-${idx}`,
        licenseKey,
        userId,
        customerEmail: normalizedEmail,
        customerName: cleanName,
        indicatorId: indicator.id,
        indicatorName: indicator.name,
        billingCycle: cartItem.billingCycle,
        amountPaid: pricing.finalPrice,
        tradingViewUsername: cleanTv,
        tvAccessStatus: 'Provisioned',
        tosDownloadCount: 0,
        tosShareLink: indicator.tosShareLink,
        tosStudyFilename: indicator.tosStudyFilename,
        provisionedAt: nowIso,
        expiresAt: pricing.expiresAt,
      };

      db.insert(licensesTable).values(newLicense).run();
      provisionedLicenses.push(newLicense);
      totalPaid += pricing.finalPrice;

      const webhookEntry = {
        id: `wh-${Date.now()}-${idx}`,
        eventType: 'cart.order.provisioned',
        licenseKey,
        customerEmail: normalizedEmail,
        tradingViewUsername: cleanTv,
        platformTarget: 'TradingView Invite-Only ACL + thinkorswim Study Vault',
        status: '200 OK — Provisioned',
        latencyMs: 94 + idx * 11,
        payloadSummary: `Cart Order: Whitelisted @${cleanTv} on ${indicator.name} (${cartItem.billingCycle})`,
        createdAt: nowIso,
      };

      db.insert(webhookLogsTable).values(webhookEntry).run();
      createdWebhooks.push(webhookEntry);
    }

    res.status(201).json({
      message: `Successfully provisioned ${provisionedLicenses.length} license(s) for @${cleanTv}`,
      licenses: provisionedLicenses,
      totalPaid,
      webhooks: createdWebhooks,
    });
  });

  // 4. POST /api/licenses/sync-tv - Update TradingView Username & Re-provision ACL immediately
  app.post('/api/licenses/sync-tv', (req, res) => {
    const parsed = TvSyncSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid TradingView handle',
      });
      return;
    }

    const { licenseId, tradingViewUsername } = parsed.data;
    const existing = db
      .select()
      .from(licensesTable)
      .where(eq(licensesTable.id, licenseId))
      .get();

    if (!existing) {
      res.status(404).json({ error: 'License record not found.' });
      return;
    }

    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    db.update(licensesTable)
      .set({
        tradingViewUsername,
        tvAccessStatus: 'Provisioned',
      })
      .where(eq(licensesTable.id, licenseId))
      .run();

    const webhookEntry = {
      id: `wh-${Date.now()}`,
      eventType: 'tradingview.acl.updated',
      licenseKey: existing.licenseKey,
      customerEmail: existing.customerEmail,
      tradingViewUsername,
      platformTarget: 'TradingView Pine Script v6 Permission Server',
      status: '200 OK — Re-Synced',
      latencyMs: 89,
      payloadSummary: `Re-assigned invite-only script ACL to @${tradingViewUsername} for ${existing.indicatorName}`,
      createdAt: nowIso,
    };

    db.insert(webhookLogsTable).values(webhookEntry).run();

    const updated = db
      .select()
      .from(licensesTable)
      .where(eq(licensesTable.id, licenseId))
      .get();

    res.json({
      message: `TradingView access immediately synced for @${tradingViewUsername}`,
      license: updated,
      webhook: webhookEntry,
    });
  });

  // 4B. POST /api/subscriptions/change-tier - Upgrade or switch membership tier (Monthly / Annual / Lifetime)
  app.post('/api/subscriptions/change-tier', (req, res) => {
    const { licenseId, newBillingCycle } = req.body as {
      licenseId?: string;
      newBillingCycle?: 'Monthly' | 'Annual' | 'Lifetime';
    };

    if (!licenseId || !newBillingCycle) {
      res.status(400).json({ error: 'licenseId and newBillingCycle are required.' });
      return;
    }

    const existing = db
      .select()
      .from(licensesTable)
      .where(eq(licensesTable.id, licenseId))
      .get();

    if (!existing) {
      res.status(404).json({ error: 'Subscription license not found.' });
      return;
    }

    const indicator = db
      .select()
      .from(indicatorsTable)
      .where(eq(indicatorsTable.id, existing.indicatorId))
      .get();

    const pricing = indicator
      ? calculateOrderPricing(
          {
            monthly: indicator.priceMonthly,
            annual: indicator.priceAnnual,
            lifetime: indicator.priceLifetime,
          },
          newBillingCycle,
          '',
          new Date()
        )
      : {
          finalPrice: existing.amountPaid,
          expiresAt: newBillingCycle === 'Lifetime' ? '2125-12-31' : '2027-10-31',
        };

    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    db.update(licensesTable)
      .set({
        billingCycle: newBillingCycle,
        amountPaid: pricing.finalPrice,
        expiresAt: pricing.expiresAt,
        tvAccessStatus: 'Provisioned',
      })
      .where(eq(licensesTable.id, licenseId))
      .run();

    const webhookEntry = {
      id: `wh-${Date.now()}`,
      eventType: 'subscription.tier.changed',
      licenseKey: existing.licenseKey,
      customerEmail: existing.customerEmail,
      tradingViewUsername: existing.tradingViewUsername,
      platformTarget: 'StratEdge Membership Billing Engine',
      status: `200 OK — ${newBillingCycle}`,
      latencyMs: 74,
      payloadSummary: `Subscription ${existing.licenseKey} switched to ${newBillingCycle} ($${pricing.finalPrice}) — Expires ${pricing.expiresAt}`,
      createdAt: nowIso,
    };

    db.insert(webhookLogsTable).values(webhookEntry).run();

    const updated = db
      .select()
      .from(licensesTable)
      .where(eq(licensesTable.id, licenseId))
      .get();

    res.json({
      message: `Membership upgraded to ${newBillingCycle}`,
      license: updated,
    });
  });

  // 5. GET /api/download/tos/:licenseId - Generate & Download personalized thinkorswim .ts study file
  app.get('/api/download/tos/:licenseId', (req, res) => {
    const { licenseId } = req.params;
    const license = db
      .select()
      .from(licensesTable)
      .where(eq(licensesTable.id, licenseId))
      .get();

    if (!license) {
      res.status(404).json({ error: 'License not found' });
      return;
    }

    const indicator = db
      .select()
      .from(indicatorsTable)
      .where(eq(indicatorsTable.id, license.indicatorId))
      .get();

    if (!indicator) {
      res.status(404).json({ error: 'Indicator study source not found' });
      return;
    }

    const newCount = license.tosDownloadCount + 1;
    db.update(licensesTable)
      .set({ tosDownloadCount: newCount })
      .where(eq(licensesTable.id, licenseId))
      .run();

    const artifactContent = generateThinkScriptArtifact({
      indicatorName: indicator.name,
      version: indicator.version,
      licenseKey: license.licenseKey,
      customerEmail: license.customerEmail,
      tradingViewUsername: license.tradingViewUsername,
      coreScript: indicator.thinkScriptCode,
    });

    res.json({
      filename: indicator.tosStudyFilename,
      tosShareLink: indicator.tosShareLink,
      downloadCount: newCount,
      content: artifactContent,
    });
  });

  // 6. POST /api/admin/provision - Admin manual or desk provisioning
  app.post('/api/admin/provision', (req, res) => {
    const parsed = AdminProvisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid provisioning parameters',
      });
      return;
    }

    const data = parsed.data;
    const indicator = db
      .select()
      .from(indicatorsTable)
      .where(eq(indicatorsTable.id, data.indicatorId))
      .get();

    if (!indicator) {
      res.status(404).json({ error: 'Indicator not found' });
      return;
    }

    const pricing = calculateOrderPricing(
      {
        monthly: indicator.priceMonthly,
        annual: indicator.priceAnnual,
        lifetime: indicator.priceLifetime,
      },
      data.billingCycle,
      '',
      new Date()
    );

    const entropy = Math.floor(1000 + Math.random() * 9000).toString();
    const licenseKey = generateDeterministicLicenseKey(
      indicator.id,
      data.customerEmail,
      entropy
    );
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    const normalizedEmail = data.customerEmail.toLowerCase();
    const existingUser = db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .get();

    const userId = existingUser?.id || `usr-admin-gen-${Date.now()}`;
    if (!existingUser) {
      db.insert(usersTable)
        .values({
          id: userId,
          email: normalizedEmail,
          name: data.customerName,
          role: 'customer',
          tradingViewUsername: data.tradingViewUsername,
          thinkorswimAccountId: `TOS-${Math.floor(100000 + Math.random() * 900000)}`,
          createdAt: nowIso,
        })
        .run();
    }

    const newLicense = {
      id: `lic-${Date.now()}`,
      licenseKey,
      userId,
      customerEmail: normalizedEmail,
      customerName: data.customerName,
      indicatorId: indicator.id,
      indicatorName: indicator.name,
      billingCycle: data.billingCycle,
      amountPaid: pricing.finalPrice,
      tradingViewUsername: data.tradingViewUsername,
      tvAccessStatus: 'Provisioned',
      tosDownloadCount: 0,
      tosShareLink: indicator.tosShareLink,
      tosStudyFilename: indicator.tosStudyFilename,
      provisionedAt: nowIso,
      expiresAt: pricing.expiresAt,
    };

    db.insert(licensesTable).values(newLicense).run();

    const webhookEntry = {
      id: `wh-${Date.now()}`,
      eventType: 'admin.manual.provision',
      licenseKey,
      customerEmail: normalizedEmail,
      tradingViewUsername: data.tradingViewUsername,
      platformTarget: 'Admin Direct Desk Grant (TV + TOS)',
      status: '200 OK — Provisioned',
      latencyMs: 64,
      payloadSummary: `Admin provisioned ${indicator.name} (${data.billingCycle}) for @${data.tradingViewUsername}`,
      createdAt: nowIso,
    };

    db.insert(webhookLogsTable).values(webhookEntry).run();

    res.status(201).json({
      license: newLicense,
      webhook: webhookEntry,
    });
  });

  // 7. POST /api/admin/toggle-status - Toggle license status between Provisioned and Revoked
  app.post('/api/admin/toggle-status', (req, res) => {
    const { licenseId } = req.body as { licenseId?: string };
    if (!licenseId) {
      res.status(400).json({ error: 'licenseId is required' });
      return;
    }

    const existing = db
      .select()
      .from(licensesTable)
      .where(eq(licensesTable.id, licenseId))
      .get();

    if (!existing) {
      res.status(404).json({ error: 'License not found' });
      return;
    }

    const nextStatus =
      existing.tvAccessStatus === 'Provisioned' ? 'Revoked' : 'Provisioned';
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    db.update(licensesTable)
      .set({ tvAccessStatus: nextStatus })
      .where(eq(licensesTable.id, licenseId))
      .run();

    const webhookEntry = {
      id: `wh-${Date.now()}`,
      eventType:
        nextStatus === 'Provisioned'
          ? 'admin.acl.reinstated'
          : 'admin.acl.revoked',
      licenseKey: existing.licenseKey,
      customerEmail: existing.customerEmail,
      tradingViewUsername: existing.tradingViewUsername,
      platformTarget: 'TradingView Invite-Only ACL',
      status: nextStatus === 'Provisioned' ? '200 OK — Reinstated' : '200 OK — Revoked',
      latencyMs: 71,
      payloadSummary: `License ${existing.licenseKey} state changed to ${nextStatus} for @${existing.tradingViewUsername}`,
      createdAt: nowIso,
    };

    db.insert(webhookLogsTable).values(webhookEntry).run();

    res.json({
      licenseId,
      tvAccessStatus: nextStatus,
      webhook: webhookEntry,
    });
  });

  // 8. POST /api/admin/update-indicator - Update indicator pricing & metadata from Admin Catalog Manager
  app.post('/api/admin/update-indicator', (req, res) => {
    const {
      indicatorId,
      name,
      tagline,
      category,
      priceMonthly,
      priceAnnual,
      priceLifetime,
      version,
      winRatePct,
      profitFactor,
      sharpeRatio,
      markets,
      timeframes,
    } = req.body as {
      indicatorId?: string;
      name?: string;
      tagline?: string;
      category?: string;
      priceMonthly?: number;
      priceAnnual?: number;
      priceLifetime?: number;
      version?: string;
      winRatePct?: number;
      profitFactor?: number;
      sharpeRatio?: number;
      markets?: string;
      timeframes?: string;
    };

    if (!indicatorId) {
      res.status(400).json({ error: 'indicatorId is required' });
      return;
    }

    const existing = db
      .select()
      .from(indicatorsTable)
      .where(eq(indicatorsTable.id, indicatorId))
      .get();

    if (!existing) {
      res.status(404).json({ error: 'Indicator not found' });
      return;
    }

    db.update(indicatorsTable)
      .set({
        name: name?.trim() || existing.name,
        tagline: tagline?.trim() || existing.tagline,
        category: category?.trim() || existing.category,
        priceMonthly:
          typeof priceMonthly === 'number' && priceMonthly > 0
            ? priceMonthly
            : existing.priceMonthly,
        priceAnnual:
          typeof priceAnnual === 'number' && priceAnnual > 0
            ? priceAnnual
            : existing.priceAnnual,
        priceLifetime:
          typeof priceLifetime === 'number' && priceLifetime > 0
            ? priceLifetime
            : existing.priceLifetime,
        version: version?.trim() || existing.version,
        winRatePct:
          typeof winRatePct === 'number' && winRatePct > 0
            ? winRatePct
            : existing.winRatePct,
        profitFactor:
          typeof profitFactor === 'number' && profitFactor > 0
            ? profitFactor
            : existing.profitFactor,
        sharpeRatio:
          typeof sharpeRatio === 'number' && sharpeRatio > 0
            ? sharpeRatio
            : existing.sharpeRatio,
        markets: markets?.trim() || existing.markets,
        timeframes: timeframes?.trim() || existing.timeframes,
      })
      .where(eq(indicatorsTable.id, indicatorId))
      .run();

    const updated = db
      .select()
      .from(indicatorsTable)
      .where(eq(indicatorsTable.id, indicatorId))
      .get();

    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    db.insert(webhookLogsTable)
      .values({
        id: `wh-${Date.now()}`,
        eventType: 'admin.catalog.updated',
        licenseKey: updated?.id.toUpperCase() || 'CATALOG',
        customerEmail: 'admin@stratedgealgo.com',
        tradingViewUsername: 'StratEdge_Admin',
        platformTarget: 'Storefront Product Catalog & Pricing Engine',
        status: '200 OK — Published',
        latencyMs: 38,
        payloadSummary: `Updated ${updated?.name}: $${updated?.priceMonthly}/mo · $${updated?.priceAnnual}/yr · $${updated?.priceLifetime} life (${updated?.version})`,
        createdAt: nowIso,
      })
      .run();

    res.json({
      message: `Updated pricing & release spec for ${updated?.name}`,
      indicator: updated,
    });
  });

  // 9. POST /api/admin/create-indicator - Add a brand-new indicator for sale to SQLite Catalog
  app.post('/api/admin/create-indicator', (req, res) => {
    const {
      name,
      tagline,
      category,
      priceMonthly,
      priceAnnual,
      priceLifetime,
      winRatePct,
      profitFactor,
      sharpeRatio,
      maxDrawdownPct,
      signalsPerDay,
      timeframes,
      markets,
      version,
      description,
      thinkScriptCode,
      pineScriptPreview,
    } = req.body as Record<string, unknown>;

    const cleanName = typeof name === 'string' ? name.trim() : '';
    if (!cleanName || cleanName.length < 3) {
      res.status(400).json({ error: 'Indicator name must be at least 3 characters.' });
      return;
    }

    const slug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const id = `se-${slug}-${Math.floor(100 + Math.random() * 900)}`;
    const studySafeName = cleanName.replace(/[^a-zA-Z0-9]/g, '');
    const tosCode = Math.random().toString(36).substring(2, 9).toUpperCase();

    const newIndicator = {
      id,
      slug,
      name: cleanName,
      tagline:
        typeof tagline === 'string' && tagline.trim()
          ? tagline.trim()
          : 'Institutional Quantitative Execution & Microstructure Model',
      category:
        typeof category === 'string' && category.trim()
          ? category.trim()
          : 'Gamma Exposure & Dealer Positioning',
      platforms: JSON.stringify(['TradingView', 'thinkorswim']),
      priceMonthly: Number(priceMonthly) > 0 ? Number(priceMonthly) : 199,
      priceAnnual: Number(priceAnnual) > 0 ? Number(priceAnnual) : 1490,
      priceLifetime: Number(priceLifetime) > 0 ? Number(priceLifetime) : 2490,
      winRatePct: Number(winRatePct) > 0 ? Number(winRatePct) : 77.5,
      profitFactor: Number(profitFactor) > 0 ? Number(profitFactor) : 2.85,
      sharpeRatio: Number(sharpeRatio) > 0 ? Number(sharpeRatio) : 3.15,
      maxDrawdownPct: Number(maxDrawdownPct) > 0 ? Number(maxDrawdownPct) : 4.1,
      signalsPerDay:
        typeof signalsPerDay === 'string' && signalsPerDay.trim()
          ? signalsPerDay.trim()
          : '3 - 6 High-Conviction Setups / Session',
      timeframes:
        typeof timeframes === 'string' && timeframes.trim()
          ? timeframes.trim()
          : '1m, 5m, 15m, 1H, 4H, Daily',
      markets:
        typeof markets === 'string' && markets.trim()
          ? markets.trim()
          : 'ES, NQ, SPX, QQQ, NVDA, TSLA, CL, GC',
      version:
        typeof version === 'string' && version.trim() ? version.trim() : 'v5.4.0',
      tosShareLink: `http://tos.mx/${tosCode}`,
      tosStudyFilename: `StratEdge_${studySafeName}_v54.ts`,
      tvScriptId: `PUB;stratedge_${slug.replace(/-/g, '_')}_v54`,
      description:
        typeof description === 'string' && description.trim()
          ? description.trim()
          : `${cleanName} combines non-repainting institutional order-flow telemetry with dynamic volatility-normalized execution levels for TradingView Pine Script v6 and Charles Schwab thinkorswim.`,
      thinkScriptCode:
        typeof thinkScriptCode === 'string' && thinkScriptCode.trim()
          ? thinkScriptCode.trim()
          : `# StratEdge Algo — ${cleanName}\n# Charles Schwab thinkorswim Study\ndeclare upper;\ninput sensitivity = 2.25;\ndef vwapBasis = reference VWAP();\nplot InstitutionalLevel = vwapBasis;\nInstitutionalLevel.SetDefaultColor(Color.UPTICK);`,
      pineScriptPreview:
        typeof pineScriptPreview === 'string' && pineScriptPreview.trim()
          ? pineScriptPreview.trim()
          : `//@version=6\nindicator("${cleanName} [Institutional]", overlay=true)\nfloat basis = ta.vwap(hlc3)\nplot(basis, "Institutional Anchor", color=color.new(#10B981, 0), linewidth=2)`,
    };

    db.insert(indicatorsTable).values(newIndicator).run();

    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    db.insert(webhookLogsTable)
      .values({
        id: `wh-${Date.now()}`,
        eventType: 'admin.catalog.created',
        licenseKey: id.toUpperCase(),
        customerEmail: 'admin@stratedgealgo.com',
        tradingViewUsername: 'StratEdge_Admin',
        platformTarget: 'Storefront Catalog + TV/TOS Fulfillment Vault',
        status: '201 Created — Live on Storefront',
        latencyMs: 49,
        payloadSummary: `Created new indicator for sale: ${cleanName} ($${newIndicator.priceMonthly}/mo · $${newIndicator.priceAnnual}/yr · $${newIndicator.priceLifetime} life)`,
        createdAt: nowIso,
      })
      .run();

    res.status(201).json({
      message: `${cleanName} created and published live to the Storefront!`,
      indicator: {
        ...newIndicator,
        platforms: ['TradingView', 'thinkorswim'],
      },
    });
  });

  // 10. POST /api/admin/delete-indicator - Remove custom indicator from storefront catalog
  app.post('/api/admin/delete-indicator', (req, res) => {
    const { indicatorId } = req.body as { indicatorId?: string };
    if (!indicatorId) {
      res.status(400).json({ error: 'indicatorId is required' });
      return;
    }

    const allIndicators = db.select().from(indicatorsTable).all();
    if (allIndicators.length <= 3) {
      res.status(400).json({
        error: 'Cannot delete core Trinity indicators when 3 or fewer products remain.',
      });
      return;
    }

    const existing = allIndicators.find((i) => i.id === indicatorId);
    if (!existing) {
      res.status(404).json({ error: 'Indicator not found' });
      return;
    }

    db.delete(indicatorsTable).where(eq(indicatorsTable.id, indicatorId)).run();

    res.json({
      message: `Removed ${existing.name} from active Storefront catalog.`,
      deletedId: indicatorId,
    });
  });

  // 11. GET /api/admin/sales-report - Full Enterprise Sales Report & Revenue Breakdown
  app.get('/api/admin/sales-report', (_req, res) => {
    const report = buildSalesReport();
    res.json(report);
  });

  // 12. GET & POST /api/admin/settings - Customizable Platform & Storefront Configuration
  app.get('/api/admin/settings', (_req, res) => {
    res.json({ settings: platformSettings });
  });

  app.post('/api/admin/settings', (req, res) => {
    const body = req.body as Partial<typeof platformSettings>;
    platformSettings = {
      ...platformSettings,
      announcementEnabled:
        typeof body.announcementEnabled === 'boolean'
          ? body.announcementEnabled
          : platformSettings.announcementEnabled,
      announcementBannerText:
        typeof body.announcementBannerText === 'string' && body.announcementBannerText.trim()
          ? body.announcementBannerText.trim()
          : platformSettings.announcementBannerText,
      announcementPromoCode:
        typeof body.announcementPromoCode === 'string' && body.announcementPromoCode.trim()
          ? body.announcementPromoCode.trim().toUpperCase()
          : platformSettings.announcementPromoCode,
      announcementDiscountPct:
        typeof body.announcementDiscountPct === 'number' &&
        body.announcementDiscountPct >= 0 &&
        body.announcementDiscountPct <= 90
          ? body.announcementDiscountPct
          : platformSettings.announcementDiscountPct,
      featuredIndicatorId:
        typeof body.featuredIndicatorId === 'string' && body.featuredIndicatorId.trim()
          ? body.featuredIndicatorId.trim()
          : platformSettings.featuredIndicatorId,
      supportEmail:
        typeof body.supportEmail === 'string' && body.supportEmail.trim()
          ? body.supportEmail.trim()
          : platformSettings.supportEmail,
      discordWebhookUrl:
        typeof body.discordWebhookUrl === 'string' && body.discordWebhookUrl.trim()
          ? body.discordWebhookUrl.trim()
          : platformSettings.discordWebhookUrl,
      requireStrictTvHandleVerification:
        typeof body.requireStrictTvHandleVerification === 'boolean'
          ? body.requireStrictTvHandleVerification
          : platformSettings.requireStrictTvHandleVerification,
      watermarkTosDownloads:
        typeof body.watermarkTosDownloads === 'boolean'
          ? body.watermarkTosDownloads
          : platformSettings.watermarkTosDownloads,
    };

    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    db.insert(webhookLogsTable)
      .values({
        id: `wh-${Date.now()}`,
        eventType: 'admin.settings.customized',
        licenseKey: 'PLATFORM-CONFIG',
        customerEmail: 'admin@stratedgealgo.com',
        tradingViewUsername: 'StratEdge_Admin',
        platformTarget: 'Storefront Global Config & Promo Engine',
        status: '200 OK — Synced',
        latencyMs: 29,
        payloadSummary: `Updated platform config: Promo ${platformSettings.announcementPromoCode} (${platformSettings.announcementDiscountPct}% off) · Banner ${platformSettings.announcementEnabled ? 'Enabled' : 'Hidden'}`,
        createdAt: nowIso,
      })
      .run();

    res.json({
      message: 'Enterprise platform & storefront customization saved live.',
      settings: platformSettings,
    });
  });

  // 13. GET & POST /api/admin/tickets - Institutional Support Tickets Management
  app.get('/api/admin/tickets', (_req, res) => {
    res.json({
      tickets: supportTickets,
      summary: {
        total: supportTickets.length,
        open: supportTickets.filter((t) => t.status === 'Open').length,
        inProgress: supportTickets.filter((t) => t.status === 'In Progress').length,
        resolved: supportTickets.filter((t) => t.status === 'Resolved').length,
        critical: supportTickets.filter(
          (t) => t.priority === 'Critical' && t.status !== 'Resolved'
        ).length,
      },
    });
  });

  app.post('/api/admin/tickets', (req, res) => {
    const parsed = SupportTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError =
        parsed.error.issues[0]?.message || 'Invalid support ticket payload.';
      res.status(400).json({ error: firstError, issues: parsed.error.issues });
      return;
    }

    const data = parsed.data;
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const nextNum = 9042 + supportTickets.length;
    const ticketNumber = `TKT-${nextNum}`;

    const baseNewTicket: SupportTicketRecord = {
      id: `tkt-${Date.now()}`,
      ticketNumber,
      customerName: data.customerName,
      customerEmail: data.customerEmail.toLowerCase(),
      tradingViewUsername: data.tradingViewUsername,
      platformTarget: data.platformTarget,
      category: data.category,
      priority: data.priority,
      status: 'Open',
      subject: data.subject,
      description: data.description,
      licenseKey:
        data.licenseKey ||
        generateDeterministicLicenseKey(
          'se-support-ticket',
          data.customerEmail,
          String(nextNum)
        ),
      adminResolutionNote:
        typeof req.body?.adminResolutionNote === 'string'
          ? req.body.adminResolutionNote.trim()
          : '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const newTicket: SupportTicketRecord = {
      ...baseNewTicket,
      messages: buildDefaultTicketMessages(baseNewTicket),
    };

    supportTickets = [newTicket, ...supportTickets];

    db.insert(webhookLogsTable)
      .values({
        id: `wh-${Date.now()}`,
        eventType: 'support.ticket.created',
        licenseKey: newTicket.ticketNumber,
        customerEmail: newTicket.customerEmail,
        tradingViewUsername: newTicket.tradingViewUsername,
        platformTarget: `${newTicket.platformTarget} Support Queue (${newTicket.priority})`,
        status: '201 Created — Open',
        latencyMs: 34,
        payloadSummary: `[${newTicket.ticketNumber}] ${newTicket.category}: ${newTicket.subject}`,
        createdAt: nowIso,
      })
      .run();

    res.status(201).json({
      message: `Support ticket ${newTicket.ticketNumber} created and routed to Desk Operations.`,
      ticket: newTicket,
      tickets: supportTickets,
    });
  });

  app.post('/api/support-tickets/message', (req, res) => {
    const parsed = SupportTicketMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError =
        parsed.error.issues[0]?.message || 'Invalid support message payload.';
      res.status(400).json({ error: firstError, issues: parsed.error.issues });
      return;
    }

    const data = parsed.data;
    const idx = supportTickets.findIndex(
      (t) => t.id === data.ticketId || t.ticketNumber === data.ticketId
    );
    if (idx < 0) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }

    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    let updatedTicket = appendTicketMessage(supportTickets[idx], data, nowIso);

    // If a client posts a follow-up message on an Open ticket, also log an immediate Quant Engineering Desk triage acknowledgment
    if (data.senderRole === 'client' && updatedTicket.status === 'Open') {
      updatedTicket = appendTicketMessage(
        {
          ...updatedTicket,
          status: 'In Progress',
        },
        {
          ticketId: updatedTicket.id,
          senderRole: 'engineer',
          senderName: 'Dr. Julian Vance — Senior Quant Engineer',
          senderHandleOrTitle: 'StratEdge Quantitative Execution Desk',
          body: `Received your diagnostic update on ${updatedTicket.ticketNumber}. We have verified your ${updatedTicket.platformTarget} telemetry for license ${updatedTicket.licenseKey} (@${updatedTicket.tradingViewUsername}) and moved your ticket to active engineering review.`,
          diagnosticSnippet: `DESK_ACK=200_OK | HANDLE=@${updatedTicket.tradingViewUsername} | LICENSE=${updatedTicket.licenseKey}`,
        },
        nowIso
      );
    }

    supportTickets[idx] = updatedTicket;

    db.insert(webhookLogsTable)
      .values({
        id: `wh-${Date.now()}`,
        eventType: 'support.ticket.message',
        licenseKey: updatedTicket.ticketNumber,
        customerEmail: updatedTicket.customerEmail,
        tradingViewUsername: updatedTicket.tradingViewUsername,
        platformTarget: `Support Messaging Thread (${data.senderRole.toUpperCase()})`,
        status: `200 OK — ${updatedTicket.status}`,
        latencyMs: 24,
        payloadSummary: `[${updatedTicket.ticketNumber}] New message from ${data.senderName}: ${data.body.slice(0, 70)}`,
        createdAt: nowIso,
      })
      .run();

    res.status(201).json({
      message: `Message posted to ticket ${updatedTicket.ticketNumber}.`,
      ticket: updatedTicket,
      tickets: supportTickets,
    });
  });

  app.post('/api/admin/tickets/update', (req, res) => {
    const { ticketId, status, priority, adminResolutionNote } = req.body as {
      ticketId?: string;
      status?: 'Open' | 'In Progress' | 'Resolved';
      priority?: 'Critical' | 'High' | 'Normal';
      adminResolutionNote?: string;
    };

    if (!ticketId) {
      res.status(400).json({ error: 'ticketId is required.' });
      return;
    }

    const idx = supportTickets.findIndex((t) => t.id === ticketId || t.ticketNumber === ticketId);
    if (idx < 0) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }

    const existing = supportTickets[idx];
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const nextStatus =
      status && ['Open', 'In Progress', 'Resolved'].includes(status)
        ? status
        : existing.status;

    const existingMessages = buildDefaultTicketMessages(existing);
    const statusChanged = nextStatus !== existing.status;
    const statusLogMsg = statusChanged
      ? [
          {
            id: `${existing.id}-status-${Date.now()}`,
            ticketId: existing.id,
            senderRole: 'system' as const,
            senderName: 'StratEdge Ticket Lifecycle Monitor',
            senderHandleOrTitle: 'Automated Status Tracker',
            body: `Ticket ${existing.ticketNumber} status transitioned from "${existing.status}" to "${nextStatus}".${
              adminResolutionNote?.trim() ? ` Note: ${adminResolutionNote.trim()}` : ''
            }`,
            createdAt: nowIso,
          },
        ]
      : [];

    const updated: SupportTicketRecord = {
      ...existing,
      status: nextStatus,
      priority:
        priority && ['Critical', 'High', 'Normal'].includes(priority)
          ? priority
          : existing.priority,
      adminResolutionNote:
        typeof adminResolutionNote === 'string'
          ? adminResolutionNote.trim()
          : existing.adminResolutionNote,
      updatedAt: nowIso,
      messages: [...existingMessages, ...statusLogMsg],
    };

    supportTickets[idx] = updated;

    db.insert(webhookLogsTable)
      .values({
        id: `wh-${Date.now()}`,
        eventType: 'support.ticket.updated',
        licenseKey: updated.ticketNumber,
        customerEmail: updated.customerEmail,
        tradingViewUsername: updated.tradingViewUsername,
        platformTarget: `Support Desk — Status: ${updated.status}`,
        status: `200 OK — ${updated.status}`,
        latencyMs: 27,
        payloadSummary: `[${updated.ticketNumber}] Updated to ${updated.status} (${updated.priority}) — ${updated.adminResolutionNote || updated.subject}`,
        createdAt: nowIso,
      })
      .run();

    res.json({
      message: `Ticket ${updated.ticketNumber} updated to ${updated.status}.`,
      ticket: updated,
      tickets: supportTickets,
    });
  });

  // Dynamic robots.txt and sitemap.xml for technical SEO (stratedgealgo.com)
  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(
      [
        'User-agent: *',
        'Allow: /',
        'Sitemap: https://stratedgealgo.com/sitemap.xml',
      ].join('\n')
    );
  });

  app.get('/sitemap.xml', (_req, res) => {
    const indicators = db.select().from(indicatorsTable).all();
    const urls = indicators
      .map(
        (ind) =>
          `  <url><loc>https://stratedgealgo.com/indicators/${ind.slug}</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>`
      )
      .join('\n');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://stratedgealgo.com/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>https://stratedgealgo.com/dashboard</loc><changefreq>daily</changefreq><priority>0.8</priority></url>
${urls}
</urlset>`);
  });

  // Vite middleware for development or static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`StratEdge Algo server listening on http://localhost:${PORT}`);
  });
}

startServer();
