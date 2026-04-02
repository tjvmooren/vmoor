(() => {
  const page = document.body?.dataset?.page || "home";
  const root = document.body?.dataset?.root || ".";

  function rel(target) {
    return `${root}/${target}`;
  }

  const navItems = [
    { key: "home", href: rel("index.html"), label: "Overview" },
    { key: "labs", href: rel("labs/index.html"), label: "Cyber Labs" },
    { key: "sleeper", href: rel("sleeper/index.html"), label: "Sleeper" },
    { key: "streams", href: rel("streams/index.html"), label: "Streams" },
    {
      key: "github",
      href: "https://github.com/tjvmooren?tab=repositories",
      label: "GitHub",
      external: true,
    },
  ];

  function renderNavLink(item) {
    const classes = ["site-nav__link"];
    if (item.key === page) classes.push("is-active");

    const target = item.external ? ' target="_blank" rel="noopener"' : "";
    return `<a class="${classes.join(" ")}" href="${item.href}"${target}>${item.label}</a>`;
  }

  const headerMarkup = `
    <header class="site-header">
      <div class="wrap site-header__inner">
        <a class="brand-lockup" href="${rel("index.html")}">
          <span class="brand-title">vmoor.com</span>
          <span class="brand-subtitle mono">Cybersecurity portfolio, labs, and working builds</span>
        </a>

        <nav class="site-nav" aria-label="Primary">
          ${navItems.map(renderNavLink).join("")}
        </nav>

        <div class="row site-status">
          <span
            id="hubStatus"
            class="pill mono"
            title="vmoor API health"
            aria-live="polite"
          >
            <span id="hubDot" class="dot" aria-hidden="true"></span>
            <span id="hubText">Hub: offline</span>
          </span>
        </div>
      </div>
    </header>
  `;

  const footerMarkup = `
    <footer class="site-footer">
      <div class="wrap site-footer__inner">
        <div class="stack">
          <div class="brand-title">Tyler Vander Mooren</div>
          <div class="small">
            Defensive security work, authenticated labs, and side projects built from the same home base.
          </div>
        </div>

        <div class="footer-links">
          <a href="${rel("labs/index.html")}">Labs</a>
          <a href="${rel("sleeper/index.html")}">Sleeper</a>
          <a href="${rel("streams/index.html")}">Streams</a>
          <a href="https://github.com/tjvmooren?tab=repositories" target="_blank" rel="noopener">GitHub</a>
        </div>

        <div class="small mono">vmoor rebuild 2026</div>
      </div>
    </footer>
  `;

  document.querySelectorAll("[data-site-header]").forEach((node) => {
    node.innerHTML = headerMarkup;
  });

  document.querySelectorAll("[data-site-footer]").forEach((node) => {
    node.innerHTML = footerMarkup;
  });
})();
