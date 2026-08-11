export const HOME_SERVICE_PASS_SCORE: number;
export const HOME_SERVICE_QUESTION_COUNT: number;
export function getHomeServiceProfessionalSpecialties(): Array<{ slug: string; label: string; questionCount: number }>;
export function getPublicHomeServiceAssessment(value: unknown): null | {
  specialty: { slug: string; label: string };
  version: string;
  passScore: number;
  questionCount: number;
  questions: Array<{ id: string; prompt: string; options: Array<{ id: string; label: string }> }>;
};
export function evaluateHomeServiceAssessment(payload: unknown): {
  valid: boolean;
  passed: boolean;
  score: number;
  answered: number;
  total: number;
  specialtySlug: string | null;
  specialtyLabel: string | null;
  version: string | null;
  error: string | null;
};
export function normalizeHomeServiceProfessionalSpecialty(value: unknown): string | null;
