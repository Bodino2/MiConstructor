const currency = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function parsePositiveNumber(value) {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function calculateRange(root) {
  const quantityInput = root.querySelector("[data-calculator-quantity]");
  const qualitySelect = root.querySelector("[data-calculator-quality]");
  const output = root.querySelector("[data-calculator-result]");
  const minBase = Number(root.dataset.priceMin || 0);
  const maxBase = Number(root.dataset.priceMax || 0);
  const quantity = parsePositiveNumber(quantityInput?.value);
  const qualityFactor = Number(qualitySelect?.value || 1);

  if (!output) return;
  if (!quantity || !Number.isFinite(qualityFactor) || qualityFactor <= 0 || minBase <= 0 || maxBase < minBase) {
    output.textContent = "Introduce una cantidad válida para calcular el rango.";
    output.dataset.state = "empty";
    return;
  }

  const minimum = Math.round(quantity * minBase * qualityFactor);
  const maximum = Math.round(quantity * maxBase * qualityFactor);
  output.textContent = `${currency.format(minimum)} – ${currency.format(maximum)}`;
  output.dataset.state = "ready";
}

function bindCalculator(root) {
  if (!(root instanceof HTMLElement) || root.dataset.bound === "true") return;
  const quantityInput = root.querySelector("[data-calculator-quantity]");
  const qualitySelect = root.querySelector("[data-calculator-quality]");
  if (!quantityInput || !qualitySelect) return;

  root.dataset.bound = "true";
  quantityInput.addEventListener("input", () => calculateRange(root));
  qualitySelect.addEventListener("change", () => calculateRange(root));
  calculateRange(root);
}

document.querySelectorAll("[data-programmatic-calculator]").forEach(bindCalculator);
