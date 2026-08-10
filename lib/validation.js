const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

/** @param {string} value */
export function isValidEmail(value) {
  return EMAIL_PATTERN.test(value.trim().toLowerCase());
}

/** @param {string} value */
export function isValidSpanishTaxId(value) {
  const taxId = value.trim().toUpperCase().replace(/[\s-]/g, "");

  if (/^\d{8}[A-Z]$/.test(taxId)) {
    return DNI_LETTERS[Number(taxId.slice(0, 8)) % 23] === taxId[8];
  }

  if (/^[XYZ]\d{7}[A-Z]$/.test(taxId)) {
    const prefix = { X: "0", Y: "1", Z: "2" }[taxId[0]];
    const number = Number(`${prefix}${taxId.slice(1, 8)}`);
    return DNI_LETTERS[number % 23] === taxId[8];
  }

  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(taxId)) {
    const digits = taxId.slice(1, 8).split("").map(Number);
    const evenSum = digits[1] + digits[3] + digits[5];
    const oddSum = [digits[0], digits[2], digits[4], digits[6]].reduce(
      (sum, digit) => {
        const doubled = digit * 2;
        return sum + Math.floor(doubled / 10) + (doubled % 10);
      },
      0,
    );
    const controlDigit = (10 - ((evenSum + oddSum) % 10)) % 10;
    const controlLetter = "JABCDEFGHI"[controlDigit];
    const expected = taxId[8];
    const letterOnly = "PQRSNW".includes(taxId[0]);
    const numberOnly = "ABEH".includes(taxId[0]);
    return letterOnly
      ? expected === controlLetter
      : numberOnly
        ? expected === String(controlDigit)
        : expected === String(controlDigit) || expected === controlLetter;
  }

  return false;
}

/** @param {unknown} value @param {number} maxLength */
export function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/** @param {unknown} value */
export function toCents(value) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}
