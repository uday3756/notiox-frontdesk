/**
 * Premium plans as used by Back Office referral tracking /
 * `public.subscriptions.plan` and `referral_attributions.premium_plan`.
 * Freemium / free is anything outside this set (or null).
 * Counts any user type who used the owner’s refer code — not students only.
 */
export const PREMIUM_PLANS = ['pro-monthly', 'pro-annual', 'founders'] as const

export type PremiumPlan = (typeof PREMIUM_PLANS)[number]

export function isPremiumPlan(plan: string | null | undefined): plan is PremiumPlan {
  if (!plan) return false
  return (PREMIUM_PLANS as readonly string[]).includes(plan)
}

export function premiumPlanLabel(plan: string | null | undefined): string {
  if (!plan) return '—'
  if (plan === 'pro-monthly') return 'Pro monthly'
  if (plan === 'pro-annual') return 'Pro annual'
  if (plan === 'founders') return 'Founders'
  return plan
}

export type OwnerPremiumPurchase = {
  clientId: string
  email: string
  fullName: string | null
  /** Referral code on the patient_doctor_links row (owner’s code). */
  referralCode: string
  plan: string
  status: string | null
  currentPeriodEnd: string | null
  updatedAt: string | null
  /** From referral_attributions when available. */
  purchasedAt: string | null
}

export type OwnerPremiumSummary = {
  count: number
  byPlan: Record<string, number>
  purchases: OwnerPremiumPurchase[]
  /** True when subscriptions were readable (service role or permitted). */
  sourceAvailable: boolean
  note?: string
}
