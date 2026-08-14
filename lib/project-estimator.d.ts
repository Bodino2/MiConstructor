export function resolveProjectLocationCostIndex(location: unknown): {
  zone: string;
  label: string;
  coefficient: number;
};
export function estimateProjectPrice(input: unknown): Record<string, unknown> & { valid: boolean };