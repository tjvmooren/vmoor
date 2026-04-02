(() => {
  const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://127.0.0.1:8787"
    : "https://api.vmoor.com";

  const els = {
    authBadge: document.getElementById("labAuthBadge"),
    authStatePill: document.getElementById("authStatePill"),
    authForm: document.getElementById("authForm"),
    authIdentifier: document.getElementById("authIdentifier"),
    authPassword: document.getElementById("authPassword"),
    authSubmit: document.getElementById("authSubmit"),
    authMessage: document.getElementById("authMessage"),
    authActions: document.getElementById("authActions"),
    logoutBtn: document.getElementById("logoutBtn"),
    catalogBadge: document.getElementById("catalogBadge"),
    publicLabs: document.getElementById("publicLabs"),
    privateOverviewBadge: document.getElementById("privateOverviewBadge"),
    privateResourcesBadge: document.getElementById("privateResourcesBadge"),
    privateLabSummary: document.getElementById("privateLabSummary"),
    privateLabList: document.getElementById("privateLabList"),
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

  function renderPublicLabs(labs) {
    if (!els.publicLabs) return;

    if (!Array.isArray(labs) || labs.length === 0) {
      els.publicLabs.innerHTML = "<p>No public labs are published yet.</p>";
      return;
    }

    els.publicLabs.innerHTML = labs
      .map(
        (lab) => `
          <article class="resource-card">
            <div class="resource-card__meta">
              <span class="badge good">${escapeHtml(lab.visibility || "public")}</span>
              <span class="badge">${escapeHtml(lab.category || "lab")}</span>
            </div>
            <h3>${escapeHtml(lab.title)}</h3>
            <p>${escapeHtml(lab.summary)}</p>
          </article>
        `
      )
      .join("");
  }

  function renderPrivateSummary(payload) {
    if (!els.privateLabSummary) return;

    if (!payload) {
      els.privateLabSummary.innerHTML = "<p>Sign in to load protected lab overview data from the API.</p>";
      return;
    }

    const bullets = Array.isArray(payload.focus)
      ? payload.focus
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("")
      : "";

    els.privateLabSummary.innerHTML = `
      <article class="resource-card">
        <div class="resource-card__meta">
          <span class="badge good">${escapeHtml(payload.role || "authenticated")}</span>
          <span class="badge">${escapeHtml(payload.access || "session")}</span>
        </div>
        <h3>${escapeHtml(payload.title || "Protected labs unlocked")}</h3>
        <p>${escapeHtml(payload.summary || "Protected lab space is available.")}</p>
        ${bullets ? `<ul class="signal-list">${bullets}</ul>` : ""}
      </article>
    `;
  }

  function renderPrivateResources(resources) {
    if (!els.privateLabList) return;

    if (resources === null) {
      els.privateLabList.innerHTML = `
        <article class="resource-card">
          <div class="resource-card__meta">
            <span class="badge warn">Locked</span>
          </div>
          <h3>Private labs are hidden until you authenticate.</h3>
          <p>The route structure is ready, but this panel only unlocks once the API session is active.</p>
        </article>
      `;
      return;
    }

    if (!Array.isArray(resources) || resources.length === 0) {
      els.privateLabList.innerHTML = `
        <article class="resource-card">
          <div class="resource-card__meta">
            <span class="badge warn">No resources</span>
          </div>
          <h3>No private lab resources are available yet.</h3>
          <p>The route structure is ready, but the protected catalog is still empty.</p>
        </article>
      `;
      return;
    }

    els.privateLabList.innerHTML = resources
      .map(
        (resource) => `
          <article class="resource-card">
            <div class="resource-card__meta">
              <span class="badge good">${escapeHtml(resource.status || "available")}</span>
              <span class="badge">${escapeHtml(resource.category || "protected")}</span>
            </div>
            <h3>${escapeHtml(resource.title)}</h3>
            <p>${escapeHtml(resource.summary)}</p>
            <p class="small mono">${escapeHtml(resource.route || "")}</p>
          </article>
        `
      )
      .join("");
  }

  async function loadCatalog() {
    try {
      const payload = await api("/labs/catalog");
      renderPublicLabs(payload.publicLabs || []);
      setBadge(els.catalogBadge, `${(payload.publicLabs || []).length} public tracks`, "good");
    } catch {
      renderPublicLabs([]);
      setBadge(els.catalogBadge, "Catalog unavailable", "bad");
    }
  }

  function renderLoggedOut() {
    if (els.authForm) els.authForm.hidden = false;
    if (els.authActions) els.authActions.hidden = true;

    setBadge(els.authBadge, "Auth: locked", "warn");
    setBadge(els.authStatePill, "Locked", "warn");
    setBadge(els.privateOverviewBadge, "Locked", "warn");
    setBadge(els.privateResourcesBadge, "Awaiting auth", "warn");

    renderPrivateSummary(null);
    renderPrivateResources(null);
  }

  async function renderLoggedIn(user) {
    if (els.authForm) els.authForm.hidden = true;
    if (els.authActions) els.authActions.hidden = false;

    const label = user?.displayName || user?.username || "authenticated";

    setBadge(els.authBadge, `Auth: ${label}`, "good");
    setBadge(els.authStatePill, `Unlocked as ${label}`, "good");
    setBadge(els.privateOverviewBadge, "Overview loaded", "good");
    setBadge(els.privateResourcesBadge, "Resources available", "good");

    try {
      const [overview, resources] = await Promise.all([
        api("/labs/private/overview"),
        api("/labs/private/resources"),
      ]);

      renderPrivateSummary(overview);
      renderPrivateResources(resources.resources || []);
    } catch {
      renderPrivateSummary({
        title: "Protected session active",
        summary: "Authentication succeeded, but protected lab payloads did not load cleanly.",
        role: user?.role || "authenticated",
        access: "session",
        focus: [],
      });
      renderPrivateResources([]);
      setBadge(els.privateOverviewBadge, "Protected data unavailable", "bad");
      setBadge(els.privateResourcesBadge, "Protected data unavailable", "bad");
    }
  }

  async function syncAuth() {
    try {
      const payload = await api("/auth/me");
      if (payload.authenticated) {
        await renderLoggedIn(payload.user || {});
        return;
      }
    } catch {
      // fall through to logged-out state
    }

    renderLoggedOut();
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
      renderLoggedOut();
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
    renderLoggedOut();
  });

  document.addEventListener("DOMContentLoaded", async () => {
    await loadCatalog();
    await syncAuth();
  });
})();
