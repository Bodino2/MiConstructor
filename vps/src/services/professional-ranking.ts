const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

export type VerifiedScoreInput = {
  accountVerified: boolean;
  qualificationApproved: boolean;
  technicalScore: number;
  insured: boolean;
  completedProjects: number;
  reviewAverage: number;
  reviewCount: number;
};

export type VerifiedScore = {
  total: number;
  level: "INICIAL" | "VERIFICADO" | "DESTACADO" | "EXCELENTE";
  components: {
    identity: number;
    technical: number;
    insurance: number;
    experience: number;
    reputation: number;
  };
};

export function calculateVerifiedProfessionalScore(input: VerifiedScoreInput): VerifiedScore {
  const identity = input.accountVerified ? 25 : 0;
  const technical = input.qualificationApproved
    ? Math.round(20 * (clamp(Number(input.technicalScore)) / 100))
    : 0;
  const insurance = input.insured ? 15 : 0;
  const experience = Math.min(20, Math.max(0, Math.trunc(input.completedProjects)) * 4);
  const reviewConfidence = Math.min(1, Math.max(0, input.reviewCount) / 5);
  const reputation = Math.round(20 * (clamp(Number(input.reviewAverage), 0, 5) / 5) * reviewConfidence);
  const total = clamp(identity + technical + insurance + experience + reputation);
  const level = total >= 85 ? "EXCELENTE" : total >= 70 ? "DESTACADO" : total >= 50 ? "VERIFICADO" : "INICIAL";
  return { total, level, components: { identity, technical, insurance, experience, reputation } };
}

export function locationFit(projectLocation: string, serviceAreas: string[]): number {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const project = normalize(projectLocation);
  const areas = serviceAreas.map(normalize).filter(Boolean);
  if (!areas.length) return 60;
  if (areas.some((area) => project.includes(area) || area.includes(project))) return 100;
  const projectTokens = new Set(project.split(/[,\s]+/).filter((token) => token.length > 2));
  if (areas.some((area) => area.split(/[,\s]+/).some((token) => projectTokens.has(token)))) return 70;
  return 20;
}

export function availabilityFit(availableFrom: string | Date | null | undefined, now = new Date()): number {
  if (!availableFrom) return 60;
  const date = new Date(availableFrom);
  if (Number.isNaN(date.getTime())) return 60;
  const days = Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return 100;
  if (days <= 14) return 85;
  if (days <= 30) return 65;
  if (days <= 60) return 40;
  return 20;
}

export function capacityFit(activeProjects: number, concurrentCapacity: number): number {
  const capacity = Math.max(1, Math.trunc(concurrentCapacity || 1));
  const active = Math.max(0, Math.trunc(activeProjects || 0));
  if (active >= capacity) return 0;
  if (active === 0) return 100;
  return Math.round(100 * (capacity - active) / capacity);
}

export type MatchScoreInput = {
  verifiedScore: number;
  technicalScore: number;
  locationScore: number;
  availabilityScore: number;
  capacityScore: number;
};

export function calculateProjectMatchScore(input: MatchScoreInput): number {
  return Math.round(
    clamp(input.verifiedScore) * 0.50
    + clamp(input.technicalScore) * 0.20
    + clamp(input.locationScore) * 0.10
    + clamp(input.availabilityScore) * 0.10
    + clamp(input.capacityScore) * 0.10,
  );
}
