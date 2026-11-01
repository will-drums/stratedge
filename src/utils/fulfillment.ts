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

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  senderRole: 'client' | 'engineer' | 'system';
  senderName: string;
  senderHandleOrTitle: string;
  body: string;
  diagnosticSnippet?: string;
  createdAt: string;
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
  supportKey?: string;
  messages?: SupportTicketMessage[];
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

export const SupportTicketMessageSchema = z.object({
  ticketId: z.string().trim().min(1, 'Ticket ID is required.'),
  senderRole: z.enum(['client', 'engineer', 'system']).default('client'),
  senderName: z.string().trim().min(2, 'Sender name is required.'),
  senderHandleOrTitle: z.string().trim().optional().default('Authorized Trader'),
  body: z
    .string()
    .trim()
    .min(4, 'Message must contain at least 4 characters.')
    .max(2500, 'Message must be under 2,500 characters.'),
  diagnosticSnippet: z.string().trim().optional().default(''),
});

export type SupportTicketMessageInput = z.infer<typeof SupportTicketMessageSchema>;

export interface SupportTicketFilterOptions {
  status?: 'All' | 'Open' | 'In Progress' | 'Resolved';
  priority?: 'All' | 'Critical' | 'High' | 'Normal';
  customerEmail?: string;
  searchQuery?: string;
}

export function buildDefaultTicketMessages(
  ticket: SupportTicketRecord
): SupportTicketMessage[] {
  if (Array.isArray(ticket.messages) && ticket.messages.length > 0) {
    return ticket.messages;
  }

  const thread: SupportTicketMessage[] = [
    {
      id: `${ticket.id}-msg-1`,
      ticketId: ticket.id,
      senderRole: 'client',
      senderName: ticket.customerName,
      senderHandleOrTitle: `@${ticket.tradingViewUsername} · ${ticket.platformTarget}`,
      body: ticket.description,
      diagnosticSnippet: `License: ${ticket.licenseKey} | Category: ${ticket.category} | Priority: ${ticket.priority}`,
      createdAt: ticket.createdAt,
    },
    {
      id: `${ticket.id}-msg-2`,
      ticketId: ticket.id,
      senderRole: 'system',
      senderName: 'StratEdge Automated Triage Router',
      senderHandleOrTitle: 'Cryptographic Entitlement & SLA Engine',
      body: `Ticket ${ticket.ticketNumber} authenticated and linked to license ${ticket.licenseKey}. Target SLA response window for ${ticket.priority} priority: ${
        ticket.priority === 'Critical'
          ? '< 10 minutes'
          : ticket.priority === 'High'
          ? '< 25 minutes'
          : '< 2 hours'
      }.`,
      createdAt: ticket.createdAt,
    },
  ];

  if (ticket.adminResolutionNote && ticket.adminResolutionNote.trim().length > 0) {
    thread.push({
      id: `${ticket.id}-msg-3`,
      ticketId: ticket.id,
      senderRole: 'engineer',
      senderName: 'Dr. Julian Vance — Senior Quant Engineer',
      senderHandleOrTitle: 'StratEdge Quantitative Execution Desk',
      body: ticket.adminResolutionNote.trim(),
      diagnosticSnippet:
        ticket.platformTarget === 'thinkorswim'
          ? 'input secondaryAggregation = AggregationPeriod.FIFTEEN_MIN; # Confirmed Non-Repainting Lock'
          : `ACL Status: 200 OK — Whitelisted @${ticket.tradingViewUsername} (${ticket.licenseKey})`,
      createdAt: ticket.updatedAt || ticket.createdAt,
    });
  }

  return thread;
}

export function appendTicketMessage(
  ticket: SupportTicketRecord,
  input: SupportTicketMessageInput,
  timestampIso: string = '2026-11-01 09:30:00 UTC'
): SupportTicketRecord {
  const existingMessages = buildDefaultTicketMessages(ticket);
  const newMsg: SupportTicketMessage = {
    id: `${ticket.id}-msg-${existingMessages.length + 1}-${Date.now()}`,
    ticketId: ticket.id,
    senderRole: input.senderRole,
    senderName: input.senderName.trim(),
    senderHandleOrTitle:
      input.senderHandleOrTitle?.trim() ||
      (input.senderRole === 'engineer'
        ? 'StratEdge Quantitative Execution Desk'
        : `@${ticket.tradingViewUsername}`),
    body: input.body.trim(),
    diagnosticSnippet: input.diagnosticSnippet?.trim() || undefined,
    createdAt: timestampIso,
  };

  let nextStatus = ticket.status;
  if (input.senderRole === 'engineer' && ticket.status === 'Open') {
    nextStatus = 'In Progress';
  } else if (input.senderRole === 'client' && ticket.status === 'Resolved') {
    nextStatus = 'In Progress';
  }

  return {
    ...ticket,
    status: nextStatus,
    updatedAt: timestampIso,
    adminResolutionNote:
      input.senderRole === 'engineer' ? input.body.trim() : ticket.adminResolutionNote,
    messages: [...existingMessages, newMsg],
  };
}

export interface TicketLifecycleStage {
  step: 1 | 2 | 3;
  label: string;
  sublabel: string;
  completed: boolean;
  active: boolean;
}

export interface TicketLifecycleProgress {
  currentStageIndex: 1 | 2 | 3;
  completionPct: number;
  slaTargetLabel: string;
  stages: TicketLifecycleStage[];
}

