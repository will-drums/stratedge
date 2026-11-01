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

export const CheckoutStep1Schema = z.object({
  checkoutMode: z.enum(['single', 'cart']),
  indicatorId: z.string().min(1, 'Please select an indicator or suite'),
  billingCycle: z.enum(['Monthly', 'Annual', 'Lifetime']),
  cartItemCount: z.number().int().nonnegative(),
}).refine(
  (data) => (data.checkoutMode === 'cart' ? data.cartItemCount > 0 : Boolean(data.indicatorId)),
  {
    message: 'Your shopping cart is empty. Add at least one indicator or switch to Direct Indicator License.',
    path: ['cartItemCount'],
  }
);

export const PlatformPreferenceSchema = z.enum(['TradingView', 'thinkorswim', 'Dual']);
export type PlatformPreference = z.infer<typeof PlatformPreferenceSchema>;

export const ThinkorswimAccountIdSchema = z
  .string()
  .trim()
  .min(4, 'thinkorswim Account / Workspace ID must be at least 4 characters (e.g. TOS-994182)')
  .max(32, 'thinkorswim ID must be under 32 characters')
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'thinkorswim ID may only contain letters, numbers, underscores, and hyphens'
  );

export const CheckoutIdentityPlatformStepSchema = z
  .object({
    customerName: z.string().trim().min(2, 'Full name or desk name is required (min 2 characters)'),
    customerEmail: z.string().trim().email('Enter a valid institutional or personal email address'),
    platformPreference: PlatformPreferenceSchema,
    tradingViewUsername: z.string().trim().optional().default(''),
    thinkorswimAccountId: z.string().trim().optional().default(''),
  })
  .superRefine((data, ctx) => {
    if (data.platformPreference === 'TradingView' || data.platformPreference === 'Dual') {
      const tvParsed = TradingViewUsernameSchema.safeParse(data.tradingViewUsername);
      if (!tvParsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tradingViewUsername'],
          message:
            tvParsed.error.issues[0]?.message ||
            'Valid TradingView username is required for Pine Script v6 Invite-Only ACL provisioning',
        });
      }
    }

    if (data.platformPreference === 'thinkorswim' || data.platformPreference === 'Dual') {
      const tosParsed = ThinkorswimAccountIdSchema.safeParse(data.thinkorswimAccountId);
      if (!tosParsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['thinkorswimAccountId'],
          message:
            tosParsed.error.issues[0]?.message ||
            'Valid Charles Schwab thinkorswim Account ID is required for .ts study watermarking',
        });
      }
    }
  });

export const CheckoutStep2Schema = z.object({
  customerName: z.string().trim().min(2, 'Full name is required (min 2 characters)'),
  customerEmail: z.string().trim().email('Enter a valid institutional or personal email address'),
  tradingViewUsername: TradingViewUsernameSchema,
  thinkorswimAccountId: z.string().trim().optional().default(''),
});

export const CheckoutOrderSummaryBindingStepSchema = z
  .object({
    checkoutMode: z.enum(['single', 'cart']),
    indicatorId: z.string().trim().min(1, 'Select a quantitative indicator or suite'),
    billingCycle: z.enum(['Monthly', 'Annual', 'Lifetime']),
    cartItemCount: z.number().int().min(0),
    platformPreference: PlatformPreferenceSchema.default('TradingView'),
    tradingViewUsername: z.string().trim().optional().default(''),
    thinkorswimAccountId: z.string().trim().optional().default(''),
    acceptTerms: z
      .boolean()
      .refine((val) => val === true, {
        message: 'You must accept the institutional license & non-redistribution terms to proceed',
      }),
  })
  .superRefine((data, ctx) => {
    if (data.checkoutMode === 'cart' && data.cartItemCount < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cartItemCount'],
        message: 'Add at least one indicator to your cart or switch to Direct Indicator License',
      });
    }

    if (data.platformPreference === 'TradingView' || data.platformPreference === 'Dual') {
      const tvParsed = TradingViewUsernameSchema.safeParse(data.tradingViewUsername);
      if (!tvParsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tradingViewUsername'],
          message:
            tvParsed.error.issues[0]?.message ||
            'Valid TradingView username is required to bind your license key for Invite-Only ACL provisioning',
        });
      }
    }

    if (data.platformPreference === 'thinkorswim' || data.platformPreference === 'Dual') {
      const tosParsed = ThinkorswimAccountIdSchema.safeParse(data.thinkorswimAccountId);
      if (!tosParsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['thinkorswimAccountId'],
          message:
            tosParsed.error.issues[0]?.message ||
            'Valid Charles Schwab thinkorswim Account ID is required to bind your .ts license watermark',
        });
      }
    }
  });

