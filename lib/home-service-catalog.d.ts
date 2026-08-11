export type HomeServiceFrequency = "PUNTUAL" | "SEMANAL" | "CADA_2_SEMANAS" | "MENSUAL";
export function normalizeHomeService(value: unknown): string | null;
export function getHomeService(value: unknown): null | {
  slug: string;
  label: string;
  vertical: string;
  requiredSpecialty: string;
  recurrence: HomeServiceFrequency[];
};
export function getHomeServiceCatalog(): Array<Record<string, unknown>>;
export function nextOccurrenceDate(currentIsoDate: string, frequency: HomeServiceFrequency): string | null;
export function recurrenceAllowed(serviceSlug: string, frequency: HomeServiceFrequency): boolean;