export function computeTicketLifecycleProgress(
  status: SupportTicketRecord['status'],
  priority: SupportTicketRecord['priority'] = 'Normal'
): TicketLifecycleProgress {
  const currentStageIndex: 1 | 2 | 3 =
    status === 'Resolved' ? 3 : status === 'In Progress' ? 2 : 1;
  const completionPct =
    status === 'Resolved' ? 100 : status === 'In Progress' ? 66 : 33;
  const slaTargetLabel =
    priority === 'Critical'
      ? '< 10m Priority Desk SLA'
      : priority === 'High'
      ? '< 25m Priority Desk SLA'
      : '< 2h Standard Desk SLA';

  const stages: TicketLifecycleStage[] = [
    {
      step: 1,
      label: '1. Ticket Logged & ACL Verified',
      sublabel: 'Cryptographic license key & platform handle authenticated',
      completed: currentStageIndex >= 1,
      active: currentStageIndex === 1,
    },
    {
      step: 2,
      label: '2. Quant Engineer Assigned',
      sublabel: 'Active diagnostic triage & Pine v6 / ThinkScript verification',
      completed: currentStageIndex >= 2,
      active: currentStageIndex === 2,
    },
    {
      step: 3,
      label: '3. Resolution Verified',
      sublabel: 'Fix confirmed in production & transcript archived in vault',
      completed: currentStageIndex === 3,
      active: currentStageIndex === 3,
    },
  ];

  return {
    currentStageIndex,
    completionPct,
    slaTargetLabel,
    stages,
  };
}

export interface ClientTicketStatusSummary {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  criticalActive: number;
  totalMessages: number;
}

export function computeClientTicketStatusSummary(
  tickets: SupportTicketRecord[],
  customerEmail?: string
): ClientTicketStatusSummary {
  const emailNorm = (customerEmail || '').trim().toLowerCase();
  const scoped = emailNorm
    ? tickets.filter((t) => t.customerEmail.toLowerCase() === emailNorm)
    : tickets;

  let open = 0;
  let inProgress = 0;
  let resolved = 0;
  let criticalActive = 0;
  let totalMessages = 0;

  for (const t of scoped) {
    if (t.status === 'Open') open += 1;
    else if (t.status === 'In Progress') inProgress += 1;
    else if (t.status === 'Resolved') resolved += 1;

    if (t.priority === 'Critical' && t.status !== 'Resolved') {
      criticalActive += 1;
    }
    totalMessages += buildDefaultTicketMessages(t).length;
  }

  return {
    total: scoped.length,
    open,
    inProgress,
    resolved,
    criticalActive,
    totalMessages,
  };
}

