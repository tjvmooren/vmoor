(() => {
  const HEALTH_URL = "https://api.vmoor.com/health";
  const TIMEOUT_MS = 1200;

  window.HUB_ONLINE = false;

  const hubDot  = document.getElementById("hubDot");
  const hubText = document.getElementById("hubText");

  function setPill(state) {
    if (!hubDot || !hubText) return;

    hubDot.classList.remove("good", "bad", "warn");

    if (state === "online") {
      hubDot.classList.add("good");
      hubText.textContent = "Hub: online";
      return;
    }
    if (state === "checking") {
      hubDot.classList.add("warn");
      hubText.textContent = "Hub: checking…";
      return;
    }
    hubDot.classList.add("bad");
    hubText.textContent = "Hub: offline";
  }

  async function checkHealth() {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(HEALTH_URL, {
        method: "GET",
        cache: "no-store",
        signal: ctrl.signal,
        credentials: "omit",
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(t);
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    setPill("checking");

    const online = await checkHealth();
    window.HUB_ONLINE = online;

    // Toggle any hub-only UI
    document.querySelectorAll("[data-hub]").forEach(el => {
      el.hidden = !online;
    });

    // Optional: show some offline-only UI
    document.querySelectorAll("[data-hub-offline]").forEach(el => {
      el.hidden = online;
    });

    setPill(online ? "online" : "offline");

    document.dispatchEvent(
      new CustomEvent("hub:status", { detail: { online } })
    );
  });
})();
