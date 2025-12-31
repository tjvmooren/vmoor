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
  };

  const API = "https://api.sleeper.app/v1";

  // Cache to avoid hammering Sleeper on refresh / page reload
  const CACHE_KEY = `vmoor_sleeper_${leagueId}`;
  const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

  els.apiInfo.textContent = `api: ${API}`;

  // Cloudflare Pages gives you a build ID sometimes; show something useful either way
  els.buildInfo.textContent = `build: ${new Date().toISOString().slice(0, 10)}`;

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
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return res.json();
  }

  function toPoints(settings, keyBase) {
    // Sleeper uses integer+decimal split fields like fpts + fpts_decimal
    // Some leagues/years may not include against; handle gracefully.
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
    return metaTeam && String(metaTeam).trim().length > 0 ? metaTeam : (user.display_name || user.username || "Team");
  }

  function buildStandings(rosters, usersById) {
    const rows = rosters.map(r => {
      const settings = r.settings || {};
      const wins = Number(settings.wins ?? 0);
      const losses = Number(settings.losses ?? 0);
      const ties = Number(settings.ties ?? 0);

      const pf = toPoints(settings, "fpts");
      const pa = toPoints(settings, "fpts_against"); // might be 0 if missing
      const diff = pf - pa;

      const user = usersById.get(r.owner_id);
      const team = teamNameFromUser(user);

      // Standings sort:
      // 1) wins desc
      // 2) ties desc (small)
      // 3) PF desc
      // 4) PA asc
      return {
        team,
        ownerId: r.owner_id,
        w: wins, l: losses, t: ties,
        pf, pa, diff,
      };
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

      const tdRank = document.createElement("td");
      tdRank.textContent = String(s.rank);
      tr.appendChild(tdRank);

      const tdTeam = document.createElement("td");
      tdTeam.textContent = s.team;
      tr.appendChild(tdTeam);

      const tdWLT = document.createElement("td");
      tdWLT.className = "num";
      tdWLT.textContent = `${s.w}-${s.l}-${s.t}`;
      tr.appendChild(tdWLT);

      const tdPF = document.createElement("td");
      tdPF.className = "num";
      tdPF.textContent = fmt(s.pf);
      tr.appendChild(tdPF);

      const tdPA = document.createElement("td");
      tdPA.className = "num";
      tdPA.textContent = fmt(s.pa);
      tr.appendChild(tdPA);

      const tdDiff = document.createElement("td");
      tdDiff.className = "num";
      tdDiff.textContent = (s.diff >= 0 ? "+" : "") + fmt(s.diff);
      tr.appendChild(tdDiff);

      els.standingsBody.appendChild(tr);
    }
  }

  function readCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.ts || (Date.now() - data.ts) > CACHE_TTL_MS) return null;
      return data.payload;
    } catch {
      return null;
    }
  }

  function writeCache(payload) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), payload }));
    } catch {
      // ignore
    }
  }

  async function load({ bypassCache = false } = {}) {
    if (!leagueId) {
      showError("Missing leagueId config.");
      return;
    }

    els.loadingRow.style.display = "flex";
    els.errorRow.style.display = "none";
    els.content.style.display = "none";

    if (!bypassCache) {
      const cached = readCache();
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
      writeCache(payload);
      hydrate(payload, { cached: false });
    } catch (e) {
      showError(`Failed to load Sleeper data: ${e?.message || e}`);
    }
  }

  function hydrate(payload, { cached }) {
    const { league, rosters, users } = payload;

    // Header
    const leagueTitle = league?.name ? league.name : "Sleeper Dashboard";
    els.leagueName.textContent = leagueTitle;

    const season = league?.season ?? cfg.season ?? "";
    const teams = league?.total_rosters ?? rosters?.length ?? "";
    const scoring = league?.scoring_settings ? "custom scoring" : "standard scoring";

    els.leagueMeta.textContent = [
      season ? `Season: ${season}` : null,
      teams ? `Teams: ${teams}` : null,
      `Type: ${cfg.leagueType || league?.settings?.type || "league"}`,
      `Scoring: ${scoring}`,
    ].filter(Boolean).join(" • ");

    // Link out
    // Sleeper web UI usually supports /league/{id}
    els.openSleeper.href = `https://sleeper.com/leagues/${leagueId}`;

    // Users map
    const usersById = new Map();
    for (const u of (users || [])) {
      if (u?.user_id) usersById.set(u.user_id, u);
    }

    // Standings
    const standings = buildStandings(rosters || [], usersById);
    renderStandings(standings);

    const now = new Date();
    els.lastUpdated.textContent = `${cached ? "cached" : "live"} • ${now.toLocaleString()}`;
    els.standingsNote.textContent = "Sorted by wins, ties, PF, then PA.";

    showContent();
  }

  // Wire up refresh
  els.refreshBtn.addEventListener("click", () => load({ bypassCache: true }));

  // Go
  load();
})();
