import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CheckoutFormSchema,
  SecureCheckoutPaymentSchema,
  CheckoutIdentityPlatformStepSchema,
  CheckoutOrderSummaryBindingStepSchema,
  CheckoutPaymentSettlementStepSchema,
  CheckoutStep1Schema,
  CheckoutStep2Schema,
  CheckoutStep3Schema,
  TradingViewUsernameSchema,
  calculateOrderPricing,
  generateDeterministicLicenseKey,
  buildOrderConfirmationSummary,
  generateThinkScriptArtifact,
  buildDailyRevenueGrowthSeries,
  computeRevenuePeriodMetrics,
  computeCustomerLicenseDistribution,
  SupportTicketSchema,
  SupportTicketMessageSchema,
  buildDefaultTicketMessages,
  appendTicketMessage,
  computeTicketLifecycleProgress,
  computeClientTicketStatusSummary,
  filterSupportTickets,
  TRADER_FAQ_ITEMS,
  filterTraderFaqs,
  computeLiquidityDepthMatrix,
  ENTERPRISE_BREAKPOINTS_2026,
  resolveEnterpriseViewportTier,
  type SupportTicketRecord,
} from './fulfillment';

test('TradingViewUsernameSchema validates legitimate handles and rejects invalid symbols', () => {
  const valid = TradingViewUsernameSchema.safeParse('ApexQuant_Desk9');
  assert.equal(valid.success, true);

  const tooShort = TradingViewUsernameSchema.safeParse('ab');
  assert.equal(tooShort.success, false);

  const invalidChars = TradingViewUsernameSchema.safeParse('trader@desk!');
  assert.equal(invalidChars.success, false);
});

test('calculateOrderPricing computes billing cycle pricing, coupons, and expiration accurately', () => {
  const prices = { monthly: 179, annual: 1490, lifetime: 2990 };
  const refDate = new Date('2026-10-31T12:00:00Z');

  const annualNoCoupon = calculateOrderPricing(prices, 'Annual', '', refDate);
  assert.equal(annualNoCoupon.basePrice, 1490);
  assert.equal(annualNoCoupon.discountPct, 0);
  assert.equal(annualNoCoupon.finalPrice, 1490);
  assert.equal(annualNoCoupon.expiresAt, '2027-10-31');

  const lifetimeWithDeskCoupon = calculateOrderPricing(prices, 'Lifetime', 'desk20', refDate);
  assert.equal(lifetimeWithDeskCoupon.basePrice, 2990);
  assert.equal(lifetimeWithDeskCoupon.discountPct, 20);
  assert.equal(lifetimeWithDeskCoupon.discountAmount, 598);
  assert.equal(lifetimeWithDeskCoupon.finalPrice, 2392);
  assert.equal(lifetimeWithDeskCoupon.expiresAt, '2125-10-31');
});

test('generateDeterministicLicenseKey produces canonical SE-XXXX-XXXX-XXXX license format', () => {
  const key = generateDeterministicLicenseKey(
    'se-liquidity-matrix',
    'marcus.vance@propdesk.io',
    'A7F2'
  );
  assert.match(key, /^SE-[A-Z0-9]{4}-[A-Z0-9]{4}-A7F2$/);
});

test('CheckoutFormSchema validates complete institutional order payload', () => {
  const result = CheckoutFormSchema.safeParse({
    customerName: 'Elena Rostova',
    customerEmail: 'elena@quantcapital.ch',
    tradingViewUsername: 'Elena_QuantCH',
    thinkorswimAccountId: 'TOS-884120',
    indicatorId: 'se-institutional-bundle',
    billingCycle: 'Annual',
    couponCode: 'INSTITUTIONAL15',
  });
  assert.equal(result.success, true);
});