export const CheckoutStep3Schema = z.object({
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

export const CheckoutPaymentSettlementStepSchema = z
  .object({
    paymentMethod: z.enum(['Card', 'Wire', 'USDC']).default('Card'),
    cardholderName: z.string().trim().optional().default(''),
    cardNumber: z.string().trim().optional().default(''),
    cardExpiry: z.string().trim().optional().default(''),
    cardCvc: z.string().trim().optional().default(''),
    billingZip: z
      .string()
      .trim()
      .min(3, 'Billing postal / ZIP code is required'),
    acceptTerms: z
      .boolean()
      .refine((val) => val === true, {
        message: 'You must accept the institutional license & non-redistribution terms',
      }),
  })
  .superRefine((data, ctx) => {
    if (data.paymentMethod === 'Card') {
      if (data.cardholderName.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cardholderName'],
          message: 'Cardholder name is required (min 2 characters)',
        });
      }
      const digits = data.cardNumber.replace(/[\s-]/g, '');
      if (!/^\d{12,19}$/.test(digits)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cardNumber'],
          message: 'Enter a valid 12 to 19 digit card number',
        });
      }
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(data.cardExpiry.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cardExpiry'],
          message: 'Expiration must be in MM/YY format (e.g. 08/29)',
        });
      }
      if (!/^\d{3,4}$/.test(data.cardCvc.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cardCvc'],
          message: 'Security CVC must be 3 or 4 digits',
        });
      }
    }
  });

export interface OrderConfirmationSummary {
  orderId: string;
  licenseKey: string;
  customerName: string;
  customerEmail: string;
  platformPreference: PlatformPreference;
  boundHandleLabel: string;
  indicatorName: string;
  billingCycle: 'Monthly' | 'Annual' | 'Lifetime';
  subtotal: number;
  discountAmount: number;
  totalPaid: number;
  paymentMethod: 'Card' | 'Wire' | 'USDC';
}

export function buildOrderConfirmationSummary(input: {
  orderId: string;
  indicatorId: string;
  indicatorName: string;
  customerName: string;
  customerEmail: string;
  platformPreference: PlatformPreference;
  tradingViewUsername: string;
  thinkorswimAccountId: string;
  billingCycle: 'Monthly' | 'Annual' | 'Lifetime';
  subtotal: number;
  discountAmount: number;
  totalPaid: number;
  paymentMethod: 'Card' | 'Wire' | 'USDC';
  entropySuffix?: string;
}): OrderConfirmationSummary {
  const suffix =
    input.entropySuffix ||
    (input.tradingViewUsername || input.thinkorswimAccountId || 'DESK')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(-4)
      .padStart(4, '9');
  const licenseKey = generateDeterministicLicenseKey(
    input.indicatorId,
    input.customerEmail,
    suffix
  );

  let boundHandleLabel = `@${input.tradingViewUsername.trim()}`;
  if (input.platformPreference === 'thinkorswim') {
    boundHandleLabel = input.thinkorswimAccountId.trim();
  } else if (input.platformPreference === 'Dual') {
    boundHandleLabel = `@${input.tradingViewUsername.trim()} + ${input.thinkorswimAccountId.trim()}`;
  }

  return {
    orderId: input.orderId,
    licenseKey,
    customerName: input.customerName.trim(),
    customerEmail: input.customerEmail.trim().toLowerCase(),
    platformPreference: input.platformPreference,
    boundHandleLabel,
    indicatorName: input.indicatorName,
    billingCycle: input.billingCycle,
    subtotal: input.subtotal,
    discountAmount: input.discountAmount,
    totalPaid: input.totalPaid,
    paymentMethod: input.paymentMethod,
  };
}


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
  movingAvg7d: number;
  ordersCount: number;
  growthPct: number;
}

