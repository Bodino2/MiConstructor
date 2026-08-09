export const PROFESSIONAL_PASS_SCORE: number;
export const PROFESSIONAL_QUESTION_COUNT: number;
export type PublicAssessment = {
  specialty: { slug: string; label: string };
  version: string;
  passScore: number;
  questionCount: number;
  questions: Array<{ id: string; prompt: string; options: Array<{ id: string; label: string }> }>;
};
export function getProfessionalSpecialties(): Array<{ slug: string; label: string; questionCount: number }>;
export function getPublicProfessionalAssessment(specialty: unknown): PublicAssessment | null;
export function evaluateProfessionalAssessment(payload: unknown): {
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
export function normalizeProfessionalSpecialty(value: unknown): string | null;
export function getSpecialtySlugForProjectCategory(value: unknown): string | null;
