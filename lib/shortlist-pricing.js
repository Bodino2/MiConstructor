export const SHORTLIST_PRICING_VERSION = "2026-08-09";

const fixedTiers = [
  { maxBudgetCents: 250_000, feeCents: 890, label: "Proyecto hasta 2.500 €" },
  { maxBudgetCents: 750_000, feeCents: 1_490, label: "Proyecto de 2.501 € a 7.500 €" },
  { maxBudgetCents: 1_500_000, feeCents: 2_490, label: "Proyecto de 7.501 € a 15.000 €" },
  { maxBudgetCents: 3_000_000, feeCents: 3_990, label: "Proyecto de 15.001 € a 30.000 €" },
  { maxBudgetCents: 6_000_000, feeCents: 5_990, label: "Proyecto de 30.001 € a 60.000 €" },
];

export function calculateShortlistFee(budgetCents) {
  const normalizedBudget = Number.isInteger(budgetCents) && budgetCents > 0
    ? budgetCents
    : 0;
  if (!normalizedBudget) {
    return { valid: false, feeCents: 0, pricingVersion: SHORTLIST_PRICING_VERSION };
  }

  const tier = fixedTiers.find((item) => normalizedBudget <= item.maxBudgetCents);
  if (tier) {
    return {
      valid: true,
      feeCents: tier.feeCents,
      label: tier.label,
      pricingVersion: SHORTLIST_PRICING_VERSION,
    };
  }

  // En proyectos de mayor valor, el lead equivale al 0,10% del presupuesto
  // estimado, con un máximo de 149,90 €. Nunca depende del importe final.
  const proportionalFee = Math.round(normalizedBudget * 0.001);
  return {
    valid: true,
    feeCents: Math.min(14_990, Math.max(5_990, proportionalFee)),
    label: "Proyecto superior a 60.000 €",
    pricingVersion: SHORTLIST_PRICING_VERSION,
  };
}

export function getShortlistPricingTable() {
  return {
    version: SHORTLIST_PRICING_VERSION,
    currency: "EUR",
    tiers: fixedTiers.map((tier) => ({ ...tier })),
    largeProjects: { rate: 0.001, minimumFeeCents: 5_990, maximumFeeCents: 14_990 },
  };
}
