// assets/chrome.js — site header, footer, test banner.
// Injected at runtime so every page has them without copy-paste.

(function() {
  const path = window.location.pathname;
  function isCurrent(href) {
    // Treat /index.html and / as the same
    const normalised = path.replace(/\/index\.html$/, '/').replace(/\/$/, '') || '/';
    const target = href.replace(/\/index\.html$/, '/').replace(/\/$/, '') || '/';
    return normalised === target;
  }
  function navLink(href, label) {
    const cur = isCurrent(href) ? ' aria-current="page"' : '';
    return `<a href="${href}"${cur}>${label}</a>`;
  }

  const testBanner = `
    <div class="test-banner">
      TEST BUILD &middot; Pro instrument &middot; Not for public release. Hosted at protest.opensourcecharisma.com for development and review only.
    </div>`;

  const header = `
    <header class="site-header">
      <div class="site-header-inner">
        <a class="site-logo" href="/">Open-Source Charisma<span class="pro-badge">Pro</span></a>
        <nav class="site-nav">
          ${navLink('/', 'Home')}
          ${navLink('/about.html', 'About the Pro')}
          ${navLink('/methodology.html', 'Methodology')}
          ${navLink('/assessment.html', 'Take the Assessment')}
          ${navLink('/book.html', 'The Book')}
        </nav>
      </div>
    </header>`;

  const footer = `
    <footer class="site-footer">
      <div class="site-footer-inner">
        <div>
          <strong>Open-Source Charisma &middot; Pro</strong><br>
          <span class="copyright">&copy; 2026 James G Harvey / Allcow Trading Co Ltd</span>
        </div>
        <div>
          The Message Business<br>
          <a href="mailto:jim.harvey@themessagebusiness.com">jim.harvey@themessagebusiness.com</a>
        </div>
        <div>
          <a href="https://opensourcecharisma.com">opensourcecharisma.com</a><br>
          <a href="https://opensourcecharisma.com/assessment">Take the free assessment</a>
        </div>
      </div>
    </footer>`;

  // Insert at the very top of body, footer at the very bottom
  document.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('afterbegin', testBanner + header);
    document.body.insertAdjacentHTML('beforeend', footer);
  });
})();
