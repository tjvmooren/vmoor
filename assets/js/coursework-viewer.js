(() => {
  const DATA_URL = "../assets/data/coursework.json";
  const imageFormats = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
  const textFormats = new Set(["txt", "md"]);
  const officeFormats = new Set(["docx"]);
  const videoFormats = new Set(["mp4"]);

  const els = {
    title: document.getElementById("viewerTitle"),
    path: document.getElementById("viewerPath"),
    meta: document.getElementById("viewerMeta"),
    status: document.getElementById("viewerStatus"),
    actions: document.getElementById("viewerActions"),
    content: document.getElementById("viewerContent"),
  };

  const params = new URLSearchParams(window.location.search);
  const itemId = params.get("item") || "";
  const embed = params.get("embed") === "1";

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function normalize(value) {
    return String(value || "").toLowerCase().trim();
  }

  function getFormat(item) {
    return normalize(item?.format);
  }

  function getFileUrl(item) {
    return new URL(item.href, window.location.href).href;
  }

  function buildLinkButton(href, label, className, options = {}) {
    const attrs = options.download ? " download" : ' target="_blank" rel="noopener"';
    return `<a class="${escapeHtml(className)}" href="${escapeHtml(href)}"${attrs}>${escapeHtml(label)}</a>`;
  }

  function buildOpenLabel(item) {
    const format = getFormat(item);
    if (officeFormats.has(format) || textFormats.has(format)) return "Open raw file";
    if (format === "pdf") return "Open PDF";
    return "Open file";
  }

  function buildDownloadLabel(item) {
    const label = item?.formatLabel || (item?.format ? String(item.format).toUpperCase() : "file");
    return `Download ${label}`;
  }

  function setShell(item) {
    if (els.title) els.title.textContent = item.title;
    if (els.path) els.path.textContent = item.sourceRelativePath || item.href;

    if (!embed) {
      document.title = `${item.title} | Coursework Reader | vmoor`;
    }

    if (els.meta) {
      const bits = [
        `<span class="badge good">${escapeHtml(item.kindLabel || "Document")}</span>`,
        `<span class="badge">${escapeHtml(item.formatLabel || item.format || "file")}</span>`,
      ];

      if (item.contextLabel) {
        bits.push(`<span class="badge">${escapeHtml(item.contextLabel)}</span>`);
      }

      els.meta.innerHTML = bits.join("");
    }

    if (els.actions) {
      els.actions.innerHTML = `
        ${buildLinkButton(item.href, buildOpenLabel(item), "btn btn-small")}
        ${buildLinkButton(item.href, buildDownloadLabel(item), "btn btn-small btn-ghost", { download: true })}
      `;
    }
  }

  function setStatus(message) {
    if (els.status) els.status.textContent = message;
  }

  function setContent(markup) {
    if (els.content) els.content.innerHTML = markup;
  }

  function setError(title, message) {
    setStatus("Document reader unavailable.");
    setContent(`
      <article class="resource-card reader-placeholder">
        <div class="resource-card__meta">
          <span class="badge bad">Reader failed</span>
        </div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
      </article>
    `);
  }

  async function findItem() {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Unable to load coursework manifest (${response.status})`);
    }

    const manifest = await response.json();

    for (const semester of manifest.semesters) {
      for (const course of semester.courses) {
        const item = course.items.find((entry) => entry.id === itemId);
        if (item) return item;
      }
    }

    return null;
  }

  async function renderText(item) {
    const response = await fetch(getFileUrl(item), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Unable to load text file (${response.status})`);
    }

    const text = await response.text();
    setStatus("Reading the text file directly in the browser.");
    setContent(`
      <article class="reader-document">
        <pre class="reader-text">${escapeHtml(text)}</pre>
      </article>
    `);
  }

  async function renderDocx(item) {
    if (!window.mammoth) {
      throw new Error("The DOCX reader library did not load.");
    }

    const response = await fetch(getFileUrl(item), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Unable to load DOCX file (${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const result = await window.mammoth.convertToHtml({ arrayBuffer });

    setStatus("Reading the Word document in the browser.");
    setContent(`
      <article class="reader-document reader-prose">
        ${result.value || "<p>No readable content was extracted from this document.</p>"}
      </article>
    `);
  }

  function renderImage(item) {
    setStatus("Previewing image in the reader.");
    setContent(`
      <figure class="reader-document reader-figure">
        <img class="reader-image" src="${escapeHtml(getFileUrl(item))}" alt="${escapeHtml(item.title)}" />
      </figure>
    `);
  }

  function renderPdf(item) {
    setStatus("Previewing PDF in the reader.");
    setContent(`
      <iframe
        class="reader-frame"
        src="${escapeHtml(getFileUrl(item))}#toolbar=0&navpanes=0&view=FitH"
        title="${escapeHtml(item.title)}"
      ></iframe>
    `);
  }

  function renderVideo(item) {
    setStatus("Previewing video in the reader.");
    setContent(`
      <video class="reader-video" src="${escapeHtml(getFileUrl(item))}" controls preload="metadata"></video>
    `);
  }

  async function renderItem(item) {
    const format = getFormat(item);

    if (textFormats.has(format)) {
      await renderText(item);
      return;
    }

    if (officeFormats.has(format)) {
      await renderDocx(item);
      return;
    }

    if (format === "pdf") {
      renderPdf(item);
      return;
    }

    if (imageFormats.has(format)) {
      renderImage(item);
      return;
    }

    if (videoFormats.has(format)) {
      renderVideo(item);
      return;
    }

    setStatus("No browser-native reader is configured for this file type yet.");
    setContent(`
      <article class="resource-card reader-placeholder">
        <div class="resource-card__meta">
          <span class="badge warn">Reader unavailable</span>
        </div>
        <h2>No inline reader for this format yet.</h2>
        <p>Use the raw-file or download actions above to access the original document.</p>
      </article>
    `);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (embed) {
      document.body.classList.add("is-embedded-reader");
      document.querySelectorAll("[data-embed-hidden]").forEach((el) => el.remove());
    }

    if (!itemId) {
      setError("Missing document", "The reader page was opened without a coursework item reference.");
      return;
    }

    try {
      const item = await findItem();

      if (!item) {
        setError("Document not found", "The selected coursework item could not be found in the manifest.");
        return;
      }

      setShell(item);
      await renderItem(item);
    } catch (error) {
      console.error(error);
      setError("Reader failed", error instanceof Error ? error.message : "Unknown reader error.");
    }
  });
})();
