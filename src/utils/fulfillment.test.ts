import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CheckoutFormSchema,
  SecureCheckoutPaymentSchema,
  TradingViewUsernameSchema,
  calculateOrderPricing,
  generateDeterministicLicenseKey,
  generateThinkScriptArtifact,
  buildDailyRevenueGrowthSeries,
  computeCustomerLicenseDistribution,
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

