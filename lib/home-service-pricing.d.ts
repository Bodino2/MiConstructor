export type HomeServiceFrequency = "PUNTUAL" | "SEMANAL" | "CADA_2_SEMANAS" | "MENSUAL";
export type HomeServiceQuality = "basico" | "estandar" | "premium";

export const HOME_SERVICE_PRICING_VERSION: string;
export const HOME_SERVICE_PRICE_MATRIX: Record<string, Record<string, Record<string, unknown>>>;

export function resolveHomeServiceZone(location: unknown): {
  zone: string;
  label: string;
  coefficient: number;
};

export function getPublicHomeServicePricingModel(serviceSlug: string): null | {
  version: string;
  unit: string;
  referenceQuantity: number;
  standardRange: { minimum: number; median: number; maximum: number };
  minimumVisit: { minimum: number; median: number; maximum: number };
  qualityMultipliers: Record<string, number>;
  zoneMultipliers: Record<string, number>;
};

export function estimateHomeServicePrice(input?: {
  serviceSlug?: string;
  location?: string;
  squareMeters?: number | string;
  estimatedHours?: number | string;
  bedrooms?: number | string;
  bathrooms?: number | string;
  qualityLevel?: HomeServiceQuality | string;
}): Record<string, unknown> & {
  valid: boolean;
  error?: string;
  range?: { minimum: number; median: number; maximum: number };
};

export function annualizeHomeServiceValue(input?: {
  priceCentsPerVisit?: number;
  frequency?: HomeServiceFrequency | string;
  seasonStartDate?: string | null;
  seasonEndDate?: string | null;
}): {
  valid: boolean;
  seasonal?: boolean;
  annualizedValueCents: number;
  contractValueCents: number;
  visitsPerYear: number;
  estimatedContractVisits: number;
};

export function calculateHomeServiceMonetization(input?: {
  priceCentsPerVisit?: number;
  frequency?: HomeServiceFrequency | string;
  seasonStartDate?: string | null;
  seasonEndDate?: string | null;
}): Record<string, unknown> & {
  valid: boolean;
  feeCents: number;
  basisCents?: number;
};
