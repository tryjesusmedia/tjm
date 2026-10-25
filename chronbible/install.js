(() => {
  'use strict';
  let installPrompt = null;
  let refreshReady = () => {};
  // Capture early, before deferred page scripts and UI initialization.
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    refreshReady();
  });
  function initialize() {
  const invite = document.getElementById('install-chronbible');
  const button = document.getElementById('install-chronbible');
  const help = document.getElementById('install-help');
  const steps = document.getElementById('install-steps');
  if (!invite || !button || !help || !steps) return;
  const standalone = window.matchMedia('(display-mode: standalone)');
  const measure = () => {};
  const update = () => {
    invite.hidden = standalone.matches || navigator.standalone === true;
    measure();
  };
  update();
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(invite);
  standalone.addEventListener('change', update);
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    invite.hidden = true;
    if (help.open) help.close();
    measure();
  });
  const ready = document.createElement('button');
  ready.type = 'button';
  ready.className = 'button button-primary';
  ready.textContent = 'Install ChronBible';
  ready.hidden = true;
  steps.before(ready);
  ready.addEventListener('click', requestInstall);
  refreshReady = () => {
    ready.hidden = !installPrompt;
    if (installPrompt && help.open) {
      steps.innerHTML = '<p>Ready to install. Tap <strong>Install ChronBible</strong> above, then confirm in your browser.</p>';
    }
  };
  function showHelp() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios) {
      steps.innerHTML = '<ol><li>Open this page in <strong>Safari</strong>.</li><li>Tap <strong>Share</strong> (the square with an upward arrow). It may be inside the page menu.</li><li>Choose <strong>Add to Home Screen</strong>. Scroll down if needed.</li><li>Leave <strong>Open as Web App</strong> on if shown, then tap <strong>Add</strong>.</li></ol>';
    } else if (/Android/.test(navigator.userAgent)) {
      steps.innerHTML = '<p>Your browser has not made direct installation available yet. Keep this page open; an <strong>Install ChronBible</strong> button will appear here when it is ready.</p><details><summary>Another way to install</summary><p>In Chrome, tap the three-dot menu, choose <strong>Add to Home screen</strong> or <strong>Install app</strong>, then confirm. If already installed, open ChronBible from your home screen.</p></details>';
    } else {
      steps.innerHTML = '<p>On a Windows laptop or Mac, open this page in <strong>Chrome or Edge</strong> and use the install icon in the address bar or the browser menu. In Safari on a supported Mac, choose <strong>File → Add to Dock</strong>. You can then pin ChronBible to your taskbar or Dock.</p>';
    }
    if (!help.open) help.showModal();
    refreshReady();
  }
  async function requestInstall() {
    if (!installPrompt) { showHelp(); return; }
    const prompt = installPrompt;
    installPrompt = null;
    ready.hidden = true;
    if (help.open) help.close();
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch { showHelp(); }
  }
  button.addEventListener('click', requestInstall);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/chronbible/sw.js', { scope: '/chronbible/', updateViaCache: 'none' })
      .catch(error => console.warn('Home screen setup:', error.message));
  }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
