(() => {
  const previousFetch = window.fetch.bind(window);

  function requestUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.toString();
    return input?.url || "";
  }

  function rewriteRetryInput(input, url) {
    const rewritten = url.replace(/\/api\/v1\/billing\/invoices\/([^/]+)\/retry(?:\?.*)?$/, "/api/v1/billing/charges/$1/retry");
    if (typeof input === "string") return rewritten;
    if (input instanceof URL) return new URL(rewritten, window.location.origin);
    if (input instanceof Request) return new Request(rewritten, input);
    return input;
  }

  function compatibleBillingPayload(payload) {
    if (!payload || !Array.isArray(payload.charges)) return payload;
    const pendingItems = payload.charges
      .filter((charge) => ["PENDIENTE", "PROCESANDO"].includes(charge.status))
      .map((charge) => ({
        id: charge.id,
        description: charge.project_title ? `Selección · ${charge.project_title}` : charge.description,
        amount_cents: charge.amount_cents,
        service_date: charge.service_date,
      }));
    const invoices = payload.charges
      .filter((charge) => ["PAGADO", "FALLIDO"].includes(charge.status))
      .map((charge) => ({
        id: charge.id,
        period_start: charge.service_date,
        period_end: charge.service_date,
        total_cents: charge.amount_cents,
        status: charge.status === "PAGADO" ? "PAGADA" : "FALLIDA",
        failure_reason: charge.failure_reason,
        paid_at: charge.paid_at,
      }));
    return { ...payload, pendingItems, invoices };
  }

  window.fetch = async (input, init = {}) => {
    const originalUrl = requestUrl(input);
    const method = String(init.method || (input instanceof Request ? input.method : "GET") || "GET").toUpperCase();
    const retry = method === "POST" && /\/api\/v1\/billing\/invoices\/[^/]+\/retry(?:\?.*)?$/.test(originalUrl);
    const nextInput = retry ? rewriteRetryInput(input, originalUrl) : input;
    const response = await previousFetch(nextInput, init);

    if (!originalUrl.includes("/api/v1/billing/me") || !response.ok) return response;
    try {
      const payload = compatibleBillingPayload(await response.clone().json());
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      return new Response(JSON.stringify(payload), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      return response;
    }
  };

  function replaceHeading(root, from, to) {
    root.querySelectorAll("h2,h3").forEach((heading) => {
      if (heading.textContent.trim() === from) heading.textContent = to;
    });
  }

  function rewritePanelCopy() {
    const root = document.querySelector("#professional-content");
    if (!root) return;
    replaceHeading(root, "Domiciliación semanal", "Cobro automático por selección");
    replaceHeading(root, "Conceptos pendientes", "Cobros en curso");
    replaceHeading(root, "Facturas", "Historial de cargos por selección");
    root.querySelectorAll("p").forEach((paragraph) => {
      if (paragraph.textContent.includes("Las selecciones se agrupan en una factura semanal")) {
        paragraph.textContent = "Solo se genera un cargo cuando un cliente te selecciona. El adeudo se inicia automáticamente en ese momento mediante el mandato SEPA configurado. Si no eres seleccionado, no se genera ningún cargo.";
      }
    });
    root.querySelectorAll(".empty").forEach((empty) => {
      if (empty.textContent.includes("Todavía no hay facturas")) empty.textContent = "Todavía no hay cargos por selección.";
      if (empty.textContent.includes("No hay conceptos pendientes")) empty.textContent = "No hay cobros en curso.";
    });
  }

  function rewriteLegalCopy() {
    if (location.pathname === "/sepa") {
      document.querySelectorAll("#app h2").forEach((heading) => {
        if (heading.textContent.trim() !== "Cargos y notificación") return;
        const paragraph = heading.nextElementSibling;
        if (paragraph?.tagName === "P") {
          paragraph.textContent = "Cuando un cliente selecciona a un profesional, MiConstructor genera el cargo correspondiente únicamente para ese profesional e inicia automáticamente el adeudo mediante el mandato SEPA activo. No se agrupan nuevas selecciones en una factura semanal. La ejecución y los plazos bancarios dependen del flujo SEPA utilizado por Stripe.";
        }
      });
    }
    if (location.pathname === "/terminos") {
      document.querySelectorAll("#app h2").forEach((heading) => {
        if (heading.textContent.trim() !== "6. Facturación") return;
        const paragraph = heading.nextElementSibling;
        if (paragraph?.tagName === "P") {
          paragraph.textContent = "En el modelo de selección, presentar una propuesta no genera cargo. El cargo se genera únicamente para el profesional que el cliente selecciona y el adeudo se inicia automáticamente en el momento de la selección mediante el método de pago autorizado. Los cargos históricos anteriores al cambio de modelo pueden conservarse como facturación previa.";
        }
      });
    }
  }

  function refreshCopy() {
    rewritePanelCopy();
    rewriteLegalCopy();
  }

  const observer = new MutationObserver(() => window.setTimeout(refreshCopy, 0));
  observer.observe(document.querySelector("#app") || document.body, { childList: true, subtree: true });
  window.addEventListener("popstate", () => window.setTimeout(refreshCopy, 0));
  window.setTimeout(refreshCopy, 0);
})();
