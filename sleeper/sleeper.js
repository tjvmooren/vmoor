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
  };

  const API = "https://api.sleeper.app/v1";
  els.apiInfo.textContent = `api: ${API}`;
  els.buildInfo.textContent = `build: ${new Date().toISOString().slice(0, 10)}`;

  // Cache: league+rosters+users
  const CACHE_KEY = `vmoor_sleeper_${leagueId}`;
  const CACHE_TTL_MS = 2 * 60 * 1000;

  // Cache: matchups per week
  const MU_KEY = (w) => `vmoor_matchups_${leagueId}_${w}`;
  const MU_TTL_MS = 60 * 1000;

  // runtime maps
  let usersById = new Map();
  let rosterIdToTeam = new Map();
  let leagueObj = null;

  function showError(msg) {
    els.loadingRow.style.display = "none";
    els.content.style.display = "none";
    els.errorRow.style.display = "block";
    els.errorRow.textContent = msg;
  }

  function showContent() {
    els.loadingRow.style.display = "none";
    els.errorRow.style.display = "none";
    els.content.style.display = "block";
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
    return (Math.round(n * 100) / 100).toFixed(2);
  }

  function teamNameFromUser(user) {
    if (!user) return "Unknown";
    const metaTeam = user?.metadata?.team_name;
    return metaTeam && String(metaTeam).trim().length > 0
      ? metaTeam
      : (user.display_name || user.username || "Team");
  }

  function buildStandings(rosters) {
    const rows = rosters.map((r) => {
      const settings = r.settings || {};
      const wins = Number(settings.wins ?? 0);
      const losses = Number(settings.losses ?? 0);
      const ties = Number(settings.ties ?? 0);

      const pf = toPoints(settings, "fpts");
      const pa = toPoints(settings, "fpts_against"); // may be missing → 0
      const diff = pf - pa;

      const user = usersById.get(r.owner_id);
      const team = teamNameFromUser(user);

      return { team, ownerId: r.owner_id, rosterId: r.roster_id, w: wins, l: losses, t: ties, pf, pa, diff };
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
    } catch {}
  }

  function fillWeekSelect({ regularSeasonWeeks }) {
    els.weekSelect.innerHTML = "";
    for (let w = 1; w <= regularSeasonWeeks; w++) {
      const opt = document.createElement("option");
      opt.value = String(w);
      opt.textContent = `Week ${w}`;
      els.weekSelect.appendChild(opt);
    }
    // default to week 1 for now (we can auto-detect later)
    els.weekSelect.value = "1";
  }

  function regularSeasonWeeksFromLeague(league) {
    // Sleeper has playoff_week_start (usually 15 for 14-week regular season)
    const pws = Number(league?.settings?.playoff_week_start ?? 0);
    if (pws && pws > 1) return pws - 1;

    // fallback: common formats
    return 14;
  }

  async function loadWeekMatchups(week, { bypassCache = false } = {}) {
    if (!week) return;
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
    // Group by matchup_id
    const groups = new Map();
    for (const m of (matchups || [])) {
      const id = m.matchup_id ?? "bye";
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(m);
    }

    // Sort matchup ids numeric if possible
    const matchupIds = Array.from(groups.keys()).sort((a, b) => {
      const na = Number(a), nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    });

    els.matchupsBody.innerHTML = "";

    for (const mid of matchupIds) {
      const pair = groups.get(mid) || [];
      // usually 2 entries; sometimes 1 (bye)
      const a = pair[0];
      const b = pair[1];

      const aName = rosterIdToTeam.get(a?.roster_id) || `Roster ${a?.roster_id ?? "?"}`;
      const bName = b ? (rosterIdToTeam.get(b.roster_id) || `Roster ${b.roster_id}`) : "BYE";

      // Sleeper provides "points" for the matchup row
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

  async function load({ bypassCache = false } = {}) {
    if (!leagueId) return showError("Missing leagueId config.");

    els.loadingRow.style.display = "flex";
    els.errorRow.style.display = "none";
    els.content.style.display = "none";

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
    leagueObj = league;

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
    els.leagueName.textContent = league?.name || "Sleeper Dashboard";
    const season = league?.season ?? cfg.season ?? "";
    const teams = league?.total_rosters ?? rosters?.length ?? "";
    els.leagueMeta.textContent = [
      season ? `Season: ${season}` : null,
      teams ? `Teams: ${teams}` : null,
      `Type: ${cfg.leagueType || "league"}`,
    ].filter(Boolean).join(" • ");

    els.openSleeper.href = `https://sleeper.com/leagues/${leagueId}`;

    // Standings
    const standings = buildStandings(rosters || []);
    renderStandings(standings);
    els.standingsNote.textContent = "Sorted by wins, ties, PF, then PA.";

    const now = new Date();
    els.lastUpdated.textContent = `${cached ? "cached" : "live"} • ${now.toLocaleString()}`;

    // Week selector
    const regWeeks = regularSeasonWeeksFromLeague(league);
    fillWeekSelect({ regularSeasonWeeks: regWeeks });

    showContent();

    // Load week 1 by default
    loadWeekMatchups(els.weekSelect.value);
  }

  els.refreshBtn.addEventListener("click", () => load({ bypassCache: true }));
  els.loadWeekBtn.addEventListener("click", () => loadWeekMatchups(els.weekSelect.value, { bypassCache: true }));
  els.weekSelect.addEventListener("change", () => loadWeekMatchups(els.weekSelect.value));

  load();
})();