export function filterSupportTickets(
  tickets: SupportTicketRecord[],
  filters: SupportTicketFilterOptions
): SupportTicketRecord[] {
  const statusFilter = filters.status || 'All';
  const priorityFilter = filters.priority || 'All';
  const emailFilter = (filters.customerEmail || '').trim().toLowerCase();
  const q = (filters.searchQuery || '').trim().toLowerCase();

  return tickets.filter((t) => {
    if (emailFilter && t.customerEmail.toLowerCase() !== emailFilter) {
      return false;
    }
    if (statusFilter !== 'All' && t.status !== statusFilter) {
      return false;
    }
    if (priorityFilter !== 'All' && t.priority !== priorityFilter) {
      return false;
    }
    if (q) {
      const msgBodies = (t.messages || []).map((m) => m.body).join(' ');
      const hay = [
        t.ticketNumber,
        t.customerName,
        t.customerEmail,
        t.tradingViewUsername,
        t.subject,
        t.description,
        t.category,
        t.licenseKey,
        t.platformTarget,
        msgBodies,
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

export type HeroDepthMode = 'Gamma' | 'Flow' | 'Structure';
export type HeroInstrumentFeed = 'SPX 0DTE' | 'ES1! Futures' | 'NQ1! Futures';

export interface LiquidityGridNode {
  row: number; // 0..7 (Strike / Price Level axis)
  col: number; // 0..7 (Time / Depth Book Horizon axis)
  x: number;
  z: number;
  baseHeight: number;
  side: 'bid' | 'ask' | 'equilibrium';
  intensity: number; // 0..1 normalized liquidity concentration
}

export interface LiquidityDepthMatrixResult {
  nodes: LiquidityGridNode[];
  bidWallTotalMillions: number;
  askWallTotalMillions: number;
  imbalancePct: number;
  equilibriumStrikeLabel: string;
  netRegimeLabel: string;
}

export function computeLiquidityDepthMatrix(
  mode: HeroDepthMode = 'Gamma',
  instrument: HeroInstrumentFeed = 'SPX 0DTE',
  gridSize: number = 8
): LiquidityDepthMatrixResult {
  const safeSize = Math.max(4, Math.min(12, Math.round(gridSize)));
  const instMultiplier =
    instrument === 'SPX 0DTE' ? 1.0 : instrument === 'ES1! Futures' ? 1.16 : 1.28;

  const nodes: LiquidityGridNode[] = [];
  let bidSum = 0;
  let askSum = 0;
  const half = (safeSize - 1) / 2;

  for (let r = 0; r < safeSize; r++) {
    for (let c = 0; c < safeSize; c++) {
      const normR = (r - half) / half; // -1 to +1 (Bid levels < 0, Ask levels > 0)
      const normC = (c - half) / half; // -1 to +1 (Near book to deep book)

      const x = Number(((r - half) * 0.78).toFixed(3));
      const z = Number(((c - half) * 0.74).toFixed(3));

      let rawHeight = 0.8;
      let side: 'bid' | 'ask' | 'equilibrium' = 'equilibrium';

      if (mode === 'Gamma') {
        // Steep dealer GEX Call Wall & Put Wall with a crisp Zero-Gamma Flip trough in the center
        const wallCurve = Math.pow(Math.abs(normR), 1.35) * 2.15;
        const termDecay = (1 - Math.abs(normC) * 0.32) * 0.65;
        rawHeight = (0.38 + wallCurve + termDecay) * instMultiplier;
        side = normR < -0.18 ? 'bid' : normR > 0.18 ? 'ask' : 'equilibrium';
      } else if (mode === 'Flow') {
        // Order-book L2 depth ladder + aggressive sweep clusters along diagonal tape
        const ladder = Math.abs(normR) * 1.45 + (c / safeSize) * 0.85;
        const cluster = Math.sin(r * 0.95 + c * 0.75) * 0.48 + 0.55;
        rawHeight = (0.42 + ladder * 0.72 + cluster) * instMultiplier;
        side = normR < -0.1 ? 'bid' : normR > 0.1 ? 'ask' : 'equilibrium';
      } else {
        // Institutional VWAP & Liquidity Structure shelves at +/- 1.5 sigma and 2.5 sigma
        const sigmaShelf = Math.cos(normR * Math.PI * 1.5) * 0.65 + 1.15;
        const depthStep = (c / safeSize) * 0.7 + 0.35;
        rawHeight = (sigmaShelf + depthStep * 0.6) * instMultiplier;
        side = normR < -0.15 ? 'bid' : normR > 0.15 ? 'ask' : 'equilibrium';
      }

      const clampedHeight = Number(Math.min(3.35, Math.max(0.32, rawHeight)).toFixed(3));
      const intensity = Number(
        Math.min(1, Math.max(0.1, (clampedHeight - 0.3) / 3.05)).toFixed(3)
      );

      if (side === 'bid') {
        bidSum += clampedHeight * 18.4;
      } else if (side === 'ask') {
        askSum += clampedHeight * 21.2;
      } else {
        bidSum += clampedHeight * 8.5;
        askSum += clampedHeight * 9.1;
      }

      nodes.push({
        row: r,
        col: c,
        x,
        z,
        baseHeight: clampedHeight,
        side,
        intensity,
      });
    }
  }

  const bidWallTotalMillions = Math.round(bidSum);
  const askWallTotalMillions = Math.round(askSum);
  const totalDepth = Math.max(1, bidWallTotalMillions + askWallTotalMillions);
  const imbalancePct = Number(
    (((askWallTotalMillions - bidWallTotalMillions) / totalDepth) * 100).toFixed(1)
  );

  const equilibriumStrikeLabel =
    instrument === 'SPX 0DTE'
      ? '5,865.00 (+2.14σ)'
      : instrument === 'ES1! Futures'
      ? '5,894.25 (+1.88σ)'
      : '20,648.50 (+2.42σ)';

  const netRegimeLabel =
    mode === 'Gamma'
      ? '+$2.48B Call Wall Pin'
      : mode === 'Flow'
      ? '+19,420 Net Delta Sweep'
      : 'Bullish BOS Confirmed';

  return {
    nodes,
    bidWallTotalMillions,
    askWallTotalMillions,
    imbalancePct,
    equilibriumStrikeLabel,
    netRegimeLabel,
  };
}

export type EnterpriseViewportTier = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface EnterpriseViewportConfig {
  tier: EnterpriseViewportTier;
  widthPx: number;
  heightPx: number;
  aspectRatio: number;
  deviceCategoryLabel: string;
  navigationMode: 'mobile-drawer' | 'desktop-inline';
  catalogColumns: 1 | 2 | 3;
  kpiColumns: 1 | 2 | 4;
  checkoutStepperColumns: 1 | 3;
  heroCameraDistanceMultiplier: number;
  heroCanvasHeightPx: number;
}

export const ENTERPRISE_BREAKPOINTS_2026 = {
  xsMax: 480, // Compact & Standard Smartphones (iPhone SE, iPhone 16/17 Pro, Galaxy S26, Foldable Cover)
  smMax: 767, // Large Phablets & Unfolded Foldables (Pixel Pro Fold, Galaxy Z Fold)
  mdMax: 1023, // Tablet Portrait (iPad Mini, iPad Air 768x1024, 820x1180)
  lgMax: 1279, // Tablet Landscape & Compact 13" Laptops (iPad Pro 1024x768, 1280x800)
  xlMax: 1535, // Standard Enterprise Desktop (1366x768, 1440x900)
  ultraWideMin: 1536, // Ultra-Wide & 4K Multi-Monitor Trading Desks (1920x1080, 2560x1440, 3840x2160)
} as const;

export function resolveEnterpriseViewportTier(
  widthPx: number,
  heightPx: number = 900
): EnterpriseViewportConfig {
  const safeW = Math.max(280, Math.round(Number(widthPx) || 1440));
  const safeH = Math.max(320, Math.round(Number(heightPx) || 900));
  const aspectRatio = Number((safeW / safeH).toFixed(3));

  if (safeW <= ENTERPRISE_BREAKPOINTS_2026.xsMax) {
    return {
      tier: 'xs',
      widthPx: safeW,
      heightPx: safeH,
      aspectRatio,
      deviceCategoryLabel: 'Compact / Standard Mobile Handset',
      navigationMode: 'mobile-drawer',
      catalogColumns: 1,
      kpiColumns: 1,
      checkoutStepperColumns: 1,
      heroCameraDistanceMultiplier: safeW <= 380 ? 1.18 : 1.12,
      heroCanvasHeightPx: 250,
    };
  }

  if (safeW <= ENTERPRISE_BREAKPOINTS_2026.smMax) {
    return {
      tier: 'sm',
      widthPx: safeW,
      heightPx: safeH,
      aspectRatio,
      deviceCategoryLabel: 'Phablet / Foldable Unfolded',
      navigationMode: 'mobile-drawer',
      catalogColumns: 1,
      kpiColumns: 2,
      checkoutStepperColumns: 1,
      heroCameraDistanceMultiplier: 1.06,
      heroCanvasHeightPx: 280,
    };
  }

  if (safeW <= ENTERPRISE_BREAKPOINTS_2026.mdMax) {
    return {
      tier: 'md',
      widthPx: safeW,
      heightPx: safeH,
      aspectRatio,
      deviceCategoryLabel: 'Tablet Portrait Workspace',
      navigationMode: 'mobile-drawer',
      catalogColumns: 2,
      kpiColumns: 2,
      checkoutStepperColumns: 3,
      heroCameraDistanceMultiplier: 1.02,
      heroCanvasHeightPx: 310,
    };
  }

  if (safeW <= ENTERPRISE_BREAKPOINTS_2026.lgMax) {
    return {
      tier: 'lg',
      widthPx: safeW,
      heightPx: safeH,
      aspectRatio,
      deviceCategoryLabel: 'Tablet Landscape / Compact Laptop',
      navigationMode: 'desktop-inline',
      catalogColumns: 2,
      kpiColumns: 4,
      checkoutStepperColumns: 3,
      heroCameraDistanceMultiplier: 1.04,
      heroCanvasHeightPx: 325,
    };
  }

  if (safeW <= ENTERPRISE_BREAKPOINTS_2026.xlMax) {
    return {
      tier: 'xl',
      widthPx: safeW,
      heightPx: safeH,
      aspectRatio,
      deviceCategoryLabel: 'Standard Enterprise Desktop',
      navigationMode: 'desktop-inline',
      catalogColumns: 3,
      kpiColumns: 4,
      checkoutStepperColumns: 3,
      heroCameraDistanceMultiplier: 1.0,
      heroCanvasHeightPx: 335,
    };
  }

  return {
    tier: '2xl',
    widthPx: safeW,
    heightPx: safeH,
    aspectRatio,
    deviceCategoryLabel: 'Ultra-Wide 4K Institutional Trading Desk',
    navigationMode: 'desktop-inline',
    catalogColumns: 3,
    kpiColumns: 4,
    checkoutStepperColumns: 3,
    heroCameraDistanceMultiplier: 0.96,
    heroCanvasHeightPx: 360,
  };
}

export type PriceAlertChannel = 'email' | 'sms';

export interface PurchasedProductAlertLike {
  id: string;
  licenseKey: string;
  customerEmail: string;
  customerName: string;
  indicatorId: string;
  indicatorName: string;
  billingCycle: 'Monthly' | 'Annual' | 'Lifetime';
  tradingViewUsername: string;
  tvAccessStatus: 'Provisioned' | 'Pending Username' | 'Revoked';
  expiresAt: string;
  emailAlertsEnabled?: boolean;
  smsAlertsEnabled?: boolean;
}

export interface IndicatorPriceAlertOverride {
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  updatedAt?: string;
}

export interface IndicatorPriceAlertPreference {
  licenseId: string;
  licenseKey: string;
  indicatorId: string;
  indicatorName: string;
  billingCycle: 'Monthly' | 'Annual' | 'Lifetime';
  tvAccessStatus: 'Provisioned' | 'Pending Username' | 'Revoked';
  tradingViewUsername: string;
  expiresAt: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  signalTriggerLabel: string;
  monitoredTickersLabel: string;
  updatedAt: string;
}

export interface PriceAlertSummaryMetrics {
  totalSubscribedIndicators: number;
  emailEnabledCount: number;
  smsEnabledCount: number;
  dualChannelCount: number;
  anyChannelActiveCount: number;
  fullyMutedCount: number;
  activeCoveragePct: number;
}

export const PriceAlertDeliveryConfigSchema = z.object({
  emailDestination: z
    .string()
    .trim()
    .email('Enter a valid email address for price alert delivery'),
  smsPhoneDestination: z
    .string()
    .trim()
    .refine(
      (val) => {
        const digits = val.replace(/[^\d]/g, '');
        return digits.length >= 10 && digits.length <= 15;
      },
      {
        message: 'Enter a valid 10 to 15 digit SMS mobile number (e.g. +1 212-555-0194)',
      }
    ),
});

export type PriceAlertDeliveryConfig = z.infer<typeof PriceAlertDeliveryConfigSchema>;

export function resolveIndicatorAlertTriggerSpec(
  indicatorId: string,
  indicatorName: string = ''
): {
  signalTriggerLabel: string;
  monitoredTickersLabel: string;
} {
  const normalizedId = (indicatorId || '').toLowerCase();
  const normalizedName = (indicatorName || '').toLowerCase();

  if (normalizedId.includes('gamma') || normalizedName.includes('gamma')) {
    return {
      signalTriggerLabel: '0DTE Zero-Gamma Flip & Call/Put Wall Breach',
      monitoredTickersLabel: 'SPX · ES1! · NDX · QQQ',
    };
  }

  if (normalizedId.includes('flow') || normalizedName.includes('flow')) {
    return {
      signalTriggerLabel: 'CVD Absorption Divergence & >2.2σ Dark-Pool Sweep',
      monitoredTickersLabel: 'ES1! · NQ1! · NVDA · SPY',
    };
  }

  if (normalizedId.includes('structure') || normalizedName.includes('structure')) {
    return {
      signalTriggerLabel: 'Confirmed 1m/5m BOS/CHoCH & ±2.5σ AVWAP Touch',
      monitoredTickersLabel: 'ES1! · NQ1! · CL1! · GC1!',
    };
  }

  if (normalizedId.includes('bundle') || normalizedName.includes('bundle') || normalizedName.includes('trinity')) {
    return {
      signalTriggerLabel: 'Full Trinity Confluence (GEX Flip + CVD Sweep + BOS)',
      monitoredTickersLabel: 'SPX · ES1! · NQ1! · SPY',
    };
  }

  return {
    signalTriggerLabel: 'Confirmed Quantitative Regime & Key Level Alert',
    monitoredTickersLabel: 'ES1! · NQ1! · SPX',
  };
}

export function hydrateIndicatorPriceAlerts(
  licenses: PurchasedProductAlertLike[],
  overrides: Record<string, IndicatorPriceAlertOverride> = {},
  defaultUpdatedAt: string = '2026-11-01 09:30:00 UTC'
): IndicatorPriceAlertPreference[] {
  if (!Array.isArray(licenses)) return [];

  return licenses.map((lic) => {
    const ov = overrides[lic.id] || {};
    const isProvisioned = lic.tvAccessStatus === 'Provisioned';

    const defaultEmail =
      typeof lic.emailAlertsEnabled === 'boolean'
        ? lic.emailAlertsEnabled
        : isProvisioned;

    const defaultSms =
      typeof lic.smsAlertsEnabled === 'boolean'
        ? lic.smsAlertsEnabled
        : isProvisioned &&
          (lic.billingCycle === 'Lifetime' || lic.billingCycle === 'Annual');

    const emailEnabled =
      typeof ov.emailEnabled === 'boolean' ? ov.emailEnabled : defaultEmail;
    const smsEnabled =
      typeof ov.smsEnabled === 'boolean' ? ov.smsEnabled : defaultSms;

    const spec = resolveIndicatorAlertTriggerSpec(lic.indicatorId, lic.indicatorName);

    return {
      licenseId: lic.id,
      licenseKey: lic.licenseKey,
      indicatorId: lic.indicatorId,
      indicatorName: lic.indicatorName,
      billingCycle: lic.billingCycle,
      tvAccessStatus: lic.tvAccessStatus,
      tradingViewUsername: lic.tradingViewUsername,
      expiresAt: lic.expiresAt,
      emailEnabled,
      smsEnabled,
      signalTriggerLabel: spec.signalTriggerLabel,
      monitoredTickersLabel: spec.monitoredTickersLabel,
      updatedAt: ov.updatedAt || defaultUpdatedAt,
    };
  });
}

export function toggleIndicatorPriceAlert(
  overrides: Record<string, IndicatorPriceAlertOverride>,
  license: PurchasedProductAlertLike,
  channel: PriceAlertChannel,
  explicitValue?: boolean,
  nowLabel: string = '2026-11-01 10:00:00 UTC'
): Record<string, IndicatorPriceAlertOverride> {
  const [currentPref] = hydrateIndicatorPriceAlerts([license], overrides, nowLabel);
  const currentChannelState =
    channel === 'email' ? currentPref.emailEnabled : currentPref.smsEnabled;
  const nextValue =
    typeof explicitValue === 'boolean' ? explicitValue : !currentChannelState;

  const existingOverride = overrides[license.id] || {};
  return {
    ...overrides,
    [license.id]: {
      emailEnabled:
        channel === 'email' ? nextValue : currentPref.emailEnabled,
      smsEnabled:
        channel === 'sms' ? nextValue : currentPref.smsEnabled,
      updatedAt: nowLabel,
      ...existingOverride,
      ...(channel === 'email'
        ? { emailEnabled: nextValue, smsEnabled: currentPref.smsEnabled, updatedAt: nowLabel }
        : { emailEnabled: currentPref.emailEnabled, smsEnabled: nextValue, updatedAt: nowLabel }),
    },
  };
}

export function setAllIndicatorPriceAlerts(
  licenses: PurchasedProductAlertLike[],
  overrides: Record<string, IndicatorPriceAlertOverride>,
  channel: PriceAlertChannel | 'all',
  enabled: boolean,
  nowLabel: string = '2026-11-01 10:00:00 UTC'
): Record<string, IndicatorPriceAlertOverride> {
  const currentList = hydrateIndicatorPriceAlerts(licenses, overrides, nowLabel);
  const nextOverrides: Record<string, IndicatorPriceAlertOverride> = { ...overrides };

  for (const pref of currentList) {
    nextOverrides[pref.licenseId] = {
      emailEnabled:
        channel === 'email' || channel === 'all' ? enabled : pref.emailEnabled,
      smsEnabled:
        channel === 'sms' || channel === 'all' ? enabled : pref.smsEnabled,
      updatedAt: nowLabel,
    };
  }

  return nextOverrides;
}

export function computePriceAlertSummary(
  preferences: IndicatorPriceAlertPreference[]
): PriceAlertSummaryMetrics {
  const totalSubscribedIndicators = preferences.length;
  if (totalSubscribedIndicators === 0) {
    return {
      totalSubscribedIndicators: 0,
      emailEnabledCount: 0,
      smsEnabledCount: 0,
      dualChannelCount: 0,
      anyChannelActiveCount: 0,
      fullyMutedCount: 0,
      activeCoveragePct: 0,
    };
  }

  let emailEnabledCount = 0;
  let smsEnabledCount = 0;
  let dualChannelCount = 0;
  let anyChannelActiveCount = 0;

  for (const pref of preferences) {
    if (pref.emailEnabled) emailEnabledCount += 1;
    if (pref.smsEnabled) smsEnabledCount += 1;
    if (pref.emailEnabled && pref.smsEnabled) dualChannelCount += 1;
    if (pref.emailEnabled || pref.smsEnabled) anyChannelActiveCount += 1;
  }

  const fullyMutedCount = totalSubscribedIndicators - anyChannelActiveCount;
  const activeCoveragePct = Math.round(
    (anyChannelActiveCount / totalSubscribedIndicators) * 100
  );

  return {
    totalSubscribedIndicators,
    emailEnabledCount,
    smsEnabledCount,
    dualChannelCount,
    anyChannelActiveCount,
    fullyMutedCount,
    activeCoveragePct,
  };
}

export type BacktestTimeframe = '1m' | '5m' | '15m' | '1H' | '4H' | '1D';
export type BacktestLookbackWindow = '30D' | '90D' | '180D' | '1Y';

export const BacktestTickerInputSchema = z.object({
  ticker: z
    .string()
    .trim()
    .min(1, 'Enter a ticker symbol (e.g. ES1!, SPX, NVDA, NQ1!, SPY)')
    .max(14, 'Ticker symbol must be 14 characters or fewer')
    .transform((val) => val.toUpperCase())
    .refine((val) => /^[A-Z0-9!./_-]+$/.test(val), {
      message: 'Ticker symbol can only contain letters, numbers, and market symbols (!, /, ., -)',
    }),
  licenseId: z.string().trim().min(1, 'Select one of your purchased StratEdge Algo indicators'),
  timeframe: z.enum(['1m', '5m', '15m', '1H', '4H', '1D']).default('5m'),
  lookbackWindow: z.enum(['30D', '90D', '180D', '1Y']).default('90D'),
  startingCapital: z.number().min(1000).max(10000000).default(100000),
});

export type BacktestTickerInput = z.infer<typeof BacktestTickerInputSchema>;

export interface BacktestEquityPoint {
  stepIndex: number;
  dateLabel: string;
  strategyEquity: number;
  benchmarkEquity: number;
  cumulativeReturnPct: number;
  benchmarkReturnPct: number;
  drawdownPct: number;
  signalRegime: string;
}

export interface BacktestExecutedSignal {
  tradeId: string;
  timestamp: string;
  direction: 'LONG' | 'SHORT';
  signalTrigger: string;
  entryPrice: number;
  exitPrice: number;
  rMultiple: number;
  pnlUsd: number;
  pnlPct: number;
  outcome: 'WIN' | 'LOSS';
}

export interface PurchasedIndicatorBacktestResult {
  licenseId: string;
  licenseKey: string;
  indicatorId: string;
  indicatorName: string;
  billingCycle: 'Monthly' | 'Annual' | 'Lifetime';
  tradingViewUsername: string;
  ticker: string;
  timeframe: BacktestTimeframe;
  lookbackWindow: BacktestLookbackWindow;
  startingCapital: number;
  endingEquityUsd: number;
  netProfitUsd: number;
  netReturnPct: number;
  benchmarkBuyHoldReturnPct: number;
  alphaOutperformancePct: number;
  winRatePct: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgRMultiple: number;
  strategyArchitectureLabel: string;
  equityCurve: BacktestEquityPoint[];
  recentSignals: BacktestExecutedSignal[];
}

function hashSeedString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function resolveNominalTickerBasePrice(ticker: string): number {
  const clean = ticker.toUpperCase();
  if (clean.includes('SPX') || clean.includes('ES')) return 5865.0;
  if (clean.includes('NDX') || clean.includes('NQ')) return 20640.0;
  if (clean.includes('BTC')) return 69450.0;
  if (clean.includes('ETH')) return 2680.0;
  if (clean.includes('GC') || clean.includes('GOLD')) return 2745.0;
  if (clean.includes('CL') || clean.includes('OIL')) return 71.5;
  if (clean === 'SPY') return 584.5;
  if (clean === 'QQQ') return 502.25;
  if (clean === 'NVDA') return 141.8;
  if (clean === 'TSLA') return 258.4;
  if (clean === 'AAPL') return 231.9;
  if (clean === 'MSFT') return 428.6;
  const seed = hashSeedString(clean);
  return Number((85 + (seed % 420) + ((seed % 100) / 100)).toFixed(2));
}

export function simulatePurchasedIndicatorBacktest(
  license: PurchasedProductAlertLike,
  rawInput: {
    ticker: string;
    timeframe?: BacktestTimeframe;
    lookbackWindow?: BacktestLookbackWindow;
    startingCapital?: number;
  }
): PurchasedIndicatorBacktestResult {
  const ticker = (rawInput.ticker || 'ES1!').trim().toUpperCase() || 'ES1!';
  const timeframe: BacktestTimeframe = rawInput.timeframe || '5m';
  const lookbackWindow: BacktestLookbackWindow = rawInput.lookbackWindow || '90D';
  const startingCapital = Math.max(1000, Number(rawInput.startingCapital) || 100000);

  const indLower = `${license.indicatorId} ${license.indicatorName}`.toLowerCase();
  const isTrinity = indLower.includes('bundle') || indLower.includes('trinity');
  const isGamma = !isTrinity && indLower.includes('gamma');
  const isFlow = !isTrinity && indLower.includes('flow');

  let baseWinRate = 71.8;
  let baseProfitFactor = 2.68;
  let baseSharpe = 2.86;
  let baseMaxDd = 4.65;
  let strategyArchitectureLabel =
    'Confirmed 1m/5m BOS/CHoCH Liquidity Sweep + ±2.5σ Anchored VWAP Filter';
  let signalTemplates = [
    'Bullish CHoCH + -2.5σ AVWAP Reclaim',
    'Bearish BOS + Buy-Side Liquidity Sweep',
    'HTF Demand Zone + Bullish Displacement',
    'Session High Sweep + Bearish CHoCH',
  ];

  if (isTrinity) {
    baseWinRate = 76.4;
    baseProfitFactor = 3.28;
    baseSharpe = 3.42;
    baseMaxDd = 3.62;
    strategyArchitectureLabel =
      'Full Trinity Confluence (Dealer GEX Flip + >2.2σ CVD Absorption + Confirmed BOS)';
    signalTemplates = [
      '0DTE Put Wall Pin + +2.4σ CVD Sweep + Bullish BOS',
      'Zero-Gamma Flip Breakdown + Dark-Pool Sell Imbalance',
      'Call Wall Exhaustion + Bearish CVD Divergence + CHoCH',
      'Positive GEX Mean-Reversion + Passive Bid Absorption',
    ];
  } else if (isGamma) {
    baseWinRate = 74.2;
    baseProfitFactor = 2.96;
    baseSharpe = 3.14;
    baseMaxDd = 3.95;
    strategyArchitectureLabel =
      '0DTE & Multi-Expiry Dealer Gamma Exposure (GEX) Call/Put Wall & Zero-Gamma Flip Engine';
    signalTemplates = [
      '0DTE Put Wall Mean-Reversion Long',
      'Zero-Gamma Flip Volatility Expansion Breakout',
      'Dealer Call Wall Gamma Pin Rejection Short',
      'Positive GEX Regime Vanna Support Bounce',
    ];
  } else if (isFlow) {
    baseWinRate = 72.9;
    baseProfitFactor = 2.82;
    baseSharpe = 2.98;
    baseMaxDd = 4.28;
    strategyArchitectureLabel =
      'Order-Book Cumulative Volume Delta (CVD) Divergence & >2.2σ Dark-Pool Block Tape';
    signalTemplates = [
      'Bullish CVD Absorption Divergence at Session Low',
      'Institutional +2.6σ Block Sweep Breakout',
      'Bearish Ask Exhaustion + Delta Flip Short',
      'Dark-Pool Signature Print Reclaim Long',
    ];
  }

  const seed = hashSeedString(
    `${license.id}:${license.indicatorId}:${ticker}:${timeframe}:${lookbackWindow}`
  );

  const windowMultiplier =
    lookbackWindow === '30D'
      ? 0.45
      : lookbackWindow === '90D'
      ? 1.0
      : lookbackWindow === '180D'
      ? 1.68
      : 2.75;

  const tfTradeScale =
    timeframe === '1m'
      ? 1.85
      : timeframe === '5m'
      ? 1.35
      : timeframe === '15m'
      ? 1.0
      : timeframe === '1H'
      ? 0.68
      : timeframe === '4H'
      ? 0.44
      : 0.28;

  const winRateJitter = ((seed % 45) - 20) / 10; // -2.0% to +2.4%
  const winRatePct = Number(
    Math.min(84.5, Math.max(64.0, baseWinRate + winRateJitter)).toFixed(1)
  );

  const pfJitter = ((seed % 36) - 14) / 100;
  const profitFactor = Number(
    Math.min(4.25, Math.max(1.85, baseProfitFactor + pfJitter)).toFixed(2)
  );

  const sharpeJitter = ((seed % 30) - 12) / 100;
  const sharpeRatio = Number(
    Math.min(4.15, Math.max(1.95, baseSharpe + sharpeJitter)).toFixed(2)
  );

  const ddJitter = ((seed % 18) - 8) / 10;
  const maxDrawdownPct = Number(
    Math.min(8.4, Math.max(2.1, baseMaxDd + ddJitter)).toFixed(2)
  );

  const rawTrades = Math.round((88 + (seed % 34)) * windowMultiplier * tfTradeScale);
  const totalTrades = Math.max(18, rawTrades);
  const winningTrades = Math.round((totalTrades * winRatePct) / 100);
  const losingTrades = Math.max(1, totalTrades - winningTrades);
  const avgRMultiple = Number((1.85 + (profitFactor - 2.0) * 0.48).toFixed(2));

  // Generate 16-step equity curve across the lookback horizon
  const stepsCount = 16;
  const totalDays =
    lookbackWindow === '30D'
      ? 30
      : lookbackWindow === '90D'
      ? 90
      : lookbackWindow === '180D'
      ? 180
      : 365;

  const anchorEnd = new Date('2026-10-31T16:00:00Z');
  const equityCurve: BacktestEquityPoint[] = [];
  let currentStratEquity = startingCapital;
  let currentBenchEquity = startingCapital;
  let peakStratEquity = startingCapital;

  const targetReturnPct = Number(
    ((18.5 + (seed % 19) * 0.95) * windowMultiplier * (isTrinity ? 1.18 : 1.0)).toFixed(2)
  );
  const stepMeanGrowth = targetReturnPct / 100 / (stepsCount - 1);
  const benchMeanGrowth = (targetReturnPct * 0.31) / 100 / (stepsCount - 1);

  for (let i = 0; i < stepsCount; i++) {
    const daysAgo = Math.round(((stepsCount - 1 - i) / (stepsCount - 1)) * totalDays);
    const ptDate = new Date(anchorEnd.getTime() - daysAgo * 86400 * 1000);
    const dateLabel = ptDate.toISOString().slice(0, 10);

    if (i > 0) {
      const wave = Math.sin(i * 1.35 + (seed % 7)) * 0.0095;
      const dip = i === 5 || i === 11 ? -0.0085 : 0.003;
      const stepGrowth = Math.max(-0.016, stepMeanGrowth + wave + dip);
      const benchStep = benchMeanGrowth + Math.cos(i * 1.1 + (seed % 5)) * 0.0065;

      currentStratEquity = Math.round(currentStratEquity * (1 + stepGrowth));
      currentBenchEquity = Math.round(currentBenchEquity * (1 + benchStep));
    }

    if (currentStratEquity > peakStratEquity) {
      peakStratEquity = currentStratEquity;
    }

    const drawdownPct = Number(
      (((peakStratEquity - currentStratEquity) / peakStratEquity) * 100).toFixed(2)
    );
    const cumulativeReturnPct = Number(
      (((currentStratEquity - startingCapital) / startingCapital) * 100).toFixed(2)
    );
    const benchmarkReturnPct = Number(
      (((currentBenchEquity - startingCapital) / startingCapital) * 100).toFixed(2)
    );

    const signalRegime =
      signalTemplates[(i + (seed % signalTemplates.length)) % signalTemplates.length];

    equityCurve.push({
      stepIndex: i,
      dateLabel,
      strategyEquity: currentStratEquity,
      benchmarkEquity: currentBenchEquity,
      cumulativeReturnPct,
      benchmarkReturnPct,
      drawdownPct,
      signalRegime,
    });
  }

  const finalPoint = equityCurve[equityCurve.length - 1];
  const endingEquityUsd = finalPoint.strategyEquity;
  const netProfitUsd = endingEquityUsd - startingCapital;
  const netReturnPct = finalPoint.cumulativeReturnPct;
  const benchmarkBuyHoldReturnPct = finalPoint.benchmarkReturnPct;
  const alphaOutperformancePct = Number(
    (netReturnPct - benchmarkBuyHoldReturnPct).toFixed(2)
  );

  // Build 6 recent non-repainting historical trade executions for the input ticker
  const basePrice = resolveNominalTickerBasePrice(ticker);
  const recentSignals: BacktestExecutedSignal[] = [];
  for (let s = 0; s < 6; s++) {
    const isWin = s !== 2; // 5 wins, 1 controlled stop loss for realistic distribution
    const direction: 'LONG' | 'SHORT' = (seed + s) % 2 === 0 ? 'LONG' : 'SHORT';
    const priceOffset = ((s * 7 + (seed % 11)) - 15) * (basePrice * 0.0022);
    const entryPrice = Number((basePrice + priceOffset).toFixed(2));
    const movePct = isWin
      ? 0.0085 + ((seed + s * 3) % 9) * 0.0018
      : -0.0042;
    const rawExit =
      direction === 'LONG'
        ? entryPrice * (1 + movePct)
        : entryPrice * (1 - movePct);
    const exitPrice = Number(rawExit.toFixed(2));
    const rMultiple = isWin
      ? Number((1.8 + ((seed + s * 5) % 16) * 0.12).toFixed(2))
      : -1.0;
    const pnlPct = Number((movePct * 100 * (isWin ? 2.4 : 1.0)).toFixed(2));
    const pnlUsd = Math.round((startingCapital * 0.012) * rMultiple);

    const signalDate = new Date(anchorEnd.getTime() - (s * 3 + 1) * 86400 * 1000);
    const timestamp = `${signalDate.toISOString().slice(0, 10)} ${13 + (s % 6)}:${String(15 + s * 5).padStart(2, '0')} UTC`;

    recentSignals.push({
      tradeId: `BT-${ticker.replace(/[^A-Z0-9]/g, '').slice(0, 4)}-${940 + s}`,
      timestamp,
      direction,
      signalTrigger: signalTemplates[s % signalTemplates.length],
      entryPrice,
      exitPrice,
      rMultiple,
      pnlUsd,
      pnlPct,
      outcome: isWin ? 'WIN' : 'LOSS',
    });
  }

  return {
    licenseId: license.id,
    licenseKey: license.licenseKey,
    indicatorId: license.indicatorId,
    indicatorName: license.indicatorName,
    billingCycle: license.billingCycle,
    tradingViewUsername: license.tradingViewUsername,
    ticker,
    timeframe,
    lookbackWindow,
    startingCapital,
    endingEquityUsd,
    netProfitUsd,
    netReturnPct,
    benchmarkBuyHoldReturnPct,
    alphaOutperformancePct,
    winRatePct,
    profitFactor,
    sharpeRatio,
    maxDrawdownPct,
    totalTrades,
    winningTrades,
    losingTrades,
    avgRMultiple,
    strategyArchitectureLabel,
    equityCurve,
    recentSignals,
  };
}

export const QUICK_LOOK_TIMEFRAMES: readonly BacktestTimeframe[] = [
  '1m',
  '5m',
  '15m',
  '1H',
  '4H',
  '1D',
] as const;

export interface TimeframeQuickLookStat {
  timeframe: BacktestTimeframe;
  timeframeLabel: string;
  regimeTag: string;
  winRatePct: number;
  profitFactor: number;
  sharpeRatio: number;
  netReturnPct: number;
  maxDrawdownPct: number;
  avgRMultiple: number;
  totalTrades: number;
}

export interface IndicatorMultiTimeframeQuickLook {
  licenseId: string;
  licenseKey: string;
  indicatorId: string;
  indicatorName: string;
  benchmarkTicker: string;
  lookbackWindow: BacktestLookbackWindow;
  strategyArchitectureLabel: string;
  bestTimeframe: BacktestTimeframe;
  bestWinRatePct: number;
  bestProfitFactor: number;
  avgWinRatePct: number;
  avgProfitFactor: number;
  avgSharpeRatio: number;
  timeframes: TimeframeQuickLookStat[];
}

const TIMEFRAME_META_LABELS: Record<
  BacktestTimeframe,
  { label: string; regimeTag: string }
> = {
  '1m': { label: '1m Micro Scalp', regimeTag: '0DTE Tape' },
  '5m': { label: '5m Intraday Flow', regimeTag: 'Session Core' },
  '15m': { label: '15m Tactical Structure', regimeTag: 'IB Breakout' },
  '1H': { label: '1H Multi-Session', regimeTag: 'Vanna Trend' },
  '4H': { label: '4H Swing Structure', regimeTag: 'Macro BOS' },
  '1D': { label: '1D Institutional Position', regimeTag: 'HTF Regime' },
};

export function resolveDefaultQuickLookTicker(
  license: Pick<PurchasedProductAlertLike, 'indicatorId' | 'indicatorName'>
): string {
  const idLower = `${license.indicatorId} ${license.indicatorName}`.toLowerCase();
  if (idLower.includes('trinity')) return 'ES1!';
  if (idLower.includes('gamma')) return 'SPX';
  if (idLower.includes('flow')) return 'NQ1!';
  return 'ES1!';
}

/**
 * Pure multi-timeframe quick-look performance aggregator for the ClientDashboard
 * hover-interactive indicator tooltip module. Computes Win Rate, Profit Factor,
 * Sharpe Ratio, Net Return %, Max Drawdown %, and R-Multiple across 1m, 5m, 15m,
 * 1H, 4H, and 1D without requiring the user to open the full backtest workspace.
 */
export function buildIndicatorMultiTimeframeQuickLook(
  license: PurchasedProductAlertLike,
  benchmarkTicker?: string,
  lookbackWindow: BacktestLookbackWindow = '90D'
): IndicatorMultiTimeframeQuickLook {
  const resolvedTicker = (
    benchmarkTicker && benchmarkTicker.trim().length > 0
      ? benchmarkTicker.trim().toUpperCase()
      : resolveDefaultQuickLookTicker(license)
  );

  let strategyArchitectureLabel = '';
  const timeframes: TimeframeQuickLookStat[] = QUICK_LOOK_TIMEFRAMES.map((tf) => {
    const sim = simulatePurchasedIndicatorBacktest(license, {
      ticker: resolvedTicker,
      timeframe: tf,
      lookbackWindow,
      startingCapital: 100000,
    });
    if (!strategyArchitectureLabel) {
      strategyArchitectureLabel = sim.strategyArchitectureLabel;
    }
    const meta = TIMEFRAME_META_LABELS[tf];
    return {
      timeframe: tf,
      timeframeLabel: meta.label,
      regimeTag: meta.regimeTag,
      winRatePct: sim.winRatePct,
      profitFactor: sim.profitFactor,
      sharpeRatio: sim.sharpeRatio,
      netReturnPct: sim.netReturnPct,
      maxDrawdownPct: sim.maxDrawdownPct,
      avgRMultiple: sim.avgRMultiple,
      totalTrades: sim.totalTrades,
    };
  });

  // Identify optimal timeframe by composite edge score (Win Rate + Profit Factor * 12)
  let bestStat = timeframes[0];
  for (const stat of timeframes) {
    const currentScore = stat.winRatePct + stat.profitFactor * 12;
    const bestScore = bestStat.winRatePct + bestStat.profitFactor * 12;
    if (currentScore > bestScore) {
      bestStat = stat;
    }
  }

  const count = timeframes.length;
  const avgWinRatePct = Number(
    (timeframes.reduce((acc, s) => acc + s.winRatePct, 0) / count).toFixed(1)
  );
  const avgProfitFactor = Number(
    (timeframes.reduce((acc, s) => acc + s.profitFactor, 0) / count).toFixed(2)
  );
  const avgSharpeRatio = Number(
    (timeframes.reduce((acc, s) => acc + s.sharpeRatio, 0) / count).toFixed(2)
  );

  return {
    licenseId: license.id,
    licenseKey: license.licenseKey,
    indicatorId: license.indicatorId,
    indicatorName: license.indicatorName,
    benchmarkTicker: resolvedTicker,
    lookbackWindow,
    strategyArchitectureLabel,
    bestTimeframe: bestStat.timeframe,
    bestWinRatePct: bestStat.winRatePct,
    bestProfitFactor: bestStat.profitFactor,
    avgWinRatePct,
    avgProfitFactor,
    avgSharpeRatio,
    timeframes,
  };
}





