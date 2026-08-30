// assets/consent.js — cookie consent, and the analytics it actually gates.
//
// The cookies page says analytics runs only if you accept it. This is the
// file that makes that true. Google Analytics is not loaded, and no request
// reaches Google at all, until someone accepts. Declining is a real decline:
// nothing is loaded then or on any later visit until the choice is reset.
//
// The main site's banner stores a preference and loads Analytics regardless.
// That pattern is deliberately not copied.
//
// Replaces the inline gtag block that used to sit in the head of every page.

(function () {
  var GA_ID = 'G-3S96VP3093';
  var COOKIE = 'osc_cookie_choice';
  var ONE_YEAR = 60 * 60 * 24 * 365;

  // ── the stored choice ────────────────────────────────────────────────
  function readChoice() {
    try {
      var match = document.cookie.match(new RegExp('(^|;\\s*)' + COOKIE + '=([^;]*)'));
      return match ? decodeURIComponent(match[2]) : null;
    } catch (e) {
      console.error('[consent] could not read the choice cookie', e);
      return null;
    }
  }

  function writeChoice(value) {
    try {
      document.cookie = COOKIE + '=' + encodeURIComponent(value)
        + '; max-age=' + ONE_YEAR + '; path=/; SameSite=Lax';
    } catch (e) {
      console.error('[consent] could not store the choice', e);
    }
  }

  // ── analytics, loaded only on acceptance ─────────────────────────────
  var analyticsLoaded = false;

  function loadAnalytics() {
    if (analyticsLoaded) return;
    analyticsLoaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };

    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    script.onerror = function () {
      console.error('[consent] analytics script failed to load');
    };
    document.head.appendChild(script);

    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { content_group: 'OSCI Pro' });
  }

  // ── the banner ───────────────────────────────────────────────────────
  var STYLE = [
    '.osc-consent{position:fixed;bottom:0;left:0;right:0;background:var(--navy,#1F3A5F);',
    'border-top:1px solid rgba(255,255,255,0.12);padding:16px 32px;display:flex;',
    'align-items:center;justify-content:space-between;gap:24px;z-index:9000;flex-wrap:wrap;',
    'font-family:var(--sans),system-ui,sans-serif}',
    '.osc-consent p{font-size:13px;line-height:1.5;color:rgba(255,255,255,0.72);flex:1;min-width:220px;margin:0}',
    '.osc-consent a{color:var(--gold,#B08D57);text-decoration:underline}',
    '.osc-consent-btns{display:flex;gap:12px;flex-shrink:0}',
    '.osc-consent button{font-family:inherit;font-size:13px;border-radius:2px;cursor:pointer;padding:10px 22px}',
    '.osc-accept{background:var(--gold,#B08D57);color:var(--navy,#1F3A5F);border:none;font-weight:600}',
    '.osc-decline{background:transparent;color:rgba(255,255,255,0.62);border:1px solid rgba(255,255,255,0.24)}',
    '@media(max-width:600px){.osc-consent{flex-direction:column;align-items:flex-start;padding:16px 20px}}'
  ].join('');

  function showBanner() {
    var style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);

    var bar = document.createElement('div');
    bar.className = 'osc-consent';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Cookie choice');
    bar.innerHTML =
      '<p>We would like to use Google Analytics to see which pages people read. '
      + 'Nothing is loaded until you say yes, and the site works either way. '
      + '<a href="/cookies.html">What we set</a>.</p>'
      + '<div class="osc-consent-btns">'
      + '<button type="button" class="osc-accept">Accept</button>'
      + '<button type="button" class="osc-decline">Decline</button>'
      + '</div>';

    function close() { if (bar.parentNode) bar.parentNode.removeChild(bar); }

    bar.querySelector('.osc-accept').addEventListener('click', function () {
      writeChoice('accepted');
      loadAnalytics();
      close();
    });

    bar.querySelector('.osc-decline').addEventListener('click', function () {
      writeChoice('declined');
      close();
    });

    document.body.appendChild(bar);
  }

  // ── let someone change their mind ────────────────────────────────────
  // Used by the button on the cookies page. Clearing the choice cannot
  // unload Analytics from the page it is already running on, so the page is
  // reloaded, and on the way back nothing loads until the banner is answered.
  window.oscResetCookieChoice = function () {
    try {
      document.cookie = COOKIE + '=; max-age=0; path=/; SameSite=Lax';
    } catch (e) {
      console.error('[consent] could not clear the choice', e);
    }
    window.location.reload();
  };

  window.oscCookieChoice = readChoice;

  // ── start ────────────────────────────────────────────────────────────
  function start() {
    var choice = readChoice();
    if (choice === 'accepted') { loadAnalytics(); return; }
    if (choice === 'declined') { return; }
    showBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
