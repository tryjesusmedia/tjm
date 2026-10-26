(() => {
  'use strict';
  let installPrompt = null;
  let refreshReady = () => {};
  const installedKey = 'tjm-conflict-installed';
  function rememberInstalled(value) {
    try { if (value) localStorage.setItem(installedKey, '1'); else localStorage.removeItem(installedKey); } catch {}
  }
  // Capture early, before deferred page scripts and UI initialization.
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    rememberInstalled(false);
    refreshReady();
  });
  function initialize() {
  const invite = document.getElementById('install-conflict');
  const button = document.getElementById('install-conflict');
  const help = document.getElementById('install-help');
  const steps = document.getElementById('install-steps');
  if (!invite || !button || !help || !steps) return;
  const standalone = window.matchMedia('(display-mode: standalone)');
  let installed = false;
  // A saved flag can survive uninstalling the app. Only trust current evidence.
  const measure = () => {};
  const update = () => {
    const runningInstalled = standalone.matches || navigator.standalone === true;
    if (runningInstalled) { installed = true; rememberInstalled(true); }
    // Keep installation help available while the browser prepares its native prompt.
    invite.hidden = runningInstalled || installed;
    if (invite.hidden && help.open) help.close();
    measure();
  };
  update();
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(invite);
  standalone.addEventListener('change', update);
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installed = true;
    rememberInstalled(true);
    invite.hidden = true;
    if (help.open) help.close();
    measure();
  });
  const ready = document.createElement('button');
  ready.type = 'button';
  ready.className = 'button button-primary';
  ready.textContent = 'Install Bible & Conflict Set';
  ready.hidden = true;
  steps.before(ready);
  ready.addEventListener('click', requestInstall);
  refreshReady = () => {
    if (installPrompt) installed = false;
    update();
    ready.hidden = !installPrompt;
    if (installPrompt && help.open) {
      steps.innerHTML = '<p>Ready to install. Tap <strong>Install Bible & Conflict Set</strong> above, then confirm in your browser.</p>';
    }
  };
  refreshReady();
  async function checkInstalled() {
    if (typeof navigator.getInstalledRelatedApps !== 'function') return;
    try {
      const apps = await navigator.getInstalledRelatedApps();
      if (apps.some(app => app.platform === 'webapp' && (app.id === 'https://tryjesusmedia.com/bibleandconflictoftheages/' || app.id === '/bibleandconflictoftheages/' || app.url === 'https://tryjesusmedia.com/bibleandconflictoftheages/manifest.webmanifest'))) {
        installed = true;
        installPrompt = null;
        rememberInstalled(true);
        update();
      }
    } catch {}
  }
  checkInstalled();
  window.addEventListener('pageshow', checkInstalled);
  function showHelp() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios) {
      steps.innerHTML = '<ol><li>Open this page in <strong>Safari</strong>.</li><li>Tap <strong>Share</strong> (the square with an upward arrow). It may be inside the page menu.</li><li>Choose <strong>Add to Home Screen</strong>. Scroll down if needed.</li><li>Leave <strong>Open as Web App</strong> on if shown, then tap <strong>Add</strong>.</li></ol>';
    } else if (/Android/.test(navigator.userAgent)) {
      steps.innerHTML = '<p>Add Bible & Conflict Set to your phone from your browser menu:</p><ol><li>Tap the <strong>three-dot menu</strong> at the top right in Chrome.</li><li>Choose <strong>Add to Home screen</strong> or <strong>Install app</strong>.</li><li>Tap <strong>Install</strong> or <strong>Add</strong> to confirm.</li></ol><p>If you are using another browser and cannot find this option, open this page in Chrome. If already installed, open Bible & Conflict Set from your home screen.</p>';
    } else {
      steps.innerHTML = '<p>On a Windows laptop or Mac, open this page in <strong>Chrome or Edge</strong> and use the install icon in the address bar or the browser menu. In Safari on a supported Mac, choose <strong>File → Add to Dock</strong>. You can then pin Bible & Conflict Set to your taskbar or Dock.</p>';
    }
    if (!help.open) help.showModal();
    refreshReady();
  }
  async function requestInstall() {
    if (installed || standalone.matches || navigator.standalone === true) { update(); return; }
    if (!installPrompt) { showHelp(); return; }
    const prompt = installPrompt;
    installPrompt = null;
    ready.hidden = true;
    if (help.open) help.close();
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') { installed = true; rememberInstalled(true); }
      update();
    } catch { showHelp(); }
  }
  button.addEventListener('click', requestInstall);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/bibleandconflictoftheages/sw.js', { scope: '/bibleandconflictoftheages/', updateViaCache: 'none' })
      .catch(error => console.warn('Home screen setup:', error.message));
  }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