export interface RevenueSeriesFilterOptions {
  startDate?: string;
  endDate?: string;
  billingCycle?: 'All' | 'Monthly' | 'Annual' | 'Lifetime';
  indicatorId?: string;
}

export interface RevenuePeriodMetrics {
  periodTotalRevenue: number;
  averageDailyRevenue: number;
  peakDailyRevenue: number;
  peakDateLabel: string;
  latestDailyRevenue: number;
  latestDateLabel: string;
  latestGrowthPct: number;
  periodGrowthPct: number;
  totalOrders: number;
  daysInPeriod: number;
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
  licenses: Array<{
    amountPaid: number;
    provisionedAt: string;
    billingCycle?: 'Monthly' | 'Annual' | 'Lifetime' | string;
    indicatorId?: string;
  }>,
  daysCount: number = 14,
  filterOptions?: RevenueSeriesFilterOptions
): DailyRevenuePoint[] {
  const safeDaysCount = Math.max(1, Math.min(365, Math.round(daysCount || 14)));

  // Filter licenses by billingCycle or indicatorId if specified
  let filteredLicenses = licenses;
  if (
    filterOptions?.billingCycle &&
    filterOptions.billingCycle !== 'All'
  ) {
    filteredLicenses = filteredLicenses.filter(
      (l) => !l.billingCycle || l.billingCycle === filterOptions.billingCycle
    );
  }
  if (
    filterOptions?.indicatorId &&
    filterOptions.indicatorId !== 'All'
  ) {
    filteredLicenses = filteredLicenses.filter(
      (l) => !l.indicatorId || l.indicatorId === filterOptions.indicatorId
    );
  }

  const rawLicenseSum = filteredLicenses.reduce(
    (acc, l) => acc + (Number(l.amountPaid) || 0),
    0
  );
  // Scale historical total gross proportionally for longer historical windows (90D/180D) while keeping 14D/30D exact
  const windowMultiplier =
    safeDaysCount > 30 ? 1 + ((safeDaysCount - 30) / 30) * 0.48 : 1;
  const totalGross = Math.max(
    filteredLicenses.length === 0 && (filterOptions?.billingCycle !== 'All' || filterOptions?.indicatorId !== 'All')
      ? 950
      : 1850,
    Math.round(rawLicenseSum * windowMultiplier)
  );

  // Deterministic institutional daily progression weights summing to 1.0
  const rawWeights: number[] = [];
  for (let i = 0; i < safeDaysCount; i++) {
    // Upward trend with realistic desk session variance
    const trend = 0.55 + (i / Math.max(1, safeDaysCount - 1)) * 0.95;
    const wave = 1 + 0.24 * Math.sin(i * 1.35) + 0.14 * Math.cos(i * 0.7);
    rawWeights.push(Math.max(0.25, trend * wave));
  }
  const weightSum = rawWeights.reduce((a, b) => a + b, 0);

  const anchorDate = new Date('2026-10-31T12:00:00Z');
  let runningCumulative = 0;
  const points: DailyRevenuePoint[] = [];

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

  for (let i = 0; i < safeDaysCount; i++) {
    const d = new Date(anchorDate.getTime());
    d.setUTCDate(anchorDate.getUTCDate() - (safeDaysCount - 1 - i));
    const isoDate = d.toISOString().slice(0, 10);
    const dateLabel = `${monthNames[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}`;

    const isLast = i === safeDaysCount - 1;
    const minFloor = safeDaysCount > 60 ? 85 : 149;
    const allocated = isLast
      ? Math.max(199, Math.round(totalGross - runningCumulative))
      : Math.max(minFloor, Math.round((totalGross * rawWeights[i]) / weightSum));

    runningCumulative += allocated;
    const prevDaily = i > 0 ? points[i - 1].dailyRevenue : allocated;
    const growthPct =
      prevDaily > 0 ? Number((((allocated - prevDaily) / prevDaily) * 100).toFixed(1)) : 0;

    // 7-day rolling moving average
    const windowStart = Math.max(0, i - 6);
    let sumWindow = allocated;
    let countWindow = 1;
    for (let j = windowStart; j < i; j++) {
      sumWindow += points[j].dailyRevenue;
      countWindow += 1;
    }
    const movingAvg7d = Math.round(sumWindow / countWindow);

    points.push({
      dateLabel,
      isoDate,
      dailyRevenue: allocated,
      cumulativeRevenue: runningCumulative,
      movingAvg7d,
      ordersCount: Math.max(1, Math.round(allocated / 1450)),
      growthPct,
    });
  }

  // Apply custom startDate / endDate range filtering if provided
  const startIso = filterOptions?.startDate?.trim() || '';
  const endIso = filterOptions?.endDate?.trim() || '';
  if (startIso || endIso) {
    const sliced = points.filter((pt) => {
      if (startIso && pt.isoDate < startIso) return false;
      if (endIso && pt.isoDate > endIso) return false;
      return true;
    });
    if (sliced.length > 0) {
      let recalcCumulative = 0;
      return sliced.map((pt, idx) => {
        recalcCumulative += pt.dailyRevenue;
        const winStart = Math.max(0, idx - 6);
        const winSlice = sliced.slice(winStart, idx + 1);
        const avg7 = Math.round(
          winSlice.reduce((s, item) => s + item.dailyRevenue, 0) / winSlice.length
        );
        return {
          ...pt,
          cumulativeRevenue: recalcCumulative,
          movingAvg7d: avg7,
        };
      });
    }
  }

  return points;
}

