export const PROFESSIONAL_ASSESSMENT_VERSION = "2026-08-09";
export const PROFESSIONAL_PASS_SCORE = 80;

const questions = [
  {
    id: "alcance",
    prompt: "¿Qué debe quedar definido antes de iniciar un trabajo?",
    options: [
      { id: "a", label: "Solo la fecha aproximada de inicio" },
      { id: "b", label: "Alcance, importe, plazo e hitos acordados" },
      { id: "c", label: "Únicamente el importe total" },
    ],
    correctOption: "b",
  },
  {
    id: "imprevisto",
    prompt: "Aparece un imprevisto que cambia el presupuesto. ¿Cómo se procede?",
    options: [
      { id: "a", label: "Se ejecuta y se informa al terminar" },
      { id: "b", label: "Se documenta, se comunica y se aprueba el cambio antes de continuar" },
      { id: "c", label: "Se reparte el coste entre los hitos sin avisar" },
    ],
    correctOption: "b",
  },
  {
    id: "evidencia",
    prompt: "¿Qué evidencia permite revisar correctamente un hito?",
    options: [
      { id: "a", label: "Fotos fechadas, descripción del trabajo y documentos vinculados" },
      { id: "b", label: "Un mensaje indicando que el trabajo está listo" },
      { id: "c", label: "Una factura sin relación con el alcance acordado" },
    ],
    correctOption: "a",
  },
  {
    id: "liberacion",
    prompt: "¿Cuándo puede darse por cerrado un hito?",
    options: [
      { id: "a", label: "Al solicitar el profesional el pago" },
      { id: "b", label: "Cuando se revisan las evidencias y se registra la aprobación" },
      { id: "c", label: "Automáticamente al llegar la fecha prevista" },
    ],
    correctOption: "b",
  },
  {
    id: "seguridad",
    prompt: "¿Qué obligación se mantiene durante toda la ejecución?",
    options: [
      { id: "a", label: "Cumplir la prevención de riesgos y documentar las incidencias" },
      { id: "b", label: "Aplicar las medidas de seguridad solo durante las inspecciones" },
      { id: "c", label: "Delegar toda la responsabilidad preventiva en el cliente" },
    ],
    correctOption: "a",
  },
];

export function getPublicProfessionalAssessment() {
  return {
    version: PROFESSIONAL_ASSESSMENT_VERSION,
    passScore: PROFESSIONAL_PASS_SCORE,
    questions: questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: question.options,
    })),
  };
}

export function evaluateProfessionalAssessment(payload) {
  const version = typeof payload?.version === "string" ? payload.version : "";
  const answers = payload?.respuestas && typeof payload.respuestas === "object"
    ? payload.respuestas
    : {};

  if (version !== PROFESSIONAL_ASSESSMENT_VERSION) {
    return {
      valid: false,
      passed: false,
      score: 0,
      answered: 0,
      total: questions.length,
      error: "La evaluación ha cambiado. Recarga las preguntas antes de continuar.",
    };
  }

  const answered = questions.filter((question) =>
    typeof answers[question.id] === "string",
  ).length;
  const correct = questions.filter(
    (question) => answers[question.id] === question.correctOption,
  ).length;
  const score = Math.round((correct / questions.length) * 100);

  return {
    valid: answered === questions.length,
    passed: answered === questions.length && score >= PROFESSIONAL_PASS_SCORE,
    score,
    answered,
    total: questions.length,
    error: answered === questions.length ? null : "Debes responder todas las preguntas.",
  };
}
