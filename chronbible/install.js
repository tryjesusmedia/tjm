(() => {
  'use strict';
  const invite = document.getElementById('install-chronbible');
  const button = document.getElementById('install-chronbible');
  const help = document.getElementById('install-help');
  const steps = document.getElementById('install-steps');
  if (!invite || !button || !help || !steps) return;
  let installPrompt = null;
  const standalone = window.matchMedia('(display-mode: standalone)');
  const measure = () => {};
  const update = () => {
    invite.hidden = standalone.matches || navigator.standalone === true;
    measure();
  };
  update();
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(invite);
  standalone.addEventListener('change', update);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    invite.hidden = true;
    if (help.open) help.close();
    measure();
  });
  function showHelp() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios) {
      steps.innerHTML = '<ol><li>Open this page in <strong>Safari</strong>.</li><li>Tap <strong>Share</strong> (the square with an upward arrow). It may be inside the page menu.</li><li>Choose <strong>Add to Home Screen</strong>. Scroll down if needed.</li><li>Leave <strong>Open as Web App</strong> on if shown, then tap <strong>Add</strong>.</li></ol>';
    } else if (/Android/.test(navigator.userAgent)) {
      steps.innerHTML = '<ol><li>Open this page in <strong>Chrome</strong>.</li><li>Tap the <strong>three-dot menu</strong>.</li><li>Choose <strong>Add to Home screen</strong> or <strong>Install app</strong>, then confirm.</li></ol>';
    } else {
      steps.innerHTML = '<p>On a Windows laptop or Mac, open this page in <strong>Chrome or Edge</strong> and use the install icon in the address bar or the browser menu. In Safari on a supported Mac, choose <strong>File → Add to Dock</strong>. You can then pin ChronBible to your taskbar or Dock.</p>';
    }
    if (!help.open) help.showModal();
  }
  button.addEventListener('click', async () => {
    if (!installPrompt) { showHelp(); return; }
    const prompt = installPrompt;
    installPrompt = null;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch { showHelp(); }
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/chronbible/sw.js', { scope: '/chronbible/', updateViaCache: 'none' })
      .catch(error => console.warn('Home screen setup:', error.message));
  }
})();
