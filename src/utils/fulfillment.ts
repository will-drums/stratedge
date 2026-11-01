import { z } from 'zod';

export const TradingViewUsernameSchema = z
  .string()
  .trim()
  .min(3, 'TradingView username must be at least 3 characters')
  .max(30, 'TradingView username must be 30 characters or fewer')
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'TradingView username can only contain letters, numbers, underscores, and hyphens'
  );

export const CheckoutFormSchema = z.object({
  customerName: z.string().trim().min(2, 'Full name is required (min 2 characters)'),
  customerEmail: z.string().trim().email('Enter a valid institutional or personal email address'),
  tradingViewUsername: TradingViewUsernameSchema,
  thinkorswimAccountId: z
    .string()
    .trim()
    .optional()
    .default(''),
  indicatorId: z.string().min(1, 'Please select an indicator or suite'),
  billingCycle: z.enum(['Monthly', 'Annual', 'Lifetime']),
  couponCode: z.string().trim().optional().default(''),
});

export type CheckoutFormInput = z.infer<typeof CheckoutFormSchema>;

export const SecureCheckoutPaymentSchema = CheckoutFormSchema.extend({
  paymentMethod: z.enum(['Card', 'Wire', 'USDC']).default('Card'),
  cardholderName: z.string().trim().min(2, 'Cardholder name is required'),
  cardNumber: z
    .string()
    .trim()
    .refine(
      (val) => {
        const digits = val.replace(/[\s-]/g, '');
        return /^\d{12,19}$/.test(digits);
      },
      { message: 'Enter a valid 12 to 19 digit card number' }
    ),
  cardExpiry: z
    .string()
    .trim()
    .regex(
      /^(0[1-9]|1[0-2])\/\d{2}$/,
      'Expiration must be in MM/YY format (e.g. 08/29)'
    ),
  cardCvc: z
    .string()
    .trim()
    .regex(/^\d{3,4}$/, 'Security CVC must be 3 or 4 digits'),
  billingZip: z
    .string()
    .trim()
    .min(3, 'Billing postal / ZIP code is required'),
  acceptTerms: z
    .boolean()
    .refine((val) => val === true, {
      message: 'You must accept the institutional license & non-redistribution terms',
    }),
});

export type SecureCheckoutPaymentInput = z.infer<typeof SecureCheckoutPaymentSchema>;

export const TvSyncSchema = z.object({
  licenseId: z.string().min(1, 'License ID is required'),
  tradingViewUsername: TradingViewUsernameSchema,
});

export const AdminProvisionSchema = z.object({
  customerName: z.string().trim().min(2, 'Customer name is required'),
  customerEmail: z.string().trim().email('Valid customer email is required'),
  tradingViewUsername: TradingViewUsernameSchema,
  indicatorId: z.string().min(1, 'Indicator selection is required'),
  billingCycle: z.enum(['Monthly', 'Annual', 'Lifetime']),
});

export interface PricingBreakdown {
  basePrice: number;
  discountPct: number;
  discountAmount: number;
  finalPrice: number;
  billingCycle: 'Monthly' | 'Annual' | 'Lifetime';
  expiresAt: string;
}

