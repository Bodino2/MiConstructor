export function calculateShortlistFee(budgetCents: number): {
  valid: boolean;
  feeCents: number;
  pricingVersion: string;
};
export function getPublicShortlistBillingPolicy(): Record<string, unknown>;
