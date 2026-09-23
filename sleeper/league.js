(() => {
  const share = document.getElementById('shareEdition');
  const status = document.getElementById('shareStatus');
  const print = document.getElementById('printEdition');
  if (print) {
    print.hidden = false;
    print.addEventListener('click', () => window.print());
  }
  if (share && status) {
    share.hidden = false;
    share.addEventListener('click', async () => {
      const url = new URL('./index.html', location.href).href;
      try {
        await navigator.clipboard.writeText(url);
        status.textContent = 'Issue link copied. The group chat awaits.';
      } catch {
        status.textContent = `Share this issue: ${url}`;
      }
      status.hidden = false;
    });
  }
})();
