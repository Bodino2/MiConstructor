export const REVIEW_WINDOW_DAYS = 7;

export function publicationDecision({
  requiresGuarantee,
  guaranteeChargeStatus,
}) {
  if (requiresGuarantee && guaranteeChargeStatus !== "PAID") {
    return {
      allowed: false,
      code: "GUARANTEE_PAYMENT_REQUIRED",
      message: "La garantía debe estar pagada antes de publicar el proyecto.",
    };
  }
  return { allowed: true };
}

export function startDecision({ escrowStatus }) {
  if (escrowStatus !== "HELD") {
    return {
      allowed: false,
      code: "ESCROW_MUST_BE_HELD",
      message: "El proyecto solo puede comenzar cuando el escrow está retenido.",
    };
  }
  return { allowed: true };
}

export function completionDecision({ currentStatus }) {
  if (currentStatus !== "IN_PROGRESS") {
    return {
      allowed: false,
      code: "PROJECT_NOT_IN_PROGRESS",
      message: "Solo un proyecto en curso puede marcarse como completado.",
    };
  }
  return { allowed: true };
}

export function autoReleaseAt(completedAt) {
  const release = new Date(completedAt);
  release.setUTCDate(release.getUTCDate() + REVIEW_WINDOW_DAYS);
  return release.toISOString();
}

export function releaseDecision({
  currentStatus,
  disputeOpen,
  releaseAt,
  now = new Date(),
}) {
  if (currentStatus !== "COMPLETED") {
    return {
      allowed: false,
      code: "PROJECT_NOT_COMPLETED",
      message: "El proyecto todavía no está pendiente de liberación.",
    };
  }
  if (disputeOpen) {
    return {
      allowed: false,
      code: "OPEN_DISPUTE",
      message: "Existe una disputa abierta.",
    };
  }
  if (!releaseAt || now.getTime() < new Date(releaseAt).getTime()) {
    return {
      allowed: false,
      code: "RELEASE_WINDOW_ACTIVE",
      message: "La ventana de revisión de 7 días sigue activa.",
    };
  }
  return { allowed: true };
}