test('SecureCheckoutPaymentSchema validates payment card details and rejects invalid CVC or expiry', () => {
  const validPayment = SecureCheckoutPaymentSchema.safeParse({
    customerName: 'Marcus Vance',
    customerEmail: 'marcus.vance@apexquant.io',
    tradingViewUsername: 'MarcusVance_ES',
    thinkorswimAccountId: 'TOS-994182',
    indicatorId: 'se-algo-gamma',
    billingCycle: 'Annual',
    couponCode: 'PROP15',
    paymentMethod: 'Card',
    cardholderName: 'Marcus Vance',
    cardNumber: '4242 4242 4242 4242',
    cardExpiry: '08/29',
    cardCvc: '842',
    billingZip: '10005',
    acceptTerms: true,
  });
  assert.equal(validPayment.success, true);

  const invalidCard = SecureCheckoutPaymentSchema.safeParse({
    customerName: 'Marcus Vance',
    customerEmail: 'marcus.vance@apexquant.io',
    tradingViewUsername: 'MarcusVance_ES',
    indicatorId: 'se-algo-gamma',
    billingCycle: 'Annual',
    paymentMethod: 'Card',
    cardholderName: 'Marcus Vance',
    cardNumber: '123',
    cardExpiry: '19/99',
    cardCvc: '12',
    billingZip: '10005',
    acceptTerms: false,
  });
  assert.equal(invalidCard.success, false);
});

test('generateThinkScriptArtifact embeds customer license watermark and ThinkScript body', () => {
  const artifact = generateThinkScriptArtifact({
    indicatorName: 'StratEdge Liquidity Matrix',
    version: 'v4.8.2',
    licenseKey: 'SE-SELI-904B-A7F2',
    customerEmail: 'elena@quantcapital.ch',
    tradingViewUsername: 'Elena_QuantCH',
    coreScript: 'declare upper;\ninput aggregationPeriod = AggregationPeriod.FIFTEEN_MIN;',
  });

  assert.ok(artifact.includes('SE-SELI-904B-A7F2'));
  assert.ok(artifact.includes('elena@quantcapital.ch'));
  assert.ok(artifact.includes('declare upper;'));
});

test('buildDailyRevenueGrowthSeries generates monotonic cumulative revenue and daily growth points', () => {
  const series = buildDailyRevenueGrowthSeries(
    [
      { amountPaid: 2490, provisionedAt: '2026-10-18' },
      { amountPaid: 1490, provisionedAt: '2026-10-25' },
      { amountPaid: 3990, provisionedAt: '2026-10-30' },
    ],
    14
  );

  assert.equal(series.length, 14);
  assert.ok(series[0].dailyRevenue > 0);
  assert.ok(series[13].cumulativeRevenue >= 7970);
  for (let i = 1; i < series.length; i++) {
    assert.ok(series[i].cumulativeRevenue > series[i - 1].cumulativeRevenue);
  }
});

test('computeCustomerLicenseDistribution calculates accurate tier and indicator license shares', () => {
  const dist = computeCustomerLicenseDistribution([
    {
      indicatorId: 'se-algo-gamma',
      indicatorName: 'StratEdge Algo Gamma',
      billingCycle: 'Lifetime',
      amountPaid: 2490,
      tvAccessStatus: 'Provisioned',
    },
    {
      indicatorId: 'se-algo-gamma',
      indicatorName: 'StratEdge Algo Gamma',
      billingCycle: 'Annual',
      amountPaid: 1490,
      tvAccessStatus: 'Provisioned',
    },
    {
      indicatorId: 'se-algo-flow',
      indicatorName: 'StratEdge Algo Flow',
      billingCycle: 'Monthly',
      amountPaid: 199,
      tvAccessStatus: 'Revoked',
    },
  ]);

  assert.equal(dist.totalLicenses, 3);
  assert.equal(dist.activeProvisioned, 2);
  assert.equal(dist.revokedCount, 1);
  assert.equal(dist.byIndicator[0].indicatorId, 'se-algo-gamma');
  assert.equal(dist.byIndicator[0].licensesCount, 2);
});

