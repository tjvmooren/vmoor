(() => {
  const cfg = window.VMOOR || {};
  const leagueId = cfg.leagueId;

  const els = {
    leagueName: document.getElementById("leagueName"),
    leagueMeta: document.getElementById("leagueMeta"),
    openSleeper: document.getElementById("openSleeper"),
    refreshBtn: document.getElementById("refreshBtn"),
    buildInfo: document.getElementById("buildInfo"),
    apiInfo: document.getElementById("apiInfo"),

    loadingRow: document.getElementById("loadingRow"),
    errorRow: document.getElementById("errorRow"),
    content: document.getElementById("content"),

    standingsBody: document.getElementById("standingsBody"),
    standingsNote: document.getElementById("standingsNote"),
    lastUpdated: document.getElementById("lastUpdated"),

    weekSelect: document.getElementById("weekSelect"),
    loadWeekBtn: document.getElementById("loadWeekBtn"),
    matchupsBody: document.getElementById("matchupsBody"),
    matchupsNote: document.getElementById("matchupsNote"),

    btnWinners: document.getElementById("btnWinners"),
    btnLosers: document.getElementById("btnLosers"),
    playoffsBody: document.getElementById("playoffsBody"),
    playoffsNote: document.getElementById("playoffsNote"),
  };

  const API = "https://api.sleeper.app/v1";
  if (els.apiInfo) els.apiInfo.textContent = `api: ${API}`;
  if (els.buildInfo) els.buildInfo.textContent = `build: ${new Date().toISOString().slice(0, 10)}`;

  // Cache: league+rosters+users
  const CACHE_KEY = `vmoor_sleeper_${leagueId}`;
  const CACHE_TTL_MS = 2 * 60 * 1000;

  // Cache: matchups per week
  const MU_KEY = (w) => `vmoor_matchups_${leagueId}_${w}`;
  const MU_TTL_MS = 60 * 1000;

  // Cache: playoffs
  const PO_KEY = (type) => `vmoor_playoffs_${leagueId}_${type}`;
  const PO_TTL_MS = 5 * 60 * 1000;

  // runtime maps
  let usersById = new Map();
  let rosterIdToTeam = new Map();

  function showError(msg) {
    if (els.loadingRow) els.loadingRow.style.display = "none";
    if (els.content) els.content.style.display = "none";
    if (els.errorRow) {
      els.errorRow.style.display = "block";
      els.errorRow.textContent = msg;
    }
  }

  function showContent() {
    if (els.loadingRow) els.loadingRow.style.display = "none";
    if (els.errorRow) els.errorRow.style.display = "none";
    if (els.content) els.content.style.display = "block";
  }

  async function fetchJson(url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }

  function toPoints(settings, keyBase) {
    const whole = Number(settings?.[keyBase] ?? 0);
    const dec = Number(settings?.[`${keyBase}_decimal`] ?? 0);
    return whole + dec / 100;
  }

  function fmt(n) {
    return (Math.round(Number(n) * 100) / 100).toFixed(2);
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function readCache(key, ttlMs) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.ts || (Date.now() - data.ts) > ttlMs) return null;
      return data.payload;
    } catch {
      return null;
    }
  }

  function writeCache(key, payload) {
    try {
      sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), payload }));
    } catch {
      // ignore
    }
  }

  function teamNameFromUser(user) {
    if (!user) return "Unknown";
    const metaTeam = user?.metadata?.team_name;
    return metaTeam && String(metaTeam).trim().length > 0
      ? metaTeam
      : (user.display_name || user.username || "Team");
  }

  function buildStandings(rosters) {
    const rows = (rosters || []).map((r) => {
      const settings = r.settings || {};
      const wins = Number(settings.wins ?? 0);
      const losses = Number(settings.losses ?? 0);
      const ties = Number(settings.ties ?? 0);

      const pf = toPoints(settings, "fpts");
      const pa = toPoints(settings, "fpts_against"); // may be missing → 0
      const diff = pf - pa;

      const user = usersById.get(r.owner_id);
      const team = teamNameFromUser(user);

      return { team, rosterId: r.roster_id, w: wins, l: losses, t: ties, pf, pa, diff };
    });

    rows.sort((a, b) => {
      if (b.w !== a.w) return b.w - a.w;
      if (b.t !== a.t) return b.t - a.t;
      if (b.pf !== a.pf) return b.pf - a.pf;
      if (a.pa !== b.pa) return a.pa - b.pa;
      return a.team.localeCompare(b.team);
    });

    return rows.map((r, i) => ({ rank: i + 1, ...r }));
  }

  function renderStandings(standings) {
    if (!els.standingsBody) return;
    els.standingsBody.innerHTML = "";

    for (const s of standings) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${s.rank}</td>
        <td>${escapeHtml(s.team)}</td>
        <td class="num">${s.w}-${s.l}-${s.t}</td>
        <td class="num">${fmt(s.pf)}</td>
        <td class="num">${fmt(s.pa)}</td>
        <td class="num">${(s.diff >= 0 ? "+" : "") + fmt(s.diff)}</td>
      `;
      els.standingsBody.appendChild(tr);
    }
  }

  function regularSeasonWeeksFromLeague(league) {
    const pws = Number(league?.settings?.playoff_week_start ?? 0);
    if (pws && pws > 1) return pws - 1;
    return 14; // fallback
  }

  function fillWeekSelect(regularSeasonWeeks) {
    if (!els.weekSelect) return;
    els.weekSelect.innerHTML = "";
    for (let w = 1; w <= regularSeasonWeeks; w++) {
      const opt = document.createElement("option");
      opt.value = String(w);
      opt.textContent = `Week ${w}`;
      els.weekSelect.appendChild(opt);
    }
    els.weekSelect.value = "1";
  }

  // ---------------------------
  // Matchups
  // ---------------------------
  async function loadWeekMatchups(week, { bypassCache = false } = {}) {
    if (!week || !els.matchupsBody || !els.matchupsNote) return;
    const w = Number(week);

    els.matchupsNote.textContent = `Loading week ${w}…`;
    els.matchupsBody.innerHTML = "";

    if (!bypassCache) {
      const cached = readCache(MU_KEY(w), MU_TTL_MS);
      if (cached) {
        renderMatchups(cached, w, { cached: true });
        return;
      }
    }

    try {
      const matchups = await fetchJson(`${API}/league/${leagueId}/matchups/${w}`);
      writeCache(MU_KEY(w), matchups);
      renderMatchups(matchups, w, { cached: false });
    } catch (e) {
      els.matchupsNote.textContent = `Failed to load week ${w}: ${e?.message || e}`;
    }
  }

  function renderMatchups(matchups, week, { cached }) {
    const groups = new Map();
    for (const m of (matchups || [])) {
      const id = m.matchup_id ?? "bye";
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(m);
    }

    const matchupIds = Array.from(groups.keys()).sort((a, b) => {
      const na = Number(a), nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    });

    els.matchupsBody.innerHTML = "";

    for (const mid of matchupIds) {
      const pair = groups.get(mid) || [];
      const a = pair[0];
      const b = pair[1];

      const aName = rosterIdToTeam.get(a?.roster_id) || `Roster ${a?.roster_id ?? "?"}`;
      const bName = b ? (rosterIdToTeam.get(b.roster_id) || `Roster ${b.roster_id}`) : "BYE";

      const aPts = Number(a?.points ?? 0);
      const bPts = Number(b?.points ?? 0);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${escapeHtml(mid)}</td>
        <td>${escapeHtml(aName)}</td>
        <td class="num">${fmt(aPts)}</td>
        <td>${escapeHtml(bName)}</td>
        <td class="num">${b ? fmt(bPts) : ""}</td>
      `;
      els.matchupsBody.appendChild(tr);
    }

    els.matchupsNote.textContent = `Week ${week} matchups (${cached ? "cached" : "live"})`;
  }

  // ---------------------------
  // Playoffs
  // ---------------------------
  async function loadPlayoffs(type = "winners", { bypassCache = false } = {}) {
    if (!els.playoffsBody || !els.playoffsNote) return;

    const endpoint = type === "losers" ? "losers_bracket" : "winners_bracket";
    els.playoffsNote.textContent = `Loading ${type} bracket…`;
    els.playoffsBody.innerHTML = "";

    if (!bypassCache) {
      const cached = readCache(PO_KEY(type), PO_TTL_MS);
      if (cached) {
        renderPlayoffs(cached, type, { cached: true });
        return;
      }
    }

    try {
      const data = await fetchJson(`${API}/league/${leagueId}/${endpoint}`);
      writeCache(PO_KEY(type), data);
      renderPlayoffs(data, type, { cached: false });
    } catch (e) {
      els.playoffsNote.textContent = `Failed to load ${type} bracket: ${e?.message || e}`;
    }
  }

  function renderPlayoffs(bracket, type, { cached }) {
    const list = Array.isArray(bracket) ? bracket : [];

    if (list.length === 0) {
      els.playoffsNote.textContent = `${type} bracket not available yet (or playoffs haven’t started).`;
      return;
    }

    const getTeam = (rosterId) =>
      rosterId ? (rosterIdToTeam.get(rosterId) || `Roster ${rosterId}`) : "TBD";
    const getWinner = (w) => (w ? (rosterIdToTeam.get(w) || `Roster ${w}`) : "TBD");

    const sorted = [...list].sort((a, b) => {
      const ra = Number(a?.r ?? 0), rb = Number(b?.r ?? 0);
      if (ra !== rb) return ra - rb;
      const ma = Number(a?.m ?? 0), mb = Number(b?.m ?? 0);
      return ma - mb;
    });

    els.playoffsBody.innerHTML = "";
    for (const g of sorted) {
      const round = g?.r ?? "";
      const game = g?.m ?? "";

      // Sleeper bracket fields commonly use t1/t2 and winner w
      const t1 = g?.t1 ?? g?.team1 ?? g?.roster_id_1;
      const t2 = g?.t2 ?? g?.team2 ?? g?.roster_id_2;
      const winner = g?.w ?? g?.winner;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${escapeHtml(round)}</td>
        <td class="mono">${escapeHtml(game)}</td>
        <td>${escapeHtml(getTeam(t1))}</td>
        <td>${escapeHtml(getTeam(t2))}</td>
        <td>${escapeHtml(getWinner(winner))}</td>
      `;
      els.playoffsBody.appendChild(tr);
    }

    els.playoffsNote.textContent = `${type} bracket (${cached ? "cached" : "live"})`;
  }

  // ---------------------------
  // Main load
  // ---------------------------
  async function load({ bypassCache = false } = {}) {
    if (!leagueId) return showError("Missing leagueId config.");

    if (els.loadingRow) els.loadingRow.style.display = "flex";
    if (els.errorRow) els.errorRow.style.display = "none";
    if (els.content) els.content.style.display = "none";

    if (!bypassCache) {
      const cached = readCache(CACHE_KEY, CACHE_TTL_MS);
      if (cached) {
        hydrate(cached, { cached: true });
        return;
      }
    }

    try {
      const [league, rosters, users] = await Promise.all([
        fetchJson(`${API}/league/${leagueId}`),
        fetchJson(`${API}/league/${leagueId}/rosters`),
        fetchJson(`${API}/league/${leagueId}/users`),
      ]);

      const payload = { league, rosters, users };
      writeCache(CACHE_KEY, payload);
      hydrate(payload, { cached: false });
    } catch (e) {
      showError(`Failed to load Sleeper data: ${e?.message || e}`);
    }
  }

  function hydrate(payload, { cached }) {
    const { league, rosters, users } = payload;

    // Users map
    usersById = new Map();
    for (const u of (users || [])) if (u?.user_id) usersById.set(u.user_id, u);

    // rosterId → team name
    rosterIdToTeam = new Map();
    for (const r of (rosters || [])) {
      const user = usersById.get(r.owner_id);
      rosterIdToTeam.set(r.roster_id, teamNameFromUser(user));
    }

    // Header
    if (els.leagueName) els.leagueName.textContent = league?.name || "Sleeper Dashboard";
    const season = league?.season ?? cfg.season ?? "";
    const teams = league?.total_rosters ?? rosters?.length ?? "";
    if (els.leagueMeta) {
      els.leagueMeta.textContent = [
        season ? `Season: ${season}` : null,
        teams ? `Teams: ${teams}` : null,
        `Type: ${cfg.leagueType || "league"}`,
      ].filter(Boolean).join(" • ");
    }

    if (els.openSleeper) els.openSleeper.href = `https://sleeper.com/leagues/${leagueId}`;

    // Standings
    const standings = buildStandings(rosters || []);
    renderStandings(standings);
    if (els.standingsNote) els.standingsNote.textContent = "Sorted by wins, ties, PF, then PA.";

    if (els.lastUpdated) {
      const now = new Date();
      els.lastUpdated.textContent = `${cached ? "cached" : "live"} • ${now.toLocaleString()}`;
    }

    // Week selector
    const regWeeks = regularSeasonWeeksFromLeague(league);
    fillWeekSelect(regWeeks);

    showContent();

    // Defaults
    if (els.weekSelect) loadWeekMatchups(els.weekSelect.value);
    loadPlayoffs("winners");
  }

  // Wire up events
  if (els.refreshBtn) els.refreshBtn.addEventListener("click", () => load({ bypassCache: true }));
  if (els.loadWeekBtn) els.loadWeekBtn.addEventListener("click", () => loadWeekMatchups(els.weekSelect?.value, { bypassCache: true }));
  if (els.weekSelect) els.weekSelect.addEventListener("change", () => loadWeekMatchups(els.weekSelect.value));
  if (els.btnWinners) els.btnWinners.addEventListener("click", () => loadPlayoffs("winners", { bypassCache: true }));
  if (els.btnLosers) els.btnLosers.addEventListener("click", () => loadPlayoffs("losers", { bypassCache: true }));

  // Go
  load();
})();
