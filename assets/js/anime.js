const ANILIST = "https://graphql.anilist.co";

const el = (sel) => document.querySelector(sel);
const statusLine = el("#statusLine");

const rowTrending = el("#rowTrending");
const rowSeason = el("#rowSeason");
const rowTop = el("#rowTop");

const searchSection = el("#searchSection");
const homeSections = el("#homeSections");
const searchGrid = el("#searchGrid");
const searchTitle = el("#searchTitle");
const pageLabel = el("#pageLabel");
const prevPage = el("#prevPage");
const nextPage = el("#nextPage");

const modal = el("#animeModal");
const modalBody = el("#modalBody");
const modalClose = el("#modalClose");

let currentSearch = "";
let currentPage = 1;
let lastPage = 1;

function setStatus(msg) {
  statusLine.textContent = msg || "";
}

function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function pickTitle(t) {
  return t?.english || t?.romaji || t?.native || "Untitled";
}

function cardHTML(m) {
  const title = pickTitle(m.title);
  const year = m.seasonYear || m.startDate?.year || "";
  const score = m.averageScore ? `${m.averageScore}%` : "—";
  const format = m.format || m.type || "";
  return `
    <article class="card" data-id="${m.id}">
      <img class="poster" src="${m.coverImage?.large || ""}" alt="${title}" loading="lazy" />
      <div class="card-body">
        <h3 class="title" title="${title}">${title}</h3>
        <div class="sub">
          <span>${format}</span>
          <span>${year}</span>
          <span>★ ${score}</span>
        </div>
      </div>
    </article>
  `;
}

async function gql(query, variables) {
  const res = await fetch(ANILIST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({ query, variables })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AniList HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || "AniList GraphQL error");
  }
  return json.data;
}

const LIST_QUERY = `
query($page:Int,$perPage:Int,$sort:[MediaSort],$season:MediaSeason,$seasonYear:Int){
  Page(page:$page, perPage:$perPage){
    pageInfo{ total currentPage lastPage hasNextPage }
    media(type:ANIME, sort:$sort, season:$season, seasonYear:$seasonYear, isAdult:false){
      id
      siteUrl
      title{ romaji english native }
      format
      seasonYear
      averageScore
      coverImage{ large color }
      description(asHtml:false)
    }
  }
}
`;

const SEARCH_QUERY = `
query($page:Int,$perPage:Int,$search:String){
  Page(page:$page, perPage:$perPage){
    pageInfo{ total currentPage lastPage hasNextPage }
    media(type:ANIME, search:$search, sort:POPULARITY_DESC, isAdult:false){
      id
      siteUrl
      title{ romaji english native }
      format
      seasonYear
      averageScore
      coverImage{ large color }
      description(asHtml:false)
    }
  }
}
`;

const DETAIL_QUERY = `
query($id:Int){
  Media(id:$id, type:ANIME){
    id
    siteUrl
    title{ romaji english native }
    format
    episodes
    duration
    status
    season
    seasonYear
    averageScore
    meanScore
    popularity
    genres
    coverImage{ extraLarge large color }
    bannerImage
    description(asHtml:false)
    studios(isMain:true){ nodes{ name siteUrl } }
  }
}
`;

function currentSeasonAndYear() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-11
  // AniList seasons: WINTER, SPRING, SUMMER, FALL
  const season =
    (m <= 2) ? "WINTER" :
    (m <= 5) ? "SPRING" :
    (m <= 8) ? "SUMMER" : "FALL";
  return { season, seasonYear: y };
}

async function loadHome() {
  setStatus("Loading anime lists…");

  const { season, seasonYear } = currentSeasonAndYear();

  const [trending, seasonal, top] = await Promise.all([
    gql(LIST_QUERY, { page: 1, perPage: 16, sort: ["TRENDING_DESC"] }),
    gql(LIST_QUERY, { page: 1, perPage: 16, sort: ["POPULARITY_DESC"], season, seasonYear }),
    gql(LIST_QUERY, { page: 1, perPage: 16, sort: ["SCORE_DESC"] })
  ]);

  rowTrending.innerHTML = trending.Page.media.map(cardHTML).join("");
  rowSeason.innerHTML = seasonal.Page.media.map(cardHTML).join("");
  rowTop.innerHTML = top.Page.media.map(cardHTML).join("");

  // Spotlight: first trending item
  renderSpotlight(trending.Page.media[0]);

  setStatus("");
}

function renderSpotlight(m) {
  const card = document.querySelector("#spotlightCard");
  if (!m) return;

  const title = pickTitle(m.title);
  const desc = stripHtml(m.description).slice(0, 220);

  card.innerHTML = `
    <div style="display:grid;grid-template-columns:110px 1fr;gap:12px;padding:14px;">
      <img src="${m.coverImage?.large || ""}" alt="${title}" style="width:110px;border-radius:12px;aspect-ratio:2/3;object-fit:cover;">
      <div>
        <div style="font-size:12px;opacity:.75;margin-bottom:6px;">Spotlight</div>
        <div style="font-size:16px;font-weight:700;line-height:1.2;margin-bottom:6px;">${title}</div>
        <div style="font-size:13px;opacity:.78;line-height:1.35;">${desc || " "}</div>
        <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">
          <a href="${m.siteUrl}" target="_blank" rel="noreferrer"
             style="border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);padding:8px 10px;border-radius:10px;color:inherit;text-decoration:none;">
            View on AniList
          </a>
          <button class="chip" data-open="${m.id}">Details</button>
        </div>
      </div>
    </div>
  `;
}