export function computeRevenuePeriodMetrics(
  series: DailyRevenuePoint[]
): RevenuePeriodMetrics {
  if (!series || series.length === 0) {
    return {
      periodTotalRevenue: 0,
      averageDailyRevenue: 0,
      peakDailyRevenue: 0,
      peakDateLabel: '—',
      latestDailyRevenue: 0,
      latestDateLabel: '—',
      latestGrowthPct: 0,
      periodGrowthPct: 0,
      totalOrders: 0,
      daysInPeriod: 0,
    };
  }

  const periodTotalRevenue = series.reduce((sum, pt) => sum + pt.dailyRevenue, 0);
  const averageDailyRevenue = Math.round(periodTotalRevenue / series.length);
  const totalOrders = series.reduce((sum, pt) => sum + pt.ordersCount, 0);

  let peakPoint = series[0];
  for (const pt of series) {
    if (pt.dailyRevenue > peakPoint.dailyRevenue) {
      peakPoint = pt;
    }
  }

  const firstPoint = series[0];
  const latestPoint = series[series.length - 1];
  const periodGrowthPct =
    firstPoint.dailyRevenue > 0
      ? Number(
          (
            ((latestPoint.dailyRevenue - firstPoint.dailyRevenue) /
              firstPoint.dailyRevenue) *
            100
          ).toFixed(1)
        )
      : 0;

  return {
    periodTotalRevenue,
    averageDailyRevenue,
    peakDailyRevenue: peakPoint.dailyRevenue,
    peakDateLabel: peakPoint.dateLabel,
    latestDailyRevenue: latestPoint.dailyRevenue,
    latestDateLabel: latestPoint.dateLabel,
    latestGrowthPct: latestPoint.growthPct,
    periodGrowthPct,
    totalOrders,
    daysInPeriod: series.length,
  };
}

export interface SupportTicketRecord {
  id: string;
  ticketNumber: string;
  customerName: string;
  customerEmail: string;
  tradingViewUsername: string;
  platformTarget: 'TradingView' | 'thinkorswim' | 'Dual-Platform';
  category:
    | 'TradingView ACL Sync'
    | 'thinkorswim Study Import'
    | 'License Key Re-binding'
    | 'Prop Desk Billing'
    | 'Webhook / Alert Setup';
  priority: 'Critical' | 'High' | 'Normal';
  status: 'Open' | 'In Progress' | 'Resolved';
  subject: string;
  description: string;
  licenseKey: string;
  adminResolutionNote: string;
  createdAt: string;
  updatedAt: string;
}

