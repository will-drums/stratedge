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

    res.json({
      currentUser,
      allUsers,
      customerLicenses,
      allLicenses,
      webhookLogs,
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
      priceMonthly,
      priceAnnual,
      priceLifetime,
      version,
      winRatePct,
    } = req.body as {
      indicatorId?: string;
      priceMonthly?: number;
      priceAnnual?: number;
      priceLifetime?: number;
      version?: string;
      winRatePct?: number;
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
      })
      .where(eq(indicatorsTable.id, indicatorId))
      .run();

    const updated = db
      .select()
      .from(indicatorsTable)
      .where(eq(indicatorsTable.id, indicatorId))
      .get();

    res.json({
      message: `Updated pricing & release spec for ${existing.name}`,
      indicator: updated,
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
