(() => {
  const twitch = {
    name: "Main Stream",
    platform: "Twitch",
    username: "simonizeshow",
  };

  const streamed = {
    name: "Live Sports (Streamed)",
    platform: "Streamed",
    matchesEndpoint: "https://streamed.pk/api/matches/live",
    fallbackEndpoint: "https://streamed.pk/api/matches/all-today",
  };

  let initialized = false;
  let initializing = false;

  async function initializeStreams() {
    if (initialized || initializing) {
      return;
    }

    initializing = true;
    document.getElementById("twitch-slot").innerHTML = renderTwitchCard(twitch);
    document.getElementById("streamed-slot").innerHTML = renderStreamedCard(streamed);

    initTabs();
    await initStreamedCard(streamed).catch((error) => {
      setStreamedStatus("Error loading matches", "bad");
      console.error(error);
    });
    initialized = true;
    initializing = false;
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (document.body?.dataset?.streamsAccess === "granted") {
      void initializeStreams();
    }
  });

  window.addEventListener("vmoor:streams-access", () => {
    void initializeStreams();
  });

  function stopIframes(panel) {
    panel.querySelectorAll("iframe").forEach((iframe) => {
      if (!iframe.dataset.src) iframe.dataset.src = iframe.src;
      iframe.src = "";
    });
  }

  function startIframes(panel) {
    panel.querySelectorAll("iframe").forEach((iframe) => {
      if (iframe.dataset.src && iframe.src !== iframe.dataset.src) {
        iframe.src = iframe.dataset.src;
      }
    });
  }

  function initTabs() {
    const tabs = [
      {
        tab: document.getElementById("tab-twitch"),
        panel: document.getElementById("panel-twitch"),
        key: "twitch",
      },
      {
        tab: document.getElementById("tab-streamed"),
        panel: document.getElementById("panel-streamed"),
        key: "streamed",
      },
    ];

    const saved = localStorage.getItem("streamTab");
    if (saved) setActive(saved);

    tabs.forEach((item) => item.tab.addEventListener("click", () => setActive(item.key)));

    function setActive(key) {
      tabs.forEach((item) => {
        const active = item.key === key;
        item.tab.setAttribute("aria-selected", String(active));

        if (!active) {
          stopIframes(item.panel);
          item.panel.setAttribute("hidden", "");
        } else {
          item.panel.removeAttribute("hidden");
          startIframes(item.panel);
        }
      });

      localStorage.setItem("streamTab", key);
    }
  }

  function renderTwitchCard(card) {
    const parent = location.hostname || "localhost";
    const src = `https://player.twitch.tv/?channel=${encodeURIComponent(card.username)}&parent=${encodeURIComponent(parent)}`;

    return `
      <article class="stream-card">
        <div class="thumb-wrap">
          <iframe class="player" data-src="${src}" src="${src}" allowfullscreen scrolling="no"></iframe>
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

  function renderStreamedCard(card) {
    return `
      <article class="stream-card">
        <div class="thumb-wrap">
          <iframe class="player" id="streamed-player" data-src="" src="" allowfullscreen></iframe>
        </div>

        <div class="stream-top">
          <div class="stream-title">${escapeHtml(card.name)}</div>
          <span class="badge warn" id="streamed-status">Loading...</span>
        </div>

        <div class="stream-meta" id="streamed-meta">
          <span>Match: -</span>
          <span>Source: -</span>
        </div>

        <div class="divider"></div>

        <label class="small">Pick a live match</label>

        <div class="tabs" role="tablist" aria-label="Streamed sports">
          <button class="tab" type="button" id="sport-football" data-sport="football" aria-selected="true">Football</button>
          <button class="tab" type="button" id="sport-basketball" data-sport="basketball" aria-selected="false">Basketball</button>
          <button class="tab" type="button" id="sport-soccer" data-sport="soccer" aria-selected="false">Soccer</button>
          <button class="tab" type="button" id="sport-hockey" data-sport="hockey" aria-selected="false">Hockey</button>
        </div>

        <select class="select" id="streamed-match-select" disabled>
          <option>Loading matches...</option>
        </select>
        <div id="streamed-match-info" style="margin-top:12px;" hidden>
          <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
            <img
              id="streamed-poster"
              alt="Match poster"
              loading="lazy"
              style="width:160px; height:90px; object-fit:cover; border-radius:12px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.03);"
              hidden
            />

            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
              <div style="display:flex; gap:8px; align-items:center;">
                <img
                  id="streamed-home-badge"
                  alt="Home badge"
                  loading="lazy"
                  style="width:28px; height:28px; border-radius:999px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.03);"
                  hidden
                />
                <span id="streamed-home-name" class="small">-</span>
              </div>

              <span class="small" style="opacity:.8;">vs</span>

              <div style="display:flex; gap:8px; align-items:center;">
                <img
                  id="streamed-away-badge"
                  alt="Away badge"
                  loading="lazy"
                  style="width:28px; height:28px; border-radius:999px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.03);"
                  hidden
                />
                <span id="streamed-away-name" class="small">-</span>
              </div>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <label class="small" for="streamed-source-select">Pick a source</label>
        <select class="select" id="streamed-source-select" disabled>
          <option>Select a match first...</option>
        </select>

        <label class="small" style="margin-top:10px;" for="streamed-stream-select">Pick a stream</label>
        <select class="select" id="streamed-stream-select" disabled>
          <option>Select a source first...</option>
        </select>

        <div class="stream-actions">
          <button class="mini-btn" type="button" id="streamed-reload">Reload</button>
          <a class="mini-btn" id="streamed-open" href="#" target="_blank" rel="noopener noreferrer">Open stream</a>
        </div>

        <div class="small">If a match fails to load, try another source or reload.</div>
      </article>
    `;
  }

  function mapUiSportToApiCategory(uiSport) {
    const sport = String(uiSport || "").toLowerCase();
    if (sport === "soccer") return "football";
    if (sport === "football") return "american-football";
    return sport;
  }

  function getSportMatches(matches, uiSport) {
    const mapped = mapUiSportToApiCategory(uiSport);
    return matches.filter((match) => String(match.category || "").toLowerCase() === mapped);
  }

  function renderMatchOptions(matches) {
    return matches
      .map((match) => {
        const title = match.title || "Untitled match";
        const when = match.date ? new Date(match.date).toLocaleString() : "";
        const suffix = when ? ` - ${escapeHtml(when)}` : "";
        return `<option value="${escapeAttr(match.id)}">${escapeHtml(title)}${suffix}</option>`;
      })
      .join("");
  }

  function renderSourceOptions(sources) {
    return sources
      .map((source) => {
        const key = String(source.source || "");
        const label = key ? key.toUpperCase() : "UNKNOWN";
        return `<option value="${escapeAttr(key)}">${escapeHtml(label)}</option>`;
      })
      .join("");
  }

  function renderStreamOptions(streams) {
    return streams
      .map((stream, index) => {
        const number = stream.streamNo ?? index + 1;
        const language = stream.language ? ` - ${stream.language}` : "";
        const quality = stream.hd ? " - HD" : " - SD";
        const source = stream.source ? ` - ${String(stream.source).toUpperCase()}` : "";
        const value = stream.id != null && String(stream.id).trim() !== ""
          ? String(stream.id)
          : String(number);

        return `<option value="${escapeAttr(value)}">Stream #${number}${language}${quality}${source}</option>`;
      })
      .join("");
  }

  function pickBestStream(streams) {
    return (
      streams.find((stream) => (stream.language || "").toLowerCase().includes("english") && stream.hd === true) ||
      streams.find((stream) => (stream.language || "").toLowerCase().includes("english")) ||
      streams.find((stream) => stream.hd === true) ||
      streams[0]
    );
  }

  function applyStream(stream, match, sourceNameFallback) {
    if (!stream || !stream.embedUrl) {
      setStreamedStatus("Bad stream data", "bad");
      return;
    }

    const iframe = document.getElementById("streamed-player");
    iframe.dataset.src = stream.embedUrl;
    iframe.src = stream.embedUrl;

    const open = document.getElementById("streamed-open");
    open.href = stream.embedUrl;

    const sourceName = stream.source || sourceNameFallback || "-";
    const sourceLabel = String(stream.source || sourceNameFallback || "").toUpperCase();
    const streamNumber = stream.streamNo || "?";
    const quality = stream.hd ? "HD" : "SD";

    setStreamedStatus(`${sourceLabel} - Stream #${streamNumber} - ${quality}`, "good");
    setStreamedMeta(
      `Match: ${match?.title || "-"}`,
      `Source: ${sourceName} - ${stream.language || "?"} - ${stream.hd ? "HD" : "SD"}`
    );
  }

  function badgeUrl(badgeId) {
    if (!badgeId) return "";
    return `https://streamed.pk/api/images/badge/${encodeURIComponent(String(badgeId))}.webp`;
  }

  function posterUrlFromBadges(homeBadgeId, awayBadgeId) {
    if (!homeBadgeId || !awayBadgeId) return "";
    return `https://streamed.pk/api/images/poster/${encodeURIComponent(String(homeBadgeId))}/${encodeURIComponent(String(awayBadgeId))}.webp`;
  }

  function proxyPosterUrl(posterId) {
    if (!posterId) return "";
    return `https://streamed.pk/api/images/proxy/${encodeURIComponent(String(posterId))}.webp`;
  }

  function setImg(el, src, alt) {
    if (!el) return;
    if (src) {
      el.src = src;
      if (alt) el.alt = alt;
      el.hidden = false;
    } else {
      el.removeAttribute("src");
      el.hidden = true;
    }
  }

  function updateMatchInfo(match) {
    const wrap = document.getElementById("streamed-match-info");
    if (!wrap) return;

    const posterEl = document.getElementById("streamed-poster");
    const homeBadgeEl = document.getElementById("streamed-home-badge");
    const awayBadgeEl = document.getElementById("streamed-away-badge");
    const homeNameEl = document.getElementById("streamed-home-name");
    const awayNameEl = document.getElementById("streamed-away-name");

    const homeName = match?.teams?.home?.name || "Home";
    const awayName = match?.teams?.away?.name || "Away";
    if (homeNameEl) homeNameEl.textContent = homeName;
    if (awayNameEl) awayNameEl.textContent = awayName;

    const homeBadgeId = match?.teams?.home?.badge || "";
    const awayBadgeId = match?.teams?.away?.badge || "";

    setImg(homeBadgeEl, homeBadgeId ? badgeUrl(homeBadgeId) : "", homeName);
    setImg(awayBadgeEl, awayBadgeId ? badgeUrl(awayBadgeId) : "", awayName);

    const poster = posterUrlFromBadges(homeBadgeId, awayBadgeId) || proxyPosterUrl(match?.poster);
    setImg(posterEl, poster, match?.title || "Match poster");

    wrap.hidden = !(poster || homeBadgeId || awayBadgeId || homeName || awayName);
  }

  async function initStreamedCard(config) {
    const matchSelect = document.getElementById("streamed-match-select");
    const sourceSelect = document.getElementById("streamed-source-select");
    const streamSelect = document.getElementById("streamed-stream-select");
    const reloadBtn = document.getElementById("streamed-reload");
    const sportTabs = [...document.querySelectorAll("[data-sport]")];

    let activeSport = localStorage.getItem("streamedSport") || "football";

    function resetSourceAndStreamSelects() {
      sourceSelect.disabled = true;
      sourceSelect.innerHTML = "<option>Select a match first...</option>";
      streamSelect.disabled = true;
      streamSelect.innerHTML = "<option>Select a source first...</option>";
      window.__selectedStreamedMatch = null;
      window.__selectedStreamsList = [];
    }

    async function setSport(nextSport) {
      activeSport = nextSport;
      localStorage.setItem("streamedSport", activeSport);

      sportTabs.forEach((button) => {
        const active = button.dataset.sport === activeSport;
        button.setAttribute("aria-selected", String(active));
      });

      const matches = window.__streamedMatches || [];
      if (!matches.length) return;

      const filtered = getSportMatches(matches, activeSport);
      matchSelect.innerHTML = filtered.length
        ? renderMatchOptions(filtered)
        : `<option>No live ${activeSport} matches right now</option>`;
      matchSelect.disabled = filtered.length === 0;

      resetSourceAndStreamSelects();

      if (filtered.length) {
        await loadSourcesForMatchId(filtered[0].id);
      }
    }

    sportTabs.forEach((button) => {
      button.addEventListener("click", () => setSport(button.dataset.sport));
    });

    reloadBtn.addEventListener("click", async () => {
      await loadMatchesAndFirstStream(config, activeSport);
      await setSport(activeSport);
    });

    matchSelect.addEventListener("change", async (event) => {
      if (!event.target.value) return;
      await loadSourcesForMatchId(event.target.value);
    });

    sourceSelect.addEventListener("change", async (event) => {
      const match = window.__selectedStreamedMatch;
      if (!match) return;

      const chosenSource = String(event.target.value || "");
      const source = (match.sources || []).find((item) => String(item.source) === chosenSource);
      if (!source) return;

      await loadStreamsForSource(source.source, source.id, match);
    });

    streamSelect.addEventListener("change", (event) => {
      const match = window.__selectedStreamedMatch;
      const streams = window.__selectedStreamsList || [];
      if (!match || !streams.length) return;

      const selectedValue = String(event.target.value || "");
      const chosen =
        streams.find((stream) => String(stream.id || "") === selectedValue) ||
        streams.find((stream) => String(stream.streamNo || "") === selectedValue) ||
        streams[0];

      applyStream(chosen, match);
    });

    resetSourceAndStreamSelects();
    await loadMatchesAndFirstStream(config, activeSport);
    await setSport(activeSport);
  }

  async function loadMatchesAndFirstStream(config, activeSport = "football") {
    setStreamedStatus("Loading...", "warn");
    setStreamedMeta("Match: -", "Source: -");

    const matchSelect = document.getElementById("streamed-match-select");
    matchSelect.disabled = true;
    matchSelect.innerHTML = "<option>Loading matches...</option>";

    let matches = await safeJsonFetch(config.matchesEndpoint);
    if (!Array.isArray(matches) || matches.length === 0) {
      matches = await safeJsonFetch(config.fallbackEndpoint);
    }

    if (!Array.isArray(matches) || matches.length === 0) {
      setStreamedStatus("No matches found", "bad");
      matchSelect.innerHTML = "<option>No matches available</option>";
      return;
    }

    window.__streamedMatches = matches;

    const filtered = getSportMatches(matches, activeSport);
    matchSelect.innerHTML = filtered.length
      ? renderMatchOptions(filtered)
      : `<option>No live ${activeSport} matches right now</option>`;
    matchSelect.disabled = filtered.length === 0;

    setStreamedStatus(`Loaded ${filtered.length}/${matches.length}`, filtered.length ? "good" : "warn");
  }

  async function loadSourcesForMatchId(matchId) {
    const matches = window.__streamedMatches || [];
    const match = matches.find((item) => item.id === matchId);

    const sourceSelect = document.getElementById("streamed-source-select");
    const streamSelect = document.getElementById("streamed-stream-select");

    sourceSelect.disabled = true;
    sourceSelect.innerHTML = "<option>Loading sources...</option>";
    streamSelect.disabled = true;
    streamSelect.innerHTML = "<option>Select a source first...</option>";

    if (!match) {
      setStreamedStatus("Match not found", "bad");
      sourceSelect.innerHTML = "<option>Select a match first...</option>";
      return;
    }

    window.__selectedStreamedMatch = match;
    updateMatchInfo(match);

    if (!Array.isArray(match.sources) || match.sources.length === 0) {
      setStreamedStatus("No sources for match", "bad");
      setStreamedMeta(`Match: ${match.title || "-"}`, "Source: -");
      sourceSelect.innerHTML = "<option>No sources available</option>";
      return;
    }

    sourceSelect.innerHTML = renderSourceOptions(match.sources);
    sourceSelect.disabled = false;

    const first = match.sources[0];
    sourceSelect.value = String(first.source);

    await loadStreamsForSource(first.source, first.id, match);
  }

  async function loadStreamsForSource(sourceName, sourceId, match) {
    const streamSelect = document.getElementById("streamed-stream-select");

    streamSelect.disabled = true;
    streamSelect.innerHTML = "<option>Loading streams...</option>";

    setStreamedStatus("Loading streams...", "warn");
    setStreamedMeta(`Match: ${match?.title || "-"}`, `Source: ${sourceName}`);

    const endpoint = `https://streamed.pk/api/stream/${encodeURIComponent(sourceName)}/${encodeURIComponent(sourceId)}`;
    const streams = await safeJsonFetch(endpoint);

    if (!Array.isArray(streams) || streams.length === 0) {
      setStreamedStatus("No streams returned", "bad");
      streamSelect.innerHTML = "<option>No streams available</option>";
      window.__selectedStreamsList = [];
      return;
    }

    window.__selectedStreamsList = streams;

    streamSelect.innerHTML = renderStreamOptions(streams);
    streamSelect.disabled = false;

    const best = pickBestStream(streams);
    const bestValue = best.id != null && String(best.id).trim() !== ""
      ? String(best.id)
      : String(best.streamNo || 1);

    streamSelect.value = bestValue;
    applyStream(best, match, sourceName);
  }

  function setStreamedStatus(text, kind) {
    const el = document.getElementById("streamed-status");
    el.textContent = text;
    el.classList.remove("good", "warn", "bad");
    if (kind) el.classList.add(kind);
  }

  function setStreamedMeta(left, right) {
    const el = document.getElementById("streamed-meta");
    el.innerHTML = `<span>${escapeHtml(left)}</span><span>${escapeHtml(right)}</span>`;
  }

  async function safeJsonFetch(url) {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status} ${response.statusText} (${url})`);
    }
    return response.json();
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("`", "&#96;");
  }
})();