test('3-step checkout schemas validate each step independently', () => {
  const emptyCartStep1 = CheckoutStep1Schema.safeParse({
    checkoutMode: 'cart',
    indicatorId: 'se-algo-gamma',
    billingCycle: 'Annual',
    cartItemCount: 0,
  });
  assert.equal(emptyCartStep1.success, false);

  const validCartStep1 = CheckoutStep1Schema.safeParse({
    checkoutMode: 'cart',
    indicatorId: 'se-algo-gamma',
    billingCycle: 'Annual',
    cartItemCount: 2,
  });
  assert.equal(validCartStep1.success, true);

  const validStep2 = CheckoutStep2Schema.safeParse({
    customerName: 'Marcus Vance',
    customerEmail: 'marcus.vance@apexquant.io',
    tradingViewUsername: 'MarcusVance_ES',
    thinkorswimAccountId: 'TOS-994182',
  });
  assert.equal(validStep2.success, true);

  const validStep3 = CheckoutStep3Schema.safeParse({
    paymentMethod: 'Card',
    cardholderName: 'Marcus Vance',
    cardNumber: '4242 4242 4242 4242',
    cardExpiry: '08/29',
    cardCvc: '842',
    billingZip: '10005',
    acceptTerms: true,
  });
  assert.equal(validStep3.success, true);
});

test('CheckoutIdentityPlatformStepSchema validates user identity and platform preference (TradingView vs. thinkorswim)', () => {
  const validTradingViewPref = CheckoutIdentityPlatformStepSchema.safeParse({
    customerName: 'Marcus Vance',
    customerEmail: 'marcus.vance@apexquant.io',
    platformPreference: 'TradingView',
    tradingViewUsername: 'MarcusVance_ES',
    thinkorswimAccountId: '',
  });
  assert.equal(validTradingViewPref.success, true);

  const invalidTradingViewPref = CheckoutIdentityPlatformStepSchema.safeParse({
    customerName: 'Marcus Vance',
    customerEmail: 'marcus.vance@apexquant.io',
    platformPreference: 'TradingView',
    tradingViewUsername: '',
    thinkorswimAccountId: 'TOS-994182',
  });
  assert.equal(invalidTradingViewPref.success, false);

  const validTosPref = CheckoutIdentityPlatformStepSchema.safeParse({
    customerName: 'Elena Rostova',
    customerEmail: 'elena@quantcapital.ch',
    platformPreference: 'thinkorswim',
    tradingViewUsername: '',
    thinkorswimAccountId: 'TOS-884120',
  });
  assert.equal(validTosPref.success, true);

  const invalidTosPref = CheckoutIdentityPlatformStepSchema.safeParse({
    customerName: 'Elena Rostova',
    customerEmail: 'elena@quantcapital.ch',
    platformPreference: 'thinkorswim',
    tradingViewUsername: 'Elena_QuantCH',
    thinkorswimAccountId: '12',
  });
  assert.equal(invalidTosPref.success, false);
});

test('CheckoutOrderSummaryBindingStepSchema validates order summary, license key binding handle, and terms acceptance', () => {
  const validStep2 = CheckoutOrderSummaryBindingStepSchema.safeParse({
    checkoutMode: 'single',
    indicatorId: 'se-institutional-bundle',
    billingCycle: 'Annual',
    cartItemCount: 0,
    platformPreference: 'TradingView',
    tradingViewUsername: 'MarcusVance_ES',
    thinkorswimAccountId: 'TOS-994182',
    acceptTerms: true,
  });
  assert.equal(validStep2.success, true);

  const missingTerms = CheckoutOrderSummaryBindingStepSchema.safeParse({
    checkoutMode: 'single',
    indicatorId: 'se-institutional-bundle',
    billingCycle: 'Annual',
    cartItemCount: 0,
    platformPreference: 'TradingView',
    tradingViewUsername: 'MarcusVance_ES',
    thinkorswimAccountId: 'TOS-994182',
    acceptTerms: false,
  });
  assert.equal(missingTerms.success, false);

  const missingTvBinding = CheckoutOrderSummaryBindingStepSchema.safeParse({
    checkoutMode: 'single',
    indicatorId: 'se-institutional-bundle',
    billingCycle: 'Annual',
    cartItemCount: 0,
    platformPreference: 'TradingView',
    tradingViewUsername: '',
    thinkorswimAccountId: 'TOS-994182',
    acceptTerms: true,
  });
  assert.equal(missingTvBinding.success, false);

  const validTosBinding = CheckoutOrderSummaryBindingStepSchema.safeParse({
    checkoutMode: 'single',
    indicatorId: 'se-institutional-bundle',
    billingCycle: 'Lifetime',
    cartItemCount: 0,
    platformPreference: 'thinkorswim',
    tradingViewUsername: '',
    thinkorswimAccountId: 'TOS-884120',
    acceptTerms: true,
  });
  assert.equal(validTosBinding.success, true);
});

