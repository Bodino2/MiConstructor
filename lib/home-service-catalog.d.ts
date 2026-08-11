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
export function madridDateIso(date?: Date): string;
export function nextOccurrenceDate(currentIsoDate: string, frequency: HomeServiceFrequency, anchorDay?: number | null): string | null;
export function recurrenceAllowed(serviceSlug: string, frequency: HomeServiceFrequency): boolean;
