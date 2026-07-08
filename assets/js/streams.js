(() => {
  const twitch = {
    name: "Main Stream",
    platform: "Twitch",
    username: "simonizeshow",
  };

  function renderTwitchCard(card) {
    const parent = location.hostname || "localhost";
    const src = `https://player.twitch.tv/?channel=${encodeURIComponent(card.username)}&parent=${encodeURIComponent(parent)}`;

    return `
      <article class="stream-card">
        <div class="thumb-wrap">
          <iframe class="player" src="${src}" allowfullscreen scrolling="no"></iframe>
        </div>

        <div class="stream-top">
          <div class="stream-title">${escapeHtml(card.name)}</div>
          <span class="badge">${escapeHtml(card.platform)}</span>
        </div>

        <div class="stream-meta">
          <span>@${escapeHtml(card.username)}</span>
          <span>Status: embedded</span>
        </div>

        <div class="stream-actions">
          <a class="mini-btn" href="https://twitch.tv/${encodeURIComponent(card.username)}" target="_blank" rel="noopener noreferrer">
            Open on Twitch
          </a>
        </div>
      </article>
    `;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const slot = document.getElementById("twitch-slot");
    if (!slot) return;
    slot.innerHTML = renderTwitchCard(twitch);
  });
})();
