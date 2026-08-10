const DAY_MS = 24 * 60 * 60 * 1_000;

export function previousWeeklyPeriod(now = new Date()) {
  const date = new Date(now);
  if (Number.isNaN(date.getTime())) throw new TypeError("Fecha de facturación no válida.");

  const currentMonday = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - ((date.getUTCDay() + 6) % 7),
  ));
  const start = new Date(currentMonday.getTime() - 7 * DAY_MS);
  return {
    start: start.toISOString(),
    end: currentMonday.toISOString(),
  };
}

export function billingAccountStateAfterCollection({ status, overdueBalanceCents }) {
  if (status === "FALLIDA") {
    return {
      billingStatus: "SUSPENDIDO_IMPAGO",
      verificationStatus: "SUSPENDIDO",
      shouldBlockAccess: true,
    };
  }
  if (status === "PAGADA" && overdueBalanceCents <= 0) {
    return {
      billingStatus: "ACTIVO",
      verificationStatus: "APROBADO",
      shouldBlockAccess: false,
    };
  }
  return {
    billingStatus: "SUSPENDIDO_IMPAGO",
    verificationStatus: "SUSPENDIDO",
    shouldBlockAccess: true,
  };
}
