(() => {
  const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://127.0.0.1:8787"
    : "https://api.vmoor.com";
  const HEALTH_URL = `${API_BASE}/health`;
  const TIMEOUT_MS = 1200;

  window.HUB_ONLINE = false;

  function setPill(state) {
    const hubDot = document.getElementById("hubDot");
    const hubText = document.getElementById("hubText");

    if (!hubDot || !hubText) return;

    hubDot.classList.remove("good", "bad", "warn");

    if (state === "online") {
      hubDot.classList.add("good");
      hubText.textContent = "Hub: online";
      return;
    }

    if (state === "checking") {
      hubDot.classList.add("warn");
      hubText.textContent = "Hub: checking...";
      return;
    }

    hubDot.classList.add("bad");
    hubText.textContent = "Hub: offline";
  }

  async function checkHealth() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(HEALTH_URL, {
        method: "GET",
        cache: "no-store",
        signal: ctrl.signal,
        credentials: "omit",
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    setPill("checking");

    const online = await checkHealth();
    window.HUB_ONLINE = online;

    document.querySelectorAll("[data-hub]").forEach((node) => {
      node.hidden = !online;
    });

    document.querySelectorAll("[data-hub-offline]").forEach((node) => {
      node.hidden = online;
    });

    setPill(online ? "online" : "offline");

    document.dispatchEvent(
      new CustomEvent("hub:status", { detail: { online } })
    );
  });
})();
