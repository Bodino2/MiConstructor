(() => {
  const params = new URLSearchParams(window.location.search);
  const campaignCode = params.get("mc");
  if (!campaignCode || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(campaignCode) || campaignCode.length > 80) return;

  const previousFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const response = await previousFetch(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input?.url || "";
    const method = String(init.method || "GET").toUpperCase();
    if (response.ok && method === "POST" && url.includes("/api/v1/auth/register")) {
      void previousFetch("/api/v1/marketing/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
        body: JSON.stringify({
          code: campaignCode,
          eventType: "SIGNUP",
          path: window.location.pathname,
        }),
      }).catch(() => undefined);
    }
    return response;
  };
})();