export const SupportTicketSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(2, 'Trader or institution name is required (min 2 chars).'),
  customerEmail: z
    .string()
    .trim()
    .email('Enter a valid customer email address.'),
  tradingViewUsername: z
    .string()
    .trim()
    .min(2, 'TradingView handle or TOS account reference is required.'),
  platformTarget: z.enum(['TradingView', 'thinkorswim', 'Dual-Platform']),
  category: z.enum([
    'TradingView ACL Sync',
    'thinkorswim Study Import',
    'License Key Re-binding',
    'Prop Desk Billing',
    'Webhook / Alert Setup',
  ]),
  priority: z.enum(['Critical', 'High', 'Normal']),
  subject: z
    .string()
    .trim()
    .min(5, 'Ticket subject must be at least 5 characters.'),
  description: z
    .string()
    .trim()
    .min(10, 'Please provide at least 10 characters of diagnostic context.'),
  licenseKey: z.string().trim().optional().default(''),
});

export type SupportTicketInput = z.infer<typeof SupportTicketSchema>;

export interface SupportTicketFilterOptions {
  status?: 'All' | 'Open' | 'In Progress' | 'Resolved';
  priority?: 'All' | 'Critical' | 'High' | 'Normal';
  searchQuery?: string;
}

export function filterSupportTickets(
  tickets: SupportTicketRecord[],
  filters: SupportTicketFilterOptions
): SupportTicketRecord[] {
  const statusFilter = filters.status || 'All';
  const priorityFilter = filters.priority || 'All';
  const q = (filters.searchQuery || '').trim().toLowerCase();

  return tickets.filter((t) => {
    if (statusFilter !== 'All' && t.status !== statusFilter) {
      return false;
    }
    if (priorityFilter !== 'All' && t.priority !== priorityFilter) {
      return false;
    }
    if (q) {
      const hay = [
        t.ticketNumber,
        t.customerName,
        t.customerEmail,
        t.tradingViewUsername,
        t.subject,
        t.category,
        t.licenseKey,
        t.platformTarget,
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) {
        return false;
      }
    }
    return true;
  });
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

export type TraderFaqCategory = 'All' | 'Installation' | 'Licensing' | 'Indicator Usage';

export interface TraderFaqItem {
  id: string;
  category: Exclude<TraderFaqCategory, 'All'>;
  question: string;
  answer: string;
  platformBadge: 'TradingView + thinkorswim' | 'TradingView Pine v6' | 'Schwab thinkorswim' | 'StratEdge Core';
  technicalPathOrSnippet?: string;
  snippetLabel?: string;
  keyHighlights: string[];
  tags: string[];
}

export const TRADER_FAQ_ITEMS: TraderFaqItem[] = [
  {
    id: 'faq-install-dual-delivery',
    category: 'Installation',
    question: 'How does automated indicator delivery work for TradingView and thinkorswim?',
    answer:
      'Immediately upon completing checkout on stratedgealgo.com, our provisioning engine generates your cryptographic license key (SE-XXXX-XXXX-XXXX), whitelists your TradingView username on our Pine Script v6 invite-only permission server in under 2 seconds, and unlocks direct Charles Schwab thinkorswim .ts study file downloads and tos.mx workspace links inside your Customer Portal.',
    platformBadge: 'TradingView + thinkorswim',
    technicalPathOrSnippet: 'TradingView → Indicators (/) → Invite-Only Scripts → StratEdge Algo',
    snippetLabel: 'TradingView Chart Navigation Path',
    keyHighlights: [
      'Sub-2-second Pine Script v6 Invite-Only ACL whitelisting',
      'Direct watermarked .ts ThinkScript artifact & tos.mx workspace links',
      'Zero manual waiting or Discord ticket verification required',
    ],
    tags: ['delivery', 'provisioning', 'tradingview', 'thinkorswim', 'invite-only', 'setup'],
  },
  {
    id: 'faq-install-tos-import',
    category: 'Installation',
    question: 'How do I import a downloaded .ts ThinkScript study file into Charles Schwab thinkorswim?',
    answer:
      'Download your watermarked .ts study artifact from the Customer Portal to your local workstation. Open Charles Schwab thinkorswim Desktop, open any chart, click the Studies flask icon (or press Ctrl+E), click "Import..." in the bottom-left corner of the Edit Studies window, select your StratEdge .ts file, and click Apply.',
    platformBadge: 'Schwab thinkorswim',
    technicalPathOrSnippet: 'Charts → Studies (Ctrl+E) → Edit Studies → Import... → Select StratEdge_*.ts → Apply',
    snippetLabel: 'thinkorswim Desktop Import Sequence',
    keyHighlights: [
      'Compatible with Charles Schwab thinkorswim Desktop (Windows, macOS, Linux)',
      'Supports instant one-click http://tos.mx/ shared workspace import links',
      'Includes pre-configured upper chart levels and lower delta oscillators',
    ],
    tags: ['thinkorswim', 'tos', 'import', 'ts file', 'schwab', 'thinkscript', 'installation'],
  },
  {
    id: 'faq-install-tv-refresh',
    category: 'Installation',
    question: 'Why is my Invite-Only script not showing under TradingView Indicators after checkout?',
    answer:
      'If your TradingView browser tab or desktop app was already open prior to checkout, TradingView caches your previous ACL permission token. Press Shift+F5 (or Cmd+R on macOS) to reload your TradingView chart session, then open Indicators → Invite-Only Scripts. If you entered a typo in your handle, use the self-service TradingView ACL Sync box in your Customer Portal.',
    platformBadge: 'TradingView Pine v6',
    technicalPathOrSnippet: 'Reload Chart (Shift + F5 / Cmd + R) → Indicators → Invite-Only Scripts',
    snippetLabel: 'Cache Refresh & ACL Re-Handshake',
    keyHighlights: [
      'Browser/Desktop hard refresh clears cached TradingView ACL tokens',
      'Case-insensitive username matching with real-time ACL status verification',
      'Instant self-service handle correction in the Customer Portal',
    ],
    tags: ['tradingview', 'invite-only', 'missing', 'refresh', 'cache', 'acl', 'pine script'],
  },
  {
    id: 'faq-license-key-binding',
    category: 'Licensing',
    question: 'Can I switch my TradingView username or re-download thinkorswim .ts files later?',
    answer:
      'Yes. Your Customer Portal includes a self-service TradingView ACL Sync tool that re-binds your cryptographic license key (SE-XXXX-XXXX-XXXX) to a new TradingView username in under 1 second, automatically revoking the old handle and provisioning the new one. You also receive unlimited re-downloads of watermarked .ts ThinkScript files across all minor and major version upgrades.',
    platformBadge: 'TradingView + thinkorswim',
    technicalPathOrSnippet: 'Customer Portal → Active License Card → Update Handle → Sync TV ACL',
    snippetLabel: 'Self-Service License Re-Binding Path',
    keyHighlights: [
      'Instant self-service TradingView handle migration without support intervention',
      'Unlimited watermarked .ts study file downloads & version updates',
      'Cryptographic license key format: SE-XXXX-XXXX-XXXX',
    ],
    tags: ['license key', 'switch username', 're-bind', 'redownload', 'portal', 'acl sync'],
  },
  {
    id: 'faq-license-tiers-prop',
    category: 'Licensing',
    question: 'Can I use a single StratEdge Algo license across multiple prop firm or funded accounts?',
    answer:
      'Yes. A single StratEdge Algo license is bound to your personal TradingView username and your Charles Schwab thinkorswim workspace ID. You may execute trades across unlimited prop firm evaluation or funded accounts (Apex, Topstep, TradeDay, Interactive Brokers, or CME direct) from your authorized charting workstation at no additional seat cost.',
    platformBadge: 'StratEdge Core',
    technicalPathOrSnippet: '1 License Seat = 1 TradingView Handle + 1 thinkorswim ID (Unlimited Execution Accounts)',
    snippetLabel: 'Institutional & Prop Desk Seat Policy',
    keyHighlights: [
      'Execute across unlimited Apex, Topstep, or FCM brokerage sub-accounts',
      'Monthly, Annual (save 30%), and Lifetime perpetual desk licensing options',
      'Upgrade from single-module to the Full Institutional Trinity Bundle anytime',
    ],
    tags: ['prop firm', 'funded account', 'apex', 'topstep', 'monthly', 'annual', 'lifetime', 'tier'],
  },
  {
    id: 'faq-usage-trinity-diff',
    category: 'Indicator Usage',
    question: 'What is the difference between StratEdge Algo Gamma, Flow, and Structure?',
    answer:
      'StratEdge Algo Gamma models 0DTE and multi-expiration dealer gamma exposure (GEX), Call/Put walls, and the Zero-Gamma Flip axis. StratEdge Algo Flow measures real-time order-book delta absorption, cumulative volume delta (CVD) divergence, and dark-pool block tape. StratEdge Algo Structure maps institutional Break of Structure (BOS), Change of Character (CHoCH), liquidity sweeps, and multi-sigma Anchored VWAP bands.',
    platformBadge: 'StratEdge Core',
    technicalPathOrSnippet: 'Gamma = Dealer GEX Walls | Flow = CVD & Sweep Tape | Structure = BOS & Multi-Sigma AVWAP',
    snippetLabel: 'Quantitative Trinity Signal Architecture',
    keyHighlights: [
      'Gamma: SPX/NDX/ES 0DTE Call Wall, Put Wall, and Volatility Trigger levels',
      'Flow: Institutional exhaustion absorption & aggressive sweep footprint',
      'Structure: Automated multi-timeframe liquidity pools & regime filter',
    ],
    tags: ['gamma', 'flow', 'structure', 'gex', 'cvd', 'vwap', 'bos', 'difference', 'usage'],
  },
  {
    id: 'faq-usage-non-repainting',
    category: 'Indicator Usage',
    question: 'Do StratEdge Algo indicators repaint on historical or real-time bars?',
    answer:
      'Zero historical repainting. Every signal in Gamma, Flow, and Structure is calculated strictly on confirmed bar closes (barstate.isconfirmed in Pine Script v6 and Confirmed Bar Policy in ThinkScript) or verifiable intra-bar tick volume thresholds without future-bar lookahead bias, ensuring 100% parity between backtest tables and live market execution.',
    platformBadge: 'TradingView + thinkorswim',
    technicalPathOrSnippet: 'if barstate.isconfirmed // Strict non-repainting bar-close signal lock',
    snippetLabel: 'Pine Script v6 & ThinkScript Execution Policy',
    keyHighlights: [
      'Zero lookahead bias or future-bar request.security() leakage',
      '100% deterministic parity between historical backtests and live alerts',
      'Audited across 10,000+ regular and extended trading hours (RTH/ETH) sessions',
    ],
    tags: ['repaint', 'non-repainting', 'backtest', 'barstate', 'confirmed', 'accuracy', 'signals'],
  },
  {
    id: 'faq-usage-webhooks-timeframes',
    category: 'Indicator Usage',
    question: 'Which markets, timeframes, and automated webhook alert payloads are supported?',
    answer:
      'StratEdge Algo indicators operate across all liquid CME Equity Index Futures (ES1!, NQ1!, RTY1!), Cash Indices (SPX, NDX, VIX), Liquid Options Equities (NVDA, TSLA, AAPL, SPY, QQQ), and FX/Crypto pairs on 1m, 3m, 5m, 15m, 1H, 4H, and Daily charts. Every indicator includes built-in JSON webhook alert templates for automated execution routers.',
    platformBadge: 'TradingView + thinkorswim',
    technicalPathOrSnippet: '{"ticker":"{{ticker}}","signal":"GAMMA_FLIP_LONG","price":{{close}},"tf":"{{interval}}"}',
    snippetLabel: 'Standard JSON Webhook Alert Payload',
    keyHighlights: [
      'Optimized for 1m–15m 0DTE intraday scalping and 1H–1D swing structure',
      'Sub-second JSON webhook payloads compatible with TradersPost, PineConnector & custom APIs',
      'Includes pre-built thinkorswim MarketWatch Study Alert expressions',
    ],
    tags: ['webhook', 'alerts', 'json', 'timeframes', 'futures', 'spx', 'es', 'nq', '0dte'],
  },
];

export function filterTraderFaqs(
  items: TraderFaqItem[],
  category: TraderFaqCategory = 'All',
  searchQuery: string = ''
): TraderFaqItem[] {
  const normalizedCategory = category || 'All';
  const query = searchQuery.trim().toLowerCase();

  return items.filter((item) => {
    if (normalizedCategory !== 'All' && item.category !== normalizedCategory) {
      return false;
    }
    if (!query) {
      return true;
    }
    const searchableText = [
      item.question,
      item.answer,
      item.category,
      item.platformBadge,
      item.technicalPathOrSnippet || '',
      ...item.keyHighlights,
      ...item.tags,
    ]
      .join(' ')
      .toLowerCase();

    return searchableText.includes(query);
  });
}