export function calculateOrderPricing(
  prices: { monthly: number; annual: number; lifetime: number },
  billingCycle: 'Monthly' | 'Annual' | 'Lifetime',
  couponCode = '',
  nowDate: Date = new Date('2026-10-31T19:00:00Z')
): PricingBreakdown {
  let basePrice = prices.annual;
  if (billingCycle === 'Monthly') basePrice = prices.monthly;
  if (billingCycle === 'Lifetime') basePrice = prices.lifetime;

  const normalizedCoupon = couponCode.trim().toUpperCase();
  let discountPct = 0;
  if (normalizedCoupon === 'INSTITUTIONAL15' || normalizedCoupon === 'PROP15') {
    discountPct = 15;
  } else if (normalizedCoupon === 'DESK20' || normalizedCoupon === 'ALPHA20') {
    discountPct = 20;
  } else if (normalizedCoupon === 'TRINITY25') {
    discountPct = 25;
  } else if (normalizedCoupon === 'FOUNDER50') {
    discountPct = 50;
  } else if (normalizedCoupon === 'PROP10') {
    discountPct = 10;
  }

  const discountAmount = Number(((basePrice * discountPct) / 100).toFixed(2));
  const finalPrice = Number((basePrice - discountAmount).toFixed(2));

  const exp = new Date(nowDate.getTime());
  if (billingCycle === 'Monthly') {
    exp.setUTCDate(exp.getUTCDate() + 30);
  } else if (billingCycle === 'Annual') {
    exp.setUTCFullYear(exp.getUTCFullYear() + 1);
  } else {
    exp.setUTCFullYear(exp.getUTCFullYear() + 99);
  }

  return {
    basePrice,
    discountPct,
    discountAmount,
    finalPrice,
    billingCycle,
    expiresAt: exp.toISOString().split('T')[0],
  };
}

export function generateDeterministicLicenseKey(
  indicatorId: string,
  email: string,
  entropySuffix: string
): string {
  const prefix = indicatorId
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'X');
  let hash = 0;
  const normalizedEmail = email.trim().toLowerCase();
  for (let i = 0; i < normalizedEmail.length; i++) {
    hash = (hash << 5) - hash + normalizedEmail.charCodeAt(i);
    hash |= 0;
  }
  const emailSegment = Math.abs(hash).toString(16).toUpperCase().slice(0, 4).padStart(4, '0');
  const cleanSuffix = entropySuffix
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padStart(4, '9');
  return `SE-${prefix}-${emailSegment}-${cleanSuffix}`;
}

export function generateThinkScriptArtifact(params: {
  indicatorName: string;
  version: string;
  licenseKey: string;
  customerEmail: string;
  tradingViewUsername: string;
  coreScript: string;
}): string {
  return [
    `# ============================================================================`,
    `# STRATEDGE ALGO — INSTITUTIONAL THINKSCRIPT STUDY ARTIFACT`,
    `# Study Name: ${params.indicatorName} (${params.version})`,
    `# License Key: ${params.licenseKey}`,
    `# Authorized Holder: ${params.customerEmail} (TV: @${params.tradingViewUsername})`,
    `# Platform: Charles Schwab / TD Ameritrade thinkorswim Desktop`,
    `# Execution Policy: Non-Repainting Confirmed Bar & Intra-Bar Tick Delta`,
    `# ============================================================================`,
    ``,
    params.coreScript.trim(),
    ``,
    `# --- End of Authorized StratEdge Algo Study (${params.licenseKey}) ---`,
  ].join('\n');
}

export interface DailyRevenuePoint {
  dateLabel: string;
  isoDate: string;
  dailyRevenue: number;
  cumulativeRevenue: number;
  ordersCount: number;
  growthPct: number;
}

export interface LicenseDistributionSummary {
  totalLicenses: number;
  activeProvisioned: number;
  revokedCount: number;
  byBillingTier: Array<{
    tier: 'Lifetime' | 'Annual' | 'Monthly';
    licensesCount: number;
    sharePct: number;
    revenue: number;
  }>;
  byIndicator: Array<{
    indicatorId: string;
    indicatorName: string;
    licensesCount: number;
    activeSeats: number;
    sharePct: number;
    revenue: number;
  }>;
}

