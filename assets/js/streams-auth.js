(() => {
  const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://127.0.0.1:8787"
    : "https://api.vmoor.com";

  const els = {
    accessBadge: document.getElementById("streamAccessBadge"),
    accessPill: document.getElementById("streamAccessPill"),
    accessSummary: document.getElementById("streamAccessSummary"),
    authForm: document.getElementById("streamAuthForm"),
    authIdentifier: document.getElementById("streamAuthIdentifier"),
    authPassword: document.getElementById("streamAuthPassword"),
    authSubmit: document.getElementById("streamAuthSubmit"),
    authMessage: document.getElementById("streamAuthMessage"),
    authActions: document.getElementById("streamAuthActions"),
    logoutBtn: document.getElementById("streamLogoutBtn"),
    lockedNotice: document.getElementById("streamLockedNotice"),
    accessPanel: document.getElementById("streamAccessPanel"),
  };

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  async function api(path, options = {}) {
    const response = await fetch(API_BASE + path, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw payload;
    return payload;
  }

  function setBadge(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove("good", "warn", "bad");
    if (kind) el.classList.add(kind);
  }

  function setMessage(text, kind = "muted") {
    if (!els.authMessage) return;
    els.authMessage.textContent = text || "";
    els.authMessage.classList.remove("error", "muted");
    els.authMessage.classList.add(kind === "error" ? "error" : "muted");
  }

  function renderSummary(payload) {
    if (!els.accessSummary) return;

    if (!payload) {
      els.accessSummary.innerHTML = `
        <article class="resource-card">
          <div class="resource-card__meta">
            <span class="badge warn">Locked</span>
            <span class="badge">Session required</span>
          </div>
          <h3>Stream Hub is now protected.</h3>
          <p>Sign in with the same session you use for labs to reveal the stream surfaces and keep side-build access tied to a real account.</p>
        </article>
      `;
      return;
    }

    const bullets = Array.isArray(payload.focus)
      ? payload.focus.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
      : "";

    els.accessSummary.innerHTML = `
      <article class="resource-card">
        <div class="resource-card__meta">
          <span class="badge good">${escapeHtml(payload.access || "session")}</span>
          <span class="badge">${escapeHtml(payload.user?.role || "authenticated")}</span>
        </div>
        <h3>${escapeHtml(payload.title || "Stream Hub unlocked")}</h3>
        <p>${escapeHtml(payload.summary || "Authenticated access is active.")}</p>
        ${bullets ? `<ul class="signal-list">${bullets}</ul>` : ""}
      </article>
    `;
  }

  function renderLocked() {
    document.body.dataset.streamsAccess = "locked";

    if (els.authForm) els.authForm.hidden = false;
    if (els.authActions) els.authActions.hidden = true;
    if (els.lockedNotice) els.lockedNotice.hidden = false;
    if (els.accessPanel) els.accessPanel.hidden = true;

    setBadge(els.accessBadge, "Access: locked", "warn");
    setBadge(els.accessPill, "Locked", "warn");
    renderSummary(null);
  }

  async function renderUnlocked(user) {
    const payload = await api("/streams/access");

    document.body.dataset.streamsAccess = "granted";

    if (els.authForm) els.authForm.hidden = true;
    if (els.authActions) els.authActions.hidden = false;
    if (els.lockedNotice) els.lockedNotice.hidden = true;
    if (els.accessPanel) els.accessPanel.hidden = false;

    const label = user?.displayName || user?.username || "authenticated";
    setBadge(els.accessBadge, `Access: ${label}`, "good");
    setBadge(els.accessPill, "Unlocked", "good");
    renderSummary(payload);

    window.dispatchEvent(
      new CustomEvent("vmoor:streams-access", {
        detail: {
          user,
          access: payload,
        },
      })
    );
  }

  async function syncAuth() {
    try {
      const payload = await api("/auth/me");
      if (payload.authenticated) {
        await renderUnlocked(payload.user || {});
        return;
      }
    } catch {
      // fall through to locked state
    }

    renderLocked();
  }

  els.authForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("Signing in...");

    if (els.authSubmit) els.authSubmit.disabled = true;

    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          identifier: els.authIdentifier?.value || "",
          password: els.authPassword?.value || "",
        }),
      });

      if (els.authPassword) els.authPassword.value = "";
      setMessage("Signed in.", "muted");
      await syncAuth();
    } catch (error) {
      const reason = error?.error === "invalid_credentials"
        ? "Invalid username or password."
        : "Unable to sign in right now.";
      setMessage(reason, "error");
      renderLocked();
    } finally {
      if (els.authSubmit) els.authSubmit.disabled = false;
    }
  });

  els.logoutBtn?.addEventListener("click", async () => {
    setMessage("Signing out...");

    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // even if the server errors, reset the UI locally
    }

    if (els.authIdentifier) els.authIdentifier.value = "";
    if (els.authPassword) els.authPassword.value = "";
    setMessage("Signed out.", "muted");
    renderLocked();
  });

  document.addEventListener("DOMContentLoaded", async () => {
    await syncAuth();
  });
})();
