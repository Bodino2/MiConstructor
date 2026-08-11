export const SHORTLIST_PRICING_VERSION = "2026-08-11-immediate-selection-v3";

const percentageTiers = [
  {
    minBudgetCents: 1,
    maxBudgetCents: 150_000,
    rate: 0.05,
    label: "Proyecto hasta 1.500 €",
  },
  {
    minBudgetCents: 150_001,
    maxBudgetCents: 1_000_000,
    rate: 0.04,
    label: "Proyecto de 1.500,01 € a 10.000 €",
  },
  {
    minBudgetCents: 1_000_001,
    maxBudgetCents: null,
    rate: 0.03,
    label: "Proyecto superior a 10.000 €",
  },
];

export function calculateShortlistFee(budgetCents) {
  const normalizedBudget = Number.isInteger(budgetCents) && budgetCents > 0
    ? budgetCents
    : 0;
  if (!normalizedBudget) {
    return { valid: false, feeCents: 0, pricingVersion: SHORTLIST_PRICING_VERSION };
  }

  const tier = percentageTiers.find(
    (item) =>
      normalizedBudget >= item.minBudgetCents &&
      (item.maxBudgetCents === null || normalizedBudget <= item.maxBudgetCents),
  );

  // La tarifa se fija con el presupuesto estimado guardado en el momento en
  // que el cliente selecciona al profesional. Solo el profesional seleccionado
  // genera un cargo. Nunca se recalcula con la factura o el importe final de la obra.
  return {
    valid: true,
    feeCents: Math.round(normalizedBudget * tier.rate),
    rate: tier.rate,
    percentage: tier.rate * 100,
    label: tier.label,
    pricingVersion: SHORTLIST_PRICING_VERSION,
  };
}

export function getPublicShortlistBillingPolicy() {
  return {
    version: SHORTLIST_PRICING_VERSION,
    currency: "EUR",
    calculationBasis: "ESTIMATED_PROJECT_BUDGET_AT_SELECTION",
    chargeTrigger: "CLIENT_SELECTS_PROFESSIONAL",
    chargedParty: "SELECTED_PROFESSIONAL_ONLY",
    frequency: "IMMEDIATE_PER_SELECTION",
    collectionMethod: "SEPA_DIRECT_DEBIT_OFF_SESSION",
    mandateRequired: true,
    nonPaymentAction: "ACCOUNT_SUSPENDED_UNTIL_FULL_SETTLEMENT",
  };
}