test('CheckoutPaymentSettlementStepSchema and buildOrderConfirmationSummary validate payment rails and generate license confirmation', () => {
  const validCard = CheckoutPaymentSettlementStepSchema.safeParse({
    paymentMethod: 'Card',
    cardholderName: 'Marcus Vance',
    cardNumber: '4242 4242 4242 4242',
    cardExpiry: '08/29',
    cardCvc: '842',
    billingZip: '10005',
    acceptTerms: true,
  });
  assert.equal(validCard.success, true);

  const validUsdcWithoutCard = CheckoutPaymentSettlementStepSchema.safeParse({
    paymentMethod: 'USDC',
    cardholderName: '',
    cardNumber: '',
    cardExpiry: '',
    cardCvc: '',
    billingZip: '10005',
    acceptTerms: true,
  });
  assert.equal(validUsdcWithoutCard.success, true);

  const invalidCardCvc = CheckoutPaymentSettlementStepSchema.safeParse({
    paymentMethod: 'Card',
    cardholderName: 'Marcus Vance',
    cardNumber: '4242 4242 4242 4242',
    cardExpiry: '08/29',
    cardCvc: '1',
    billingZip: '10005',
    acceptTerms: true,
  });
  assert.equal(invalidCardCvc.success, false);

  const summary = buildOrderConfirmationSummary({
    orderId: 'ORD-884920',
    indicatorId: 'se-algo-gamma',
    indicatorName: 'StratEdge Algo Gamma',
    customerName: 'Marcus Vance',
    customerEmail: 'marcus.vance@apexquant.io',
    platformPreference: 'TradingView',
    tradingViewUsername: 'MarcusVance_ES',
    thinkorswimAccountId: 'TOS-994182',
    billingCycle: 'Annual',
    subtotal: 1490,
    discountAmount: 223.5,
    totalPaid: 1266.5,
    paymentMethod: 'Card',
  });
  assert.match(summary.licenseKey, /^SE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(summary.boundHandleLabel, '@MarcusVance_ES');
  assert.equal(summary.totalPaid, 1266.5);
});

test('buildDailyRevenueGrowthSeries and computeRevenuePeriodMetrics support interactive time-range presets, custom date slices, and tier filtering', () => {
  const sampleLicenses = [
    {
      amountPaid: 2490,
      provisionedAt: '2026-10-18',
      billingCycle: 'Lifetime',
      indicatorId: 'se-algo-gamma',
    },
    {
      amountPaid: 1490,
      provisionedAt: '2026-10-25',
      billingCycle: 'Annual',
      indicatorId: 'se-algo-flow',
    },
    {
      amountPaid: 3990,
      provisionedAt: '2026-10-30',
      billingCycle: 'Lifetime',
      indicatorId: 'se-institutional-bundle',
    },
  ];

  const series7d = buildDailyRevenueGrowthSeries(sampleLicenses, 7);
  assert.equal(series7d.length, 7);
  assert.ok(series7d[6].movingAvg7d > 0);

  const series90d = buildDailyRevenueGrowthSeries(sampleLicenses, 90);
  assert.equal(series90d.length, 90);
  assert.ok(series90d[89].cumulativeRevenue > series7d[6].cumulativeRevenue);

  const customDateSlice = buildDailyRevenueGrowthSeries(sampleLicenses, 30, {
    startDate: '2026-10-20',
    endDate: '2026-10-25',
  });
  assert.equal(customDateSlice.length, 6);
  assert.equal(customDateSlice[0].isoDate, '2026-10-20');
  assert.equal(customDateSlice[5].isoDate, '2026-10-25');

  const metrics = computeRevenuePeriodMetrics(customDateSlice);
  assert.equal(metrics.daysInPeriod, 6);
  assert.equal(metrics.periodTotalRevenue, customDateSlice[5].cumulativeRevenue);
  assert.ok(metrics.peakDailyRevenue >= metrics.averageDailyRevenue);
});

test('SupportTicketSchema and filterSupportTickets validate and filter institutional support tickets', () => {
  const validTicket = SupportTicketSchema.safeParse({
    customerName: 'Liam OConnor',
    customerEmail: 'liam@dublinprop.ie',
    tradingViewUsername: 'Liam_DublinES',
    platformTarget: 'TradingView',
    category: 'TradingView ACL Sync',
    priority: 'Critical',
    subject: 'Requesting Pine v6 ACL sync on NQ chart handle',
    description:
      'Completed checkout for StratEdge Algo Gamma Annual license, need ACL sync verified.',
    licenseKey: 'SE-GAMM-8841-A7F2',
  });
  assert.equal(validTicket.success, true);

  const invalidTicket = SupportTicketSchema.safeParse({
    customerName: 'L',
    customerEmail: 'bad-email',
    tradingViewUsername: 'a',
    platformTarget: 'TradingView',
    category: 'TradingView ACL Sync',
    priority: 'Critical',
    subject: 'hi',
    description: 'short',
  });
  assert.equal(invalidTicket.success, false);

  const sampleTickets: SupportTicketRecord[] = [
    {
      id: 't1',
      ticketNumber: 'TKT-9041',
      customerName: 'Marcus Vance',
      customerEmail: 'marcus@apex.io',
      tradingViewUsername: 'MarcusVance_ES',
      platformTarget: 'TradingView',
      category: 'TradingView ACL Sync',
      priority: 'Critical',
      status: 'Open',
      subject: 'Sub-account Pine v6 ACL sync',
      description: 'Need immediate ACL sync.',
      licenseKey: 'SE-BUND-8841',
      adminResolutionNote: '',
      createdAt: '2026-10-31',
      updatedAt: '2026-10-31',
    },
    {
      id: 't2',
      ticketNumber: 'TKT-9038',
      customerName: 'Elena Rostova',
      customerEmail: 'elena@zurich.ch',
      tradingViewUsername: 'Elena_Quant',
      platformTarget: 'thinkorswim',
      category: 'thinkorswim Study Import',
      priority: 'High',
      status: 'Resolved',
      subject: 'Schwab thinkorswim study aggregation',
      description: 'Need secondary aggregation.',
      licenseKey: 'SE-GAMM-7721',
      adminResolutionNote: 'Resolved.',
      createdAt: '2026-10-30',
      updatedAt: '2026-10-31',
    },
  ];

  const openOnly = filterSupportTickets(sampleTickets, { status: 'Open' });
  assert.equal(openOnly.length, 1);
  assert.equal(openOnly[0].ticketNumber, 'TKT-9041');

  const searchElena = filterSupportTickets(sampleTickets, {
    searchQuery: 'elena',
  });
  assert.equal(searchElena.length, 1);
  assert.equal(searchElena[0].ticketNumber, 'TKT-9038');
});

test('filterTraderFaqs filters trader inquiries across Installation, Licensing, and Indicator Usage categories and search keywords', () => {
  assert.ok(TRADER_FAQ_ITEMS.length >= 8);

  const installFaqs = filterTraderFaqs(TRADER_FAQ_ITEMS, 'Installation', '');
  assert.ok(installFaqs.length >= 2);
  assert.ok(installFaqs.every((item) => item.category === 'Installation'));

  const licensingFaqs = filterTraderFaqs(TRADER_FAQ_ITEMS, 'Licensing', '');
  assert.ok(licensingFaqs.length >= 2);
  assert.ok(licensingFaqs.every((item) => item.category === 'Licensing'));

  const usageFaqs = filterTraderFaqs(TRADER_FAQ_ITEMS, 'Indicator Usage', '');
  assert.ok(usageFaqs.length >= 2);
  assert.ok(usageFaqs.every((item) => item.category === 'Indicator Usage'));

  const repaintSearch = filterTraderFaqs(TRADER_FAQ_ITEMS, 'All', 'repaint');
  assert.equal(repaintSearch.length, 1);
  assert.equal(repaintSearch[0].id, 'faq-usage-non-repainting');

  const tosInstallSearch = filterTraderFaqs(TRADER_FAQ_ITEMS, 'Installation', 'thinkorswim');
  assert.ok(tosInstallSearch.length >= 2);
});

test('computeLiquidityDepthMatrix generates 64-node 3D liquidity grid and depth wall telemetry across Gamma, Flow, and Structure modes', () => {
  const gammaSpx = computeLiquidityDepthMatrix('Gamma', 'SPX 0DTE', 8);
  assert.equal(gammaSpx.nodes.length, 64);
  assert.ok(gammaSpx.bidWallTotalMillions > 0);
  assert.ok(gammaSpx.askWallTotalMillions > 0);
  assert.equal(gammaSpx.equilibriumStrikeLabel, '5,865.00 (+2.14σ)');

  const flowNq = computeLiquidityDepthMatrix('Flow', 'NQ1! Futures', 8);
  assert.equal(flowNq.nodes.length, 64);
  assert.ok(flowNq.askWallTotalMillions > gammaSpx.askWallTotalMillions);
  assert.equal(flowNq.netRegimeLabel, '+19,420 Net Delta Sweep');

  const structureEs = computeLiquidityDepthMatrix('Structure', 'ES1! Futures', 8);
  assert.equal(structureEs.nodes.length, 64);
  assert.equal(structureEs.netRegimeLabel, 'Bullish BOS Confirmed');
});

test('resolveEnterpriseViewportTier classifies xs, sm, md, lg, xl, and 2xl enterprise breakpoints accurately', () => {
  assert.equal(ENTERPRISE_BREAKPOINTS_2026.xsMax, 480);
  assert.equal(ENTERPRISE_BREAKPOINTS_2026.ultraWideMin, 1536);

  const mobileXs = resolveEnterpriseViewportTier(375, 812);
  assert.equal(mobileXs.tier, 'xs');
  assert.equal(mobileXs.navigationMode, 'mobile-drawer');
  assert.equal(mobileXs.catalogColumns, 1);
  assert.equal(mobileXs.kpiColumns, 1);
  assert.equal(mobileXs.checkoutStepperColumns, 1);
  assert.ok(mobileXs.heroCameraDistanceMultiplier > 1.1);

  const phabletSm = resolveEnterpriseViewportTier(640, 960);
  assert.equal(phabletSm.tier, 'sm');
  assert.equal(phabletSm.navigationMode, 'mobile-drawer');
  assert.equal(phabletSm.kpiColumns, 2);
  assert.equal(phabletSm.checkoutStepperColumns, 1);

  const tabletMd = resolveEnterpriseViewportTier(768, 1024);
  assert.equal(tabletMd.tier, 'md');
  assert.equal(tabletMd.navigationMode, 'mobile-drawer');
  assert.equal(tabletMd.catalogColumns, 2);
  assert.equal(tabletMd.checkoutStepperColumns, 3);

  const laptopLg = resolveEnterpriseViewportTier(1024, 768);
  assert.equal(laptopLg.tier, 'lg');
  assert.equal(laptopLg.navigationMode, 'desktop-inline');
  assert.equal(laptopLg.catalogColumns, 2);
  assert.equal(laptopLg.kpiColumns, 4);

  const desktopXl = resolveEnterpriseViewportTier(1440, 900);
  assert.equal(desktopXl.tier, 'xl');
  assert.equal(desktopXl.navigationMode, 'desktop-inline');
  assert.equal(desktopXl.catalogColumns, 3);
  assert.equal(desktopXl.kpiColumns, 4);

  const desk2xl = resolveEnterpriseViewportTier(1920, 1080);
  assert.equal(desk2xl.tier, '2xl');
  assert.equal(desk2xl.catalogColumns, 3);
  assert.equal(desk2xl.heroCanvasHeightPx, 360);
});

test('SupportTicketing messaging thread, lifecycle progress, and client status summary helpers work end-to-end', () => {
  const baseTicket: SupportTicketRecord = {
    id: 'tkt-9041',
    ticketNumber: 'TKT-9041',
    customerName: 'Marcus Vance',
    customerEmail: 'marcus.vance@apexquant.io',
    tradingViewUsername: 'MarcusVance_ES',
    platformTarget: 'TradingView',
    category: 'TradingView ACL Sync',
    priority: 'Critical',
    status: 'Open',
    subject: 'Sub-account Pine v6 Invite-Only ACL whitelist propagation',
    description: 'Requesting immediate Invite-Only ACL sync verification on @MarcusVance_ES.',
    licenseKey: 'SE-BUND-8841-A9C2',
    adminResolutionNote: 'Assigned to Quant Engineering Desk for ACL ping.',
    createdAt: '2026-10-31 14:12:00 UTC',
    updatedAt: '2026-10-31 14:12:00 UTC',
  };

  const initialThread = buildDefaultTicketMessages(baseTicket);
  assert.equal(initialThread.length, 3);
  assert.equal(initialThread[0].senderRole, 'client');
  assert.equal(initialThread[1].senderRole, 'system');
  assert.equal(initialThread[2].senderRole, 'engineer');

  const invalidMsg = SupportTicketMessageSchema.safeParse({
    ticketId: 'tkt-9041',
    senderRole: 'client',
    senderName: 'Marcus Vance',
    body: 'hi',
  });
  assert.equal(invalidMsg.success, false);

  const validMsg = SupportTicketMessageSchema.safeParse({
    ticketId: 'tkt-9041',
    senderRole: 'engineer',
    senderName: 'Dr. Julian Vance',
    senderHandleOrTitle: 'Senior Quant Engineer',
    body: 'Confirmed Pine Script v6 ACL whitelist propagation on @MarcusVance_ES. Please reload chart with Shift+F5.',
    diagnosticSnippet: 'ACL_STATUS=200_OK_PROVISIONED',
  });
  assert.equal(validMsg.success, true);

  if (validMsg.success) {
    const updatedTicket = appendTicketMessage(
      baseTicket,
      validMsg.data,
      '2026-11-01 09:45:00 UTC'
    );
    assert.equal(updatedTicket.status, 'In Progress');
    assert.equal(updatedTicket.messages?.length, 4);
    assert.equal(updatedTicket.updatedAt, '2026-11-01 09:45:00 UTC');

    const progress = computeTicketLifecycleProgress(updatedTicket.status, updatedTicket.priority);
    assert.equal(progress.currentStageIndex, 2);
    assert.equal(progress.completionPct, 66);
    assert.equal(progress.stages[1].active, true);

    const summary = computeClientTicketStatusSummary(
      [updatedTicket],
      'marcus.vance@apexquant.io'
    );
    assert.equal(summary.total, 1);
    assert.equal(summary.inProgress, 1);
    assert.equal(summary.criticalActive, 1);
    assert.equal(summary.totalMessages, 4);
  }
});






