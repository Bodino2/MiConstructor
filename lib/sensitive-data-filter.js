const PATTERNS = [
  { type: "EMAIL", expression: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { type: "PHONE", expression: /(?:\+?34[\s.-]?)?(?:[6789]\d{2})[\s.-]?\d{3}[\s.-]?\d{3}\b/ },
  { type: "IBAN", expression: /\bES\s*\d{2}(?:\s*\d{4}){5}\b/i },
  { type: "URL", expression: /(?:https?:\/\/|www\.)\S+/i },
];

export function inspectSensitiveContactData(message) {
  const text = String(message ?? "");
  const matches = PATTERNS.filter((pattern) => pattern.expression.test(text)).map((pattern) => pattern.type);
  return { blocked: matches.length > 0, types: matches };
}
