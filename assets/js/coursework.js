(() => {
  const DATA_URL = "../assets/data/coursework.json";
  const VIEWER_PAGE_URL = "./viewer.html";
  const imagePreviewFormats = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
  const textPreviewFormats = new Set(["txt", "md"]);
  const viewerFormats = new Set(["txt", "md", "docx"]);
  const videoPreviewFormats = new Set(["mp4"]);
  const officePreviewFormats = new Set(["pptx"]);
  const previewableFormats = new Set([
    "pdf",
    ...imagePreviewFormats,
    ...viewerFormats,
    ...videoPreviewFormats,
    ...officePreviewFormats,
  ]);

  const els = {
    buildBadge: document.getElementById("courseworkBuildBadge"),
    summary: document.getElementById("courseworkSummary"),
    status: document.getElementById("courseworkStatus"),
    search: document.getElementById("courseworkSearch"),
    semesterChips: document.getElementById("semesterChips"),
    domainChips: document.getElementById("domainChips"),
    modeChips: document.getElementById("modeChips"),
    catalog: document.getElementById("courseworkCatalog"),
    previewDialog: document.getElementById("courseworkPreview"),
    previewTitle: document.getElementById("courseworkPreviewTitle"),
    previewPath: document.getElementById("courseworkPreviewPath"),
    previewMeta: document.getElementById("courseworkPreviewMeta"),
    previewStatus: document.getElementById("courseworkPreviewStatus"),
    previewFrame: document.getElementById("courseworkPreviewFrame"),
    previewActions: document.getElementById("courseworkPreviewActions"),
    previewClose: document.querySelector("[data-preview-close]"),
  };

  const state = {
    search: "",
    semester: "all",
    domain: "all",
    mode: "all",
  };

  const itemIndex = new Map();
  let manifest = null;
  let previewToken = 0;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function setBadge(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove("good", "warn", "bad");
    if (kind) el.classList.add(kind);
  }

  function setStatus(text) {
    if (els.status) els.status.textContent = text;
  }

  function toTitleCase(value) {
    return String(value || "")
      .split(/[\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function normalize(value) {
    return String(value || "").toLowerCase().trim();
  }

  function matchesSearch(haystack, query) {
    if (!query) return true;
    return normalize(haystack).includes(query);
  }

  function formatTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "unknown";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  function getItemFormat(item) {
    return normalize(item?.format);
  }

  function canPreview(item) {
    return previewableFormats.has(getItemFormat(item));
  }

  function usesViewerPage(item) {
    return viewerFormats.has(getItemFormat(item));
  }

  function buildViewerUrl(item, embed = false) {
    const params = new URLSearchParams({ item: item.id });
    if (embed) params.set("embed", "1");
    return `${VIEWER_PAGE_URL}?${params.toString()}`;
  }

  function buildOpenHref(item) {
    return usesViewerPage(item) ? buildViewerUrl(item) : item.href;
  }

  function buildOpenLabel(item) {
    const format = getItemFormat(item);

    if (viewerFormats.has(format)) return "Open reader";
    if (format === "pdf") return "Open PDF";
    if (imagePreviewFormats.has(format) || videoPreviewFormats.has(format) || textPreviewFormats.has(format)) {
      return "Open in new tab";
    }

    return "Open file";
  }

  function buildDownloadLabel(item) {
    const formatLabel = item?.formatLabel || (item?.format ? String(item.format).toUpperCase() : "file");
    return `Download ${formatLabel}`;
  }

  function buildLinkButton(href, label, className, options = {}) {
    const attrs = options.download ? " download" : ' target="_blank" rel="noopener"';
    return `
      <a class="${escapeHtml(className)}" href="${escapeHtml(href)}"${attrs}>
        ${escapeHtml(label)}
      </a>
    `;
  }

  function buildChips(container, options, activeValue, onSelect) {
    if (!container) return;

    container.innerHTML = options
      .map((option) => {
        const active = option.value === activeValue;
        return `
          <button
            class="chip${active ? " is-active" : ""}"
            type="button"
            data-filter-value="${escapeHtml(option.value)}"
          >
            ${escapeHtml(option.label)}
          </button>
        `;
      })
      .join("");

    container.querySelectorAll("[data-filter-value]").forEach((button) => {
      button.addEventListener("click", () => {
        onSelect(button.getAttribute("data-filter-value") || "all");
      });
    });
  }

  function buildSummaryCards(stats) {
    if (!els.summary) return;

    els.summary.innerHTML = `
      <article class="stat-card">
        <div class="eyebrow">Semesters</div>
        <strong>${stats.semesterCount}</strong>
        <p>Academic terms currently represented in the archive.</p>
      </article>

      <article class="stat-card">
        <div class="eyebrow">Courses</div>
        <strong>${stats.courseCount}</strong>
        <p>Course pages carrying public documents, visuals, or linked code projects.</p>
      </article>

      <article class="stat-card">
        <div class="eyebrow">Published Items</div>
        <strong>${stats.itemCount}</strong>
        <p>Documents and media copied into the site for direct public access.</p>
      </article>

      <article class="stat-card">
        <div class="eyebrow">Code Projects</div>
        <strong>${stats.projectCount}</strong>
        <p>Code collections cataloged separately so they can link out to GitHub.</p>
      </article>

      <article class="stat-card">
        <div class="eyebrow">Published Files</div>
        <strong>${stats.publishedFileCount}</strong>
        <p>Safe files copied from the raw coursework tree into the deployed site.</p>
      </article>

      <article class="stat-card">
        <div class="eyebrow">Excluded</div>
        <strong>${stats.excludedFileCount}</strong>
        <p>Instructor materials, secrets, bulk lab noise, and other non-public artifacts filtered out.</p>
      </article>
    `;
  }

  function renderItem(item) {
    const previewButton = canPreview(item)
      ? `
          <button class="btn btn-small btn-secondary" type="button" data-preview-item="${escapeHtml(item.id)}">
            Preview
          </button>
        `
      : "";

    const secondaryLinks = Array.isArray(item.secondaryLinks)
      ? item.secondaryLinks
          .map((link) =>
            buildLinkButton(link.href, link.label || "Open alternate file", "btn btn-small btn-ghost")
          )
          .join("")
      : "";

    const tagMarkup = Array.isArray(item.tags)
      ? item.tags.slice(0, 2).map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`).join("")
      : "";

    return `
      <article class="resource-card archive-entry archive-entry--${escapeHtml(item.family || "document")}">
        <div class="resource-card__meta">
          <span class="badge good">${escapeHtml(item.kindLabel || toTitleCase(item.kind || "document"))}</span>
          <span class="badge">${escapeHtml(item.formatLabel || item.format || "file")}</span>
          ${tagMarkup}
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        ${item.contextLabel ? `<p class="small mono">${escapeHtml(item.contextLabel)}</p>` : ""}
        ${item.sourceRelativePath ? `<p>${escapeHtml(item.sourceRelativePath)}</p>` : ""}
        <div class="row archive-entry__actions">
          ${previewButton}
          ${buildLinkButton(buildOpenHref(item), buildOpenLabel(item), "btn btn-small")}
          ${buildLinkButton(item.href, buildDownloadLabel(item), "btn btn-small btn-ghost", { download: true })}
          ${secondaryLinks}
        </div>
      </article>
    `;
  }

  function renderProject(project) {
    const stackMarkup = Array.isArray(project.stack)
      ? project.stack.slice(0, 4).map((value) => `<span class="badge">${escapeHtml(value)}</span>`).join("")
      : "";

    const languageMarkup = Array.isArray(project.languages)
      ? project.languages.slice(0, 4).map((value) => `<span class="badge">${escapeHtml(value)}</span>`).join("")
      : "";

    const actionMarkup = project.githubUrl
      ? buildLinkButton(project.githubUrl, project.githubLabel || "Open GitHub", "btn btn-small")
      : `<span class="badge warn">GitHub link pending</span>`;

    return `
      <article class="resource-card archive-entry archive-entry--project">
        <div class="resource-card__meta">
          <span class="badge good">Code project</span>
          ${stackMarkup}
          ${languageMarkup}
        </div>
        <h3>${escapeHtml(project.title)}</h3>
        <p>${escapeHtml(project.summary || "Code project discovered in the coursework archive.")}</p>
        <p class="small mono">${escapeHtml(project.relPath || "")}</p>
        <div class="row">
          ${actionMarkup}
        </div>
      </article>
    `;
  }

  function renderCourse(course, forceOpen) {
    const documents = course.items.filter((item) => item.family !== "visual");
    const visuals = course.items.filter((item) => item.family === "visual");

    const documentsMarkup = documents.length
      ? `
          <section class="stack">
            <div class="archive-section-heading">
              <h3>Documents and downloads</h3>
              <span class="badge">${documents.length} items</span>
            </div>
            <div class="card-grid archive-grid">
              ${documents.map(renderItem).join("")}
            </div>
          </section>
        `
      : "";

    const visualsMarkup = visuals.length
      ? `
          <section class="stack">
            <div class="archive-section-heading">
              <h3>Visuals and screenshots</h3>
              <span class="badge">${visuals.length} items</span>
            </div>
            <div class="card-grid archive-grid">
              ${visuals.map(renderItem).join("")}
            </div>
          </section>
        `
      : "";

    const projectsMarkup = course.projects.length
      ? `
          <section class="stack">
            <div class="archive-section-heading">
              <h3>Code projects</h3>
              <span class="badge">${course.projects.length} entries</span>
            </div>
            <div class="card-grid archive-grid">
              ${course.projects.map(renderProject).join("")}
            </div>
          </section>
        `
      : "";

    return `
      <details class="course-details"${forceOpen ? " open" : ""}>
        <summary class="course-details__summary">
          <div class="stack">
            <div class="eyebrow">${escapeHtml(course.domainLabel || "course")}</div>
            <h3>${escapeHtml(course.label)}</h3>
          </div>
          <div class="course-details__meta">
            <span class="badge">${course.items.length} published</span>
            <span class="badge">${course.projects.length} code projects</span>
          </div>
        </summary>

        <div class="course-details__body stack">
          ${documentsMarkup}
          ${visualsMarkup}
          ${projectsMarkup}
        </div>
      </details>
    `;
  }

  function renderCatalog(filtered) {
    if (!els.catalog) return;

    if (!filtered.semesters.length) {
      els.catalog.innerHTML = `
        <article class="resource-card">
          <div class="resource-card__meta">
            <span class="badge warn">No matches</span>
          </div>
          <h3>No coursework matched the current filters.</h3>
          <p>Try clearing search text or switching the semester, track, or view filters.</p>
        </article>
      `;
      return;
    }

    els.catalog.innerHTML = filtered.semesters
      .map((semester) => {
        const forceOpen = Boolean(state.search || state.semester !== "all" || state.domain !== "all" || state.mode !== "all");
        return `
          <section class="panel stack archive-semester">
            <div class="section-heading">
              <div class="stack">
                <div class="eyebrow">Semester</div>
                <h2>${escapeHtml(semester.label)}</h2>
              </div>
              <div class="row">
                <span class="badge">${semester.courses.length} courses</span>
                <span class="badge">${semester.items.length} published items</span>
                <span class="badge">${semester.projects.length} code projects</span>
              </div>
            </div>

            <div class="collection">
              ${semester.courses.map((course) => renderCourse(course, forceOpen)).join("")}
            </div>
          </section>
        `;
      })
      .join("");
  }

  function buildAggregateStats(semesters) {
    const courses = semesters.flatMap((semester) => semester.courses);
    const items = courses.flatMap((course) => course.items);
    const projects = courses.flatMap((course) => course.projects);

    return {
      semesterCount: semesters.length,
      courseCount: courses.length,
      itemCount: items.length,
      projectCount: projects.length,
      publishedFileCount: items.reduce((count, item) => count + 1 + (item.secondaryLinks?.length || 0), 0),
      excludedFileCount: manifest?.stats?.excludedFileCount || 0,
    };
  }

  function filterManifest() {
    const query = normalize(state.search);

    const semesters = manifest.semesters
      .map((semester) => {
        if (state.semester !== "all" && semester.key !== state.semester) {
          return null;
        }

        const courses = semester.courses
          .map((course) => {
            if (state.domain !== "all" && course.domain !== state.domain) {
              return null;
            }

            const courseSearchHit = matchesSearch(course.searchText, query);

            let items = course.items;
            let projects = course.projects;

            if (state.mode === "documents") {
              projects = [];
            } else if (state.mode === "projects") {
              items = [];
            }

            if (query) {
              const matchingItems = items.filter((item) => matchesSearch(item.searchText, query));
              const matchingProjects = projects.filter((project) => matchesSearch(project.searchText, query));

              if (!courseSearchHit && !matchingItems.length && !matchingProjects.length) {
                return null;
              }

              if (!courseSearchHit) {
                items = matchingItems;
                projects = matchingProjects;
              }
            }

            if (!items.length && !projects.length) {
              return null;
            }

            return {
              ...course,
              items,
              projects,
            };
          })
          .filter(Boolean);

        if (!courses.length) {
          return null;
        }

        return {
          ...semester,
          courses,
          items: courses.flatMap((course) => course.items),
          projects: courses.flatMap((course) => course.projects),
        };
      })
      .filter(Boolean);

    return {
      semesters,
      stats: buildAggregateStats(semesters),
    };
  }

  function buildItemIndex() {
    itemIndex.clear();

    if (!manifest) return;

    manifest.semesters.forEach((semester) => {
      semester.courses.forEach((course) => {
        course.items.forEach((item) => {
          itemIndex.set(item.id, item);
        });
      });
    });
  }

  function render() {
    if (!manifest) return;

    const filtered = filterManifest();

    buildSummaryCards(filtered.stats);
    renderCatalog(filtered);

    const generated = formatTimestamp(manifest.generatedAt);
    setStatus(`${filtered.stats.courseCount} courses | ${filtered.stats.itemCount} items | updated ${generated}`);

    setBadge(
      els.buildBadge,
      `${manifest.stats.publishedFileCount} files copied | ${manifest.stats.excludedFileCount} excluded`,
      "good"
    );
  }

  function initializeFilters() {
    if (!manifest) return;

    const semesterOptions = [
      { value: "all", label: "All semesters" },
      ...manifest.semesters.map((semester) => ({
        value: semester.key,
        label: semester.label,
      })),
    ];

    const domainMap = new Map();
    manifest.semesters.forEach((semester) => {
      semester.courses.forEach((course) => {
        if (!domainMap.has(course.domain)) {
          domainMap.set(course.domain, course.domainLabel);
        }
      });
    });

    const domainOptions = [
      { value: "all", label: "All tracks" },
      ...Array.from(domainMap.entries()).map(([value, label]) => ({ value, label })),
    ];

    const modeOptions = [
      { value: "all", label: "Everything" },
      { value: "documents", label: "Documents only" },
      { value: "projects", label: "Code projects only" },
    ];

    buildChips(els.semesterChips, semesterOptions, state.semester, (value) => {
      state.semester = value;
      initializeFilters();
      render();
    });

    buildChips(els.domainChips, domainOptions, state.domain, (value) => {
      state.domain = value;
      initializeFilters();
      render();
    });

    buildChips(els.modeChips, modeOptions, state.mode, (value) => {
      state.mode = value;
      initializeFilters();
      render();
    });
  }

  function getFileUrl(itemOrHref) {
    const href = typeof itemOrHref === "string" ? itemOrHref : itemOrHref?.href;
    return new URL(href, window.location.href).href;
  }

  function isLocalDevelopmentHost() {
    return /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  }

  function buildOfficePreviewUrl(item) {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(getFileUrl(item))}`;
  }

  function setPreviewShell(item) {
    if (els.previewTitle) els.previewTitle.textContent = item.title;
    if (els.previewPath) els.previewPath.textContent = item.sourceRelativePath || item.href;

    if (els.previewMeta) {
      const badges = [
        `<span class="badge good">${escapeHtml(item.kindLabel || "Document")}</span>`,
        `<span class="badge">${escapeHtml(item.formatLabel || item.format || "file")}</span>`,
      ];

      if (item.contextLabel) {
        badges.push(`<span class="badge">${escapeHtml(item.contextLabel)}</span>`);
      }

      els.previewMeta.innerHTML = badges.join("");
    }

    if (els.previewActions) {
      const secondaryActions = Array.isArray(item.secondaryLinks)
        ? item.secondaryLinks
            .map((link) => buildLinkButton(link.href, link.label || "Open alternate file", "btn btn-small btn-ghost"))
            .join("")
        : "";

      els.previewActions.innerHTML = `
        ${buildLinkButton(buildOpenHref(item), buildOpenLabel(item), "btn btn-small")}
        ${buildLinkButton(item.href, buildDownloadLabel(item), "btn btn-small btn-ghost", { download: true })}
        ${secondaryActions}
      `;
    }

    if (els.previewStatus) {
      els.previewStatus.textContent = "Loading preview content.";
    }

    if (els.previewFrame) {
      els.previewFrame.innerHTML = `
        <article class="resource-card archive-preview__placeholder">
          <div class="resource-card__meta">
            <span class="badge warn">Loading</span>
          </div>
          <h3>Preparing preview.</h3>
          <p>The file preview will appear here when it is ready.</p>
        </article>
      `;
    }
  }

  function setPreviewContent(markup, statusText) {
    if (els.previewFrame) {
      els.previewFrame.innerHTML = markup;
    }

    if (els.previewStatus) {
      els.previewStatus.textContent = statusText;
    }
  }

  function resetPreview() {
    if (els.previewTitle) els.previewTitle.textContent = "Preparing preview";
    if (els.previewPath) els.previewPath.textContent = "";
    if (els.previewMeta) els.previewMeta.innerHTML = "";
    if (els.previewActions) els.previewActions.innerHTML = "";
    if (els.previewStatus) els.previewStatus.textContent = "Loading preview content.";
    if (els.previewFrame) els.previewFrame.innerHTML = "";
  }

  async function buildPreviewPayload(item) {
    const format = getItemFormat(item);
    const src = getFileUrl(item);

    if (usesViewerPage(item)) {
      return {
        status: "Previewing document in the archive reader.",
        markup: `<iframe class="archive-preview__frame" src="${escapeHtml(buildViewerUrl(item, true))}" title="${escapeHtml(item.title)}"></iframe>`,
      };
    }

    if (format === "pdf") {
      return {
        status: "Previewing PDF in the archive.",
        markup: `<iframe class="archive-preview__frame" src="${escapeHtml(src)}#toolbar=0&navpanes=0&view=FitH" title="${escapeHtml(item.title)}"></iframe>`,
      };
    }

    if (imagePreviewFormats.has(format)) {
      return {
        status: "Previewing image in the archive.",
        markup: `<img class="archive-preview__image" src="${escapeHtml(src)}" alt="${escapeHtml(item.title)}" />`,
      };
    }

    if (videoPreviewFormats.has(format)) {
      return {
        status: "Previewing video in the archive.",
        markup: `<video class="archive-preview__video" src="${escapeHtml(src)}" controls preload="metadata"></video>`,
      };
    }

    if (officePreviewFormats.has(format)) {
      if (isLocalDevelopmentHost()) {
        return {
          status: "Office previews work best on the deployed site.",
          markup: `
            <article class="resource-card archive-preview__placeholder">
              <div class="resource-card__meta">
                <span class="badge warn">Preview limited locally</span>
              </div>
              <h3>Office preview needs a public URL.</h3>
              <p>
                This file can be previewed on the deployed site, but the Office viewer cannot read local development
                URLs. Use the Open or Download actions for local testing.
              </p>
            </article>
          `,
        };
      }

      return {
        status: "Previewing Office document in an embedded viewer.",
        markup: `
          <iframe
            class="archive-preview__frame"
            src="${escapeHtml(buildOfficePreviewUrl(item))}"
            title="${escapeHtml(item.title)}"
            loading="lazy"
            referrerpolicy="no-referrer"
          ></iframe>
        `,
      };
    }

    return {
      status: "This format does not have an inline preview yet.",
      markup: `
        <article class="resource-card archive-preview__placeholder">
          <div class="resource-card__meta">
            <span class="badge warn">Preview unavailable</span>
          </div>
          <h3>No inline preview yet for this file.</h3>
          <p>Use the Open or Download actions above to access the original file directly.</p>
        </article>
      `,
    };
  }

  async function openPreview(itemId) {
    const item = itemIndex.get(itemId);
    if (!item || !els.previewDialog) return;

    previewToken += 1;
    const token = previewToken;

    setPreviewShell(item);

    if (!els.previewDialog.open) {
      els.previewDialog.showModal();
    }

    try {
      const preview = await buildPreviewPayload(item);
      if (token !== previewToken) return;
      setPreviewContent(preview.markup, preview.status);
    } catch (error) {
      console.error(error);
      if (token !== previewToken) return;

      setPreviewContent(
        `
          <article class="resource-card archive-preview__placeholder">
            <div class="resource-card__meta">
              <span class="badge bad">Preview failed</span>
            </div>
            <h3>The file preview could not be loaded.</h3>
            <p>Use the Open or Download actions above if you still want the original file.</p>
          </article>
        `,
        "Preview unavailable right now."
      );
    }
  }

  function closePreview() {
    if (!els.previewDialog?.open) return;
    els.previewDialog.close();
  }

  async function loadManifest() {
    try {
      const response = await fetch(DATA_URL, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Unable to load manifest (${response.status})`);
      }

      manifest = await response.json();
      buildItemIndex();
      buildSummaryCards(manifest.stats);
      initializeFilters();
      render();
    } catch (error) {
      console.error(error);
      setBadge(els.buildBadge, "Archive unavailable", "bad");
      setStatus("Manifest unavailable");
      if (els.catalog) {
        els.catalog.innerHTML = `
          <article class="resource-card">
            <div class="resource-card__meta">
              <span class="badge bad">Load failed</span>
            </div>
            <h3>The coursework manifest could not be loaded.</h3>
            <p>Make sure the archive generator has been run and the JSON output is present in <code>assets/data/coursework.json</code>.</p>
          </article>
        `;
      }
    }
  }

  els.search?.addEventListener("input", (event) => {
    state.search = event.target.value || "";
    render();
  });

  els.catalog?.addEventListener("click", (event) => {
    const previewButton = event.target.closest("[data-preview-item]");
    if (!previewButton) return;

    event.preventDefault();
    openPreview(previewButton.getAttribute("data-preview-item") || "");
  });

  els.previewClose?.addEventListener("click", closePreview);

  els.previewDialog?.addEventListener("click", (event) => {
    if (event.target === els.previewDialog) {
      closePreview();
    }
  });

  els.previewDialog?.addEventListener("close", () => {
    previewToken += 1;
    resetPreview();
  });

  document.addEventListener("DOMContentLoaded", () => {
    loadManifest();
  });
})();