async function runSearch(q, page = 1) {
  currentSearch = q.trim();
  currentPage = page;

  if (!currentSearch) return;

  setStatus(`Searching “${currentSearch}”…`);

  const data = await gql(SEARCH_QUERY, { page, perPage: 24, search: currentSearch });
  const media = data.Page.media;

  // switch UI
  homeSections.classList.add("hidden");
  searchSection.classList.remove("hidden");

  searchTitle.textContent = `Search results for “${currentSearch}”`;
  searchGrid.innerHTML = media.map(cardHTML).join("");

  lastPage = data.Page.pageInfo.lastPage;
  pageLabel.textContent = `${currentPage} / ${lastPage}`;

  prevPage.disabled = currentPage <= 1;
  nextPage.disabled = currentPage >= lastPage;

  setStatus("");
}

async function openDetails(id) {
  setStatus("Loading details…");
  const data = await gql(DETAIL_QUERY, { id: Number(id) });
  const m = data.Media;

  const title = pickTitle(m.title);
  const desc = stripHtml(m.description);
  const studios = (m.studios?.nodes || []).map(s => s.name).join(", ");

  modalBody.innerHTML = `
    <div style="display:grid;grid-template-columns:220px 1fr;gap:16px;">
      <img src="${m.coverImage?.extraLarge || m.coverImage?.large || ""}" alt="${title}"
           style="width:220px;border-radius:14px;aspect-ratio:2/3;object-fit:cover;">
      <div>
        <h2 style="margin:0 0 8px;font-size:22px;line-height:1.15;">${title}</h2>
        <div style="opacity:.78;font-size:13px;margin-bottom:10px;display:flex;gap:10px;flex-wrap:wrap;">
          <span>${m.format || ""}</span>
          <span>${m.season || ""} ${m.seasonYear || ""}</span>
          <span>Episodes: ${m.episodes ?? "—"}</span>
          <span>Score: ${m.averageScore ? m.averageScore + "%" : "—"}</span>
          <span>Status: ${m.status || ""}</span>
        </div>

        <p style="margin:0 0 10px;opacity:.86;line-height:1.45;">${desc || ""}</p>

        <div style="opacity:.75;font-size:13px;line-height:1.4;">
          <div><strong>Genres:</strong> ${(m.genres || []).join(", ")}</div>
          ${studios ? `<div><strong>Studio:</strong> ${studios}</div>` : ""}
        </div>

        <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;">
          <a href="${m.siteUrl}" target="_blank" rel="noreferrer"
             style="border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);padding:8px 10px;border-radius:10px;color:inherit;text-decoration:none;">
            Open on AniList
          </a>
        </div>
      </div>
    </div>
  `;

  setStatus("");
  modal.showModal();
}

function resetToHome() {
  currentSearch = "";
  currentPage = 1;
  searchSection.classList.add("hidden");
  homeSections.classList.remove("hidden");
  el("#searchInput").value = "";
  setStatus("");
}

document.addEventListener("click", async (e) => {
  const card = e.target.closest(".card");
  if (card) {
    e.preventDefault();
    await openDetails(card.dataset.id);
    return;
  }

  const openBtn = e.target.closest("[data-open]");
  if (openBtn) {
    e.preventDefault();
    await openDetails(openBtn.dataset.open);
    return;
  }

  const chip = e.target.closest(".chip[data-quick]");
  if (chip) {
    e.preventDefault();
    resetToHome();
    setStatus("Refreshing…");
    const sort = chip.dataset.quick;
    const data = await gql(LIST_QUERY, { page: 1, perPage: 16, sort: [sort] });
    rowTrending.innerHTML = data.Page.media.map(cardHTML).join("");
    renderSpotlight(data.Page.media[0]);
    setStatus("");
    return;
  }

  const refresh = e.target.closest("[data-more='trending']");
  if (refresh) {
    e.preventDefault();
    setStatus("Refreshing trending…");
    const data = await gql(LIST_QUERY, { page: 1, perPage: 16, sort: ["TRENDING_DESC"] });
    rowTrending.innerHTML = data.Page.media.map(cardHTML).join("");
    renderSpotlight(data.Page.media[0]);
    setStatus("");
  }
});

el("#searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  runSearch(el("#searchInput").value, 1).catch(err => setStatus(err.message));
});

prevPage.addEventListener("click", () => runSearch(currentSearch, Math.max(1, currentPage - 1)));
nextPage.addEventListener("click", () => runSearch(currentSearch, Math.min(lastPage, currentPage + 1)));

modalClose.addEventListener("click", () => modal.close());
modal.addEventListener("click", (e) => {
  const rect = modal.getBoundingClientRect();
  const inDialog = (
    rect.top <= e.clientY && e.clientY <= rect.bottom &&
    rect.left <= e.clientX && e.clientX <= rect.right
  );
  if (!inDialog) modal.close();
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !searchSection.classList.contains("hidden")) resetToHome();
});

loadHome().catch(err => setStatus(err.message));
