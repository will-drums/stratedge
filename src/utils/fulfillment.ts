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
