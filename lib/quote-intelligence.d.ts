export function analyzeQuote(input: {
  project?: { projectType?: string; squareMeters?: number };
  estimate?: Record<string, unknown>;
  quote?: { amountEuros?: number; amountCents?: number; estimatedDays?: number; message?: string };
}): Record<string, unknown>;

export function compareQuotes(input: {
  project?: { projectType?: string; squareMeters?: number };
  estimate?: Record<string, unknown>;
  quotes?: Array<Record<string, unknown>>;
}): Record<string, unknown>;