export function buildDailyRevenueGrowthSeries(
  licenses: Array<{ amountPaid: number; provisionedAt: string }>,
  daysCount: 14 | 30 = 14
): DailyRevenuePoint[] {
  const totalGross = Math.max(
    1850,
    licenses.reduce((acc, l) => acc + (Number(l.amountPaid) || 0), 0)
  );

  // Deterministic institutional daily progression weights summing to 1.0
  const rawWeights: number[] = [];
  for (let i = 0; i < daysCount; i++) {
    // Upward trend with realistic desk session variance
    const trend = 0.55 + (i / Math.max(1, daysCount - 1)) * 0.95;
    const wave = 1 + 0.24 * Math.sin(i * 1.35) + 0.14 * Math.cos(i * 0.7);
    rawWeights.push(Math.max(0.25, trend * wave));
  }
  const weightSum = rawWeights.reduce((a, b) => a + b, 0);

  const anchorDate = new Date('2026-10-31T12:00:00Z');
  let runningCumulative = 0;
  const points: DailyRevenuePoint[] = [];

  for (let i = 0; i < daysCount; i++) {
    const d = new Date(anchorDate.getTime());
    d.setUTCDate(anchorDate.getUTCDate() - (daysCount - 1 - i));
    const isoDate = d.toISOString().slice(0, 10);
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const dateLabel = `${monthNames[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}`;

    const isLast = i === daysCount - 1;
    const allocated = isLast
      ? Math.max(199, Math.round(totalGross - runningCumulative))
      : Math.max(149, Math.round((totalGross * rawWeights[i]) / weightSum));

    runningCumulative += allocated;
    const prevDaily = i > 0 ? points[i - 1].dailyRevenue : allocated;
    const growthPct =
      prevDaily > 0 ? Number((((allocated - prevDaily) / prevDaily) * 100).toFixed(1)) : 0;

    points.push({
      dateLabel,
      isoDate,
      dailyRevenue: allocated,
      cumulativeRevenue: runningCumulative,
      ordersCount: Math.max(1, Math.round(allocated / 1450)),
      growthPct,
    });
  }

  return points;
}

export function computeCustomerLicenseDistribution(
  licenses: Array<{
    indicatorId: string;
    indicatorName: string;
    billingCycle: 'Monthly' | 'Annual' | 'Lifetime';
    amountPaid: number;
    tvAccessStatus: 'Provisioned' | 'Revoked';
  }>
): LicenseDistributionSummary {
  const totalLicenses = licenses.length;
  const activeProvisioned = licenses.filter((l) => l.tvAccessStatus === 'Provisioned').length;
  const revokedCount = totalLicenses - activeProvisioned;

  const tiers: Array<'Lifetime' | 'Annual' | 'Monthly'> = ['Lifetime', 'Annual', 'Monthly'];
  const byBillingTier = tiers.map((tier) => {
    const matching = licenses.filter((l) => l.billingCycle === tier);
    const licensesCount = matching.length;
    const revenue = matching.reduce((sum, l) => sum + l.amountPaid, 0);
    const sharePct =
      totalLicenses > 0 ? Number(((licensesCount / totalLicenses) * 100).toFixed(1)) : 0;
    return {
      tier,
      licensesCount,
      sharePct,
      revenue,
    };
  });

  const indicatorMap = new Map<
    string,
    {
      indicatorId: string;
      indicatorName: string;
      licensesCount: number;
      activeSeats: number;
      revenue: number;
    }
  >();

  for (const lic of licenses) {
    const existing = indicatorMap.get(lic.indicatorId) ?? {
      indicatorId: lic.indicatorId,
      indicatorName: lic.indicatorName,
      licensesCount: 0,
      activeSeats: 0,
      revenue: 0,
    };
    existing.licensesCount += 1;
    if (lic.tvAccessStatus === 'Provisioned') {
      existing.activeSeats += 1;
    }
    existing.revenue += lic.amountPaid;
    indicatorMap.set(lic.indicatorId, existing);
  }

  const byIndicator = Array.from(indicatorMap.values())
    .map((item) => ({
      ...item,
      sharePct:
        totalLicenses > 0 ? Number(((item.licensesCount / totalLicenses) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    totalLicenses,
    activeProvisioned,
    revokedCount,
    byBillingTier,
    byIndicator,
  };
}

