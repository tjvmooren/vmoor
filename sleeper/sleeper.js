(() => {
  /* =========================================================================
   * Sleeper Dashboard (vmoor)
   * - Reads config from window.VMOOR (set in HTML)
   * - Fetches league / rosters / users
   * - Renders standings, matchups by week, and playoff brackets
   * - Uses sessionStorage caching to reduce API calls
   * ========================================================================= */

  // ---------------------------
  // Config
  // ---------------------------
  const cfg = window.VMOOR || {};
  const leagueId = cfg.leagueId;

  const API_BASE = "https://api.sleeper.app/v1";

  // ---------------------------
  // DOM elements (all IDs from your HTML)
  // Naming convention: *El suffix for DOM nodes*
  // ---------------------------
  const els = {
    // Header / meta
    leagueNameEl: document.getElementById("leagueName"),
    leagueMetaEl: document.getElementById("leagueMeta"),
    openSleeperEl: document.getElementById("openSleeper"),
    refreshBtnEl: document.getElementById("refreshBtn"),
    buildInfoEl: document.getElementById("buildInfo"),
    apiInfoEl: document.getElementById("apiInfo"),

    // Standings card states
    loadingRowEl: document.getElementById("loadingRow"),
    errorRowEl: document.getElementById("errorRow"),
    contentEl: document.getElementById("content"),

    // Standings table
    standingsBodyEl: document.getElementById("standingsBody"),
    standingsNoteEl: document.getElementById("standingsNote"),
    lastUpdatedEl: document.getElementById("lastUpdated"),

    // Matchups
    weekSelectEl: document.getElementById("weekSelect"),
    loadWeekBtnEl: document.getElementById("loadWeekBtn"),
    matchupsBodyEl: document.getElementById("matchupsBody"),
    matchupsNoteEl: document.getElementById("matchupsNote"),

    // Playoffs
    btnWinnersEl: document.getElementById("btnWinners"),
    btnLosersEl: document.getElementById("btnLosers"),
    playoffsBodyEl: document.getElementById("playoffsBody"),
    playoffsNoteEl: document.getElementById("playoffsNote"),

    //Champion cards
    viewDashboard: document.getElementById("viewDashboard"),
    viewChampions: document.getElementById("viewChampions"),
    tabDashboard: document.getElementById("tabDashboard"),
    tabChampions: document.getElementById("tabChampions"),
    championsGrid: document.getElementById("championsGrid"),
    championsMeta: document.getElementById("championsMeta"),
  };

  // Cosmetic info
  if (els.apiInfoEl) els.apiInfoEl.textContent = `api: ${API_BASE}`;
  if (els.buildInfoEl) els.buildInfoEl.textContent = `build: ${new Date().toISOString().slice(0, 10)}`;
  
  // Champion (hardcode - Sleeper doesn't store champions)
  const CHAMPIONS = [
    // Champion List
    { season: 2025, champion: "Chandler", runnerUp: "Will", note: "Dominate Win in Finals" },
    { season: 2024, champion: "Tyler V.", runnerUp: "", note: "Dominant playoffs" },
  ];

  function renderChampions() {
    if (!els.championsGrid) return;

    els.championsGrid.innerHTML = "";

    // newest season first
    const sorted = [...CHAMPIONS].sort((a, b) => b.season - a.season);

    for (const entry of sorted) {
      const card = document.createElement("div");
      card.className = "champ-card";

      card.innerHTML = `
        <div class="champ-year mono">Season ${entry.season}</div>
        <div class="champ-name">🏆 ${escapeHtml(entry.champion)}</div>
        <div class="champ-sub">Runner-up: ${escapeHtml(entry.runnerUp || "—")}</div>
        ${entry.note ? `<div class="champ-sub">${escapeHtml(entry.note)}</div>` : ""}
        <div class="champ-badges">
          <span class="pill">Champion</span>
          ${entry.runnerUp ? `<span class="pill">Runner-up recorded</span>` : ""}
        </div>
      `;

      els.championsGrid.appendChild(card);
    }

    if (els.championsMeta) {
      els.championsMeta.textContent = `${sorted.length} seasons`;
    }
  }

  // ---------------------------
  // Caching (sessionStorage)
  // ---------------------------
  // League payload cache: league + rosters + users
  const LEAGUE_CACHE_KEY = `vmoor_sleeper_${leagueId}`;
  const LEAGUE_CACHE_TTL_MS = 2 * 60 * 1000;

  // Matchups cache per week
  const matchupCacheKey = (week) => `vmoor_matchups_${leagueId}_${week}`;
  const MATCHUPS_CACHE_TTL_MS = 60 * 1000;

  // Playoffs cache (winners/losers)
  const playoffsCacheKey = (type) => `vmoor_playoffs_${leagueId}_${type}`;
  const PLAYOFFS_CACHE_TTL_MS = 5 * 60 * 1000;

  // ---------------------------
  // Runtime maps (filled in hydrate())
  // ---------------------------
  let usersById = new Map();        // user_id -> user object
  let rosterIdToTeamName = new Map(); // roster_id -> display team name

  // =========================================================================
  // UI helpers
  // =========================================================================
  function showError(message) {
    if (els.loadingRowEl) els.loadingRowEl.style.display = "none";
    if (els.contentEl) els.contentEl.style.display = "none";

    if (els.errorRowEl) {
      els.errorRowEl.style.display = "block";
      els.errorRowEl.textContent = message;
    }
  }

  function showContent() {
    if (els.loadingRowEl) els.loadingRowEl.style.display = "none";
    if (els.errorRowEl) els.errorRowEl.style.display = "none";
    if (els.contentEl) els.contentEl.style.display = "block";
  }

  function setActiveTab(tab) {
  // Optional: add a subtle "active" border
  // If you want: create a CSS class .active { border-color: var(--link); }
  els.tabDashboard?.classList.toggle("active", tab === "dashboard");
  els.tabChampions?.classList.toggle("active", tab === "champions");
  }

  function showView(view) {
    const isDashboard = view === "dashboard";

    if (els.viewDashboard) els.viewDashboard.style.display = isDashboard ? "block" : "none";
    if (els.viewChampions) els.viewChampions.style.display = isDashboard ? "none" : "block";

    setActiveTab(isDashboard ? "dashboard" : "champions");
  }


  // =========================================================================
  // Network helpers
  // =========================================================================
  async function fetchJson(url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }

  // =========================================================================
  // Formatting helpers
  // =========================================================================
  function toPoints(settings, keyBase) {
    // Sleeper often stores points as whole + decimal (hundredths)
    const whole = Number(settings?.[keyBase] ?? 0);
    const dec = Number(settings?.[`${keyBase}_decimal`] ?? 0);
    return whole + dec / 100;
  }

  function fmt2(n) {
    // Always show 2 decimals
    return (Math.round(Number(n) * 100) / 100).toFixed(2);
  }

  function escapeHtml(str) {
    // Prevent HTML injection when inserting user/team strings into innerHTML
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // =========================================================================
  // Cache helpers
  // =========================================================================
  function readCache(key, ttlMs) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;

      const data = JSON.parse(raw);
      const isExpired = !data?.ts || (Date.now() - data.ts) > ttlMs;
      if (isExpired) return null;

      return data.payload;
    } catch {
      return null;
    }
  }

  function writeCache(key, payload) {
    try {
      sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), payload }));
    } catch {
      // If storage fails (quota, privacy mode), just skip caching.
    }
  }

  // =========================================================================
  // Data helpers
  // =========================================================================
  function teamNameFromUser(user) {
    // Prefer custom team name if user set it in metadata
    if (!user) return "Unknown";

    const metaTeamName = user?.metadata?.team_name;
    if (metaTeamName && String(metaTeamName).trim().length > 0) return metaTeamName;

    return user.display_name || user.username || "Team";
  }

  // =========================================================================
  // Standings
  // =========================================================================
  function buildStandings(rosters) {
    const rows = (rosters || []).map((roster) => {
      const settings = roster.settings || {};

      const wins = Number(settings.wins ?? 0);
      const losses = Number(settings.losses ?? 0);
      const ties = Number(settings.ties ?? 0);

      const pointsFor = toPoints(settings, "fpts");
      const pointsAgainst = toPoints(settings, "fpts_against"); // may be missing -> 0
      const diff = pointsFor - pointsAgainst;

      const user = usersById.get(roster.owner_id);
      const team = teamNameFromUser(user);

      return {
        team,
        rosterId: roster.roster_id,
        w: wins,
        l: losses,
        t: ties,
        pf: pointsFor,
        pa: pointsAgainst,
        diff,
      };
    });

    // Sort rules (your original logic)
    rows.sort((left, right) => {
      if (right.w !== left.w) return right.w - left.w;
      if (right.t !== left.t) return right.t - left.t;
      if (right.pf !== left.pf) return right.pf - left.pf;
      if (left.pa !== right.pa) return left.pa - right.pa;
      return left.team.localeCompare(right.team);
    });

    return rows.map((row, index) => ({ rank: index + 1, ...row }));
  }

  function renderStandings(standings) {
    if (!els.standingsBodyEl) return;

    els.standingsBodyEl.innerHTML = "";

    for (const entry of standings) {
      const rowEl = document.createElement("tr");

      rowEl.innerHTML = `
        <td>${entry.rank}</td>
        <td>${escapeHtml(entry.team)}</td>
        <td class="num">${entry.w}-${entry.l}-${entry.t}</td>
        <td class="num">${fmt2(entry.pf)}</td>
        <td class="num">${fmt2(entry.pa)}</td>
        <td class="num">${(entry.diff >= 0 ? "+" : "") + fmt2(entry.diff)}</td>
      `;

      els.standingsBodyEl.appendChild(rowEl);
    }
  }

  function regularSeasonWeeksFromLeague(league) {
    // If playoff week start is known, regular season ends the week before.
    const playoffWeekStart = Number(league?.settings?.playoff_week_start ?? 0);
    if (playoffWeekStart && playoffWeekStart > 1) return playoffWeekStart - 1;

    // fallback if Sleeper data is missing
    return 14;
  }

  function fillWeekSelect(regularSeasonWeeks) {
    if (!els.weekSelectEl) return;

    els.weekSelectEl.innerHTML = "";

    for (let week = 1; week <= regularSeasonWeeks; week++) {
      const opt = document.createElement("option");
      opt.value = String(week);
      opt.textContent = `Week ${week}`;
      els.weekSelectEl.appendChild(opt);
    }

    // default selection
    els.weekSelectEl.value = "1";
  }

  // =========================================================================
  // Matchups
  // =========================================================================
  async function loadWeekMatchups(week, { bypassCache = false } = {}) {
    if (!week || !els.matchupsBodyEl || !els.matchupsNoteEl) return;

    const weekNum = Number(week);
    els.matchupsNoteEl.textContent = `Loading week ${weekNum}…`;
    els.matchupsBodyEl.innerHTML = "";

    if (!bypassCache) {
      const cached = readCache(matchupCacheKey(weekNum), MATCHUPS_CACHE_TTL_MS);
      if (cached) {
        renderMatchups(cached, weekNum, { cached: true });
        return;
      }
    }

    try {
      const matchups = await fetchJson(`${API_BASE}/league/${leagueId}/matchups/${weekNum}`);
      writeCache(matchupCacheKey(weekNum), matchups);
      renderMatchups(matchups, weekNum, { cached: false });
    } catch (err) {
      els.matchupsNoteEl.textContent = `Failed to load week ${weekNum}: ${err?.message || err}`;
    }
  }

  function renderMatchups(matchups, week, { cached }) {
    // Group each roster's matchup entry by matchup_id
    const matchupsById = new Map();

    for (const matchup of (matchups || [])) {
      const matchupId = matchup.matchup_id ?? "bye";
      if (!matchupsById.has(matchupId)) matchupsById.set(matchupId, []);
      matchupsById.get(matchupId).push(matchup);
    }

    // Sort matchup IDs so table order is stable
    const matchupIds = Array.from(matchupsById.keys()).sort((a, b) => {
      const na = Number(a), nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    });

    els.matchupsBodyEl.innerHTML = "";

    for (const matchupId of matchupIds) {
      const pair = matchupsById.get(matchupId) || [];

      // These were your a/b variables — renamed for clarity
      const matchupA = pair[0];
      const matchupB = pair[1];

      const teamAName =
        rosterIdToTeamName.get(matchupA?.roster_id) || `Roster ${matchupA?.roster_id ?? "?"}`;

      const teamBName = matchupB
        ? (rosterIdToTeamName.get(matchupB.roster_id) || `Roster ${matchupB.roster_id}`)
        : "BYE";

      const teamAPoints = Number(matchupA?.points ?? 0);
      const teamBPoints = Number(matchupB?.points ?? 0);

      const rowEl = document.createElement("tr");
      rowEl.innerHTML = `
        <td class="mono">${escapeHtml(matchupId)}</td>
        <td>${escapeHtml(teamAName)}</td>
        <td class="num">${fmt2(teamAPoints)}</td>
        <td>${escapeHtml(teamBName)}</td>
        <td class="num">${matchupB ? fmt2(teamBPoints) : ""}</td>
      `;

      els.matchupsBodyEl.appendChild(rowEl);
    }

    els.matchupsNoteEl.textContent = `Week ${week} matchups (${cached ? "cached" : "live"})`;
  }

  // =========================================================================
  // Playoffs
  // =========================================================================
  async function loadPlayoffs(type = "winners", { bypassCache = false } = {}) {
    if (!els.playoffsBodyEl || !els.playoffsNoteEl) return;

    const endpoint = type === "losers" ? "losers_bracket" : "winners_bracket";

    els.playoffsNoteEl.textContent = `Loading ${type} bracket…`;
    els.playoffsBodyEl.innerHTML = "";

    if (!bypassCache) {
      const cached = readCache(playoffsCacheKey(type), PLAYOFFS_CACHE_TTL_MS);
      if (cached) {
        renderPlayoffs(cached, type, { cached: true });
        return;
      }
    }

    try {
      const data = await fetchJson(`${API_BASE}/league/${leagueId}/${endpoint}`);
      writeCache(playoffsCacheKey(type), data);
      renderPlayoffs(data, type, { cached: false });
    } catch (err) {
      els.playoffsNoteEl.textContent = `Failed to load ${type} bracket: ${err?.message || err}`;
    }
  }

  function renderPlayoffs(bracket, type, { cached }) {
    const games = Array.isArray(bracket) ? bracket : [];

    if (games.length === 0) {
      els.playoffsNoteEl.textContent =
        `${type} bracket not available yet (or playoffs haven’t started).`;
      return;
    }

    const teamLabel = (rosterId) =>
      rosterId ? (rosterIdToTeamName.get(rosterId) || `Roster ${rosterId}`) : "TBD";

    const winnerLabel = (winnerRosterId) =>
      winnerRosterId ? (rosterIdToTeamName.get(winnerRosterId) || `Roster ${winnerRosterId}`) : "TBD";

    // Sort by round then game number
    const sortedGames = [...games].sort((a, b) => {
      const roundA = Number(a?.r ?? 0);
      const roundB = Number(b?.r ?? 0);
      if (roundA !== roundB) return roundA - roundB;

      const matchA = Number(a?.m ?? 0);
      const matchB = Number(b?.m ?? 0);
      return matchA - matchB;
    });

    els.playoffsBodyEl.innerHTML = "";

    for (const game of sortedGames) {
      const round = game?.r ?? "";
      const gameNum = game?.m ?? "";

      // Sleeper bracket fields commonly use t1/t2 and winner w
      const team1 = game?.t1 ?? game?.team1 ?? game?.roster_id_1;
      const team2 = game?.t2 ?? game?.team2 ?? game?.roster_id_2;
      const winner = game?.w ?? game?.winner;

      const rowEl = document.createElement("tr");
      rowEl.innerHTML = `
        <td class="mono">${escapeHtml(round)}</td>
        <td class="mono">${escapeHtml(gameNum)}</td>
        <td>${escapeHtml(teamLabel(team1))}</td>
        <td>${escapeHtml(teamLabel(team2))}</td>
        <td>${escapeHtml(winnerLabel(winner))}</td>
      `;

      els.playoffsBodyEl.appendChild(rowEl);
    }

    els.playoffsNoteEl.textContent = `${type} bracket (${cached ? "cached" : "live"})`;
  }

  // =========================================================================
  // Main load (league + rosters + users)
  // =========================================================================
  async function load({ bypassCache = false } = {}) {
    if (!leagueId) return showError("Missing leagueId config.");

    // Reset UI to loading state
    if (els.loadingRowEl) els.loadingRowEl.style.display = "flex";
    if (els.errorRowEl) els.errorRowEl.style.display = "none";
    if (els.contentEl) els.contentEl.style.display = "none";

    // Use cached league payload if available
    if (!bypassCache) {
      const cachedPayload = readCache(LEAGUE_CACHE_KEY, LEAGUE_CACHE_TTL_MS);
      if (cachedPayload) {
        hydrate(cachedPayload, { cached: true });
        return;
      }
    }

    try {
      const [league, rosters, users] = await Promise.all([
        fetchJson(`${API_BASE}/league/${leagueId}`),
        fetchJson(`${API_BASE}/league/${leagueId}/rosters`),
        fetchJson(`${API_BASE}/league/${leagueId}/users`),
      ]);

      const payload = { league, rosters, users };
      writeCache(LEAGUE_CACHE_KEY, payload);
      hydrate(payload, { cached: false });
    } catch (err) {
      showError(`Failed to load Sleeper data: ${err?.message || err}`);
    }
  }

  function hydrate(payload, { cached }) {
    const { league, rosters, users } = payload;

    // Build users map (user_id -> user)
    usersById = new Map();
    for (const user of (users || [])) {
      if (user?.user_id) usersById.set(user.user_id, user);
    }

    // Build rosterId -> team name map
    rosterIdToTeamName = new Map();
    for (const roster of (rosters || [])) {
      const owner = usersById.get(roster.owner_id);
      rosterIdToTeamName.set(roster.roster_id, teamNameFromUser(owner));
    }

    // Header
    if (els.leagueNameEl) els.leagueNameEl.textContent = league?.name || "Sleeper Dashboard";

    const season = league?.season ?? cfg.season ?? "";
    const teams = league?.total_rosters ?? rosters?.length ?? "";

    if (els.leagueMetaEl) {
      els.leagueMetaEl.textContent = [
        season ? `Season: ${season}` : null,
        teams ? `Teams: ${teams}` : null,
        `Type: ${cfg.leagueType || "league"}`,
      ].filter(Boolean).join(" • ");
    }

    // "Open in Sleeper" link
    if (els.openSleeperEl) els.openSleeperEl.href = `https://sleeper.com/leagues/${leagueId}`;

    // Standings
    const standings = buildStandings(rosters || []);
    renderStandings(standings);

    if (els.standingsNoteEl) {
      els.standingsNoteEl.textContent = "Sorted by wins, ties, PF, then PA.";
    }

    // Last updated pill
    if (els.lastUpdatedEl) {
      const now = new Date();
      els.lastUpdatedEl.textContent = `${cached ? "cached" : "live"} • ${now.toLocaleString()}`;
    }

    // Week dropdown
    const regularSeasonWeeks = regularSeasonWeeksFromLeague(league);
    fillWeekSelect(regularSeasonWeeks);

    showContent();

    // Defaults on load
    if (els.weekSelectEl) loadWeekMatchups(els.weekSelectEl.value);
    loadPlayoffs("winners");
  }

  // =========================================================================
  // Event wiring
  // =========================================================================
  if (els.refreshBtnEl) {
    els.refreshBtnEl.addEventListener("click", () => load({ bypassCache: true }));
  }

  if (els.loadWeekBtnEl) {
    els.loadWeekBtnEl.addEventListener("click", () =>
      loadWeekMatchups(els.weekSelectEl?.value, { bypassCache: true })
    );
  }

  if (els.weekSelectEl) {
    els.weekSelectEl.addEventListener("change", () =>
      loadWeekMatchups(els.weekSelectEl.value)
    );
  }

  if (els.btnWinnersEl) {
    els.btnWinnersEl.addEventListener("click", () =>
      loadPlayoffs("winners", { bypassCache: true })
    );
  }

  if (els.btnLosersEl) {
    els.btnLosersEl.addEventListener("click", () =>
      loadPlayoffs("losers", { bypassCache: true })
    );
  }
  if (els.tabDashboard) {
    els.tabDashboard.addEventListener("click", () => showView("dashboard"));
  }

  if (els.tabChampions) {
    els.tabChampions.addEventListener("click", () => {
      renderChampions();
      showView("champions");
    });
  }

  // default view on load
  showView("dashboard");

  // =========================================================================
  // Go time
  // =========================================================================
  load();
})();
