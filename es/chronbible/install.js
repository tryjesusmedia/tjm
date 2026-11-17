(() => {
  'use strict';
  let installPrompt = null;
  let refreshReady = () => {};
  const installedKey = 'tjm-chronbible-es-installed';
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
  const invite = document.getElementById('install-chronbible');
  const button = document.getElementById('install-chronbible');
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
    // Keep this menu entry available in the browser even if Chrome knows the app is installed.
    // Inside the installed standalone app, installation is not relevant.
    invite.hidden = runningInstalled;
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
    update();
    if (help.open) help.close();
    measure();
  });
  const ready = document.createElement('button');
  ready.type = 'button';
  ready.className = 'button button-primary';
  ready.textContent = 'Instalar ChronBible';
  ready.hidden = true;
  steps.before(ready);
  ready.addEventListener('click', requestInstall);
  refreshReady = () => {
    if (installPrompt) installed = false;
    update();
    ready.hidden = !installPrompt;
    if (installPrompt && help.open) {
      steps.innerHTML = '<p>Listo para instalar. Toca <strong>Instalar ChronBible</strong> arriba y confirma en tu navegador.</p>';
    }
  };
  refreshReady();
  async function checkInstalled() {
    if (typeof navigator.getInstalledRelatedApps !== 'function') return;
    try {
      const apps = await navigator.getInstalledRelatedApps();
      if (apps.some(app => app.platform === 'webapp' && (app.id === 'https://tryjesusmedia.com/es/chronbible/' || app.id === '/es/chronbible/' || app.url === 'https://tryjesusmedia.com/es/chronbible/manifest.webmanifest'))) {
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
      steps.innerHTML = '<ol><li>Abre esta página en <strong>Safari</strong>.</li><li>Toca <strong>Compartir</strong> (el cuadrado con una flecha hacia arriba). Puede estar dentro del menú de la página.</li><li>Elige <strong>Añadir a pantalla de inicio</strong>. Desplázate hacia abajo si es necesario.</li><li>Deja activada la opción <strong>Abrir como aplicación web</strong> si aparece y luego toca <strong>Añadir</strong>.</li></ol>';
    } else if (/Android/.test(navigator.userAgent)) {
      steps.innerHTML = '<p>Añade ChronBible a tu teléfono desde el menú del navegador:</p><ol><li>Toca el <strong>menú de tres puntos</strong> en la parte superior derecha de Chrome.</li><li>Elige <strong>Añadir a pantalla de inicio</strong> o <strong>Instalar aplicación</strong>.</li><li>Toca <strong>Instalar</strong> o <strong>Añadir</strong> para confirmar.</li></ol><p>Si usas otro navegador y no encuentras esta opción, abre esta página en Chrome. Si ya está instalado, abre ChronBible desde la pantalla de inicio.</p>';
    } else {
      steps.innerHTML = '<p>En una computadora Windows o Mac, abre esta página en <strong>Chrome o Edge</strong> y usa el ícono de instalación en la barra de direcciones o en el menú del navegador. En Safari en una Mac compatible, elige <strong>Archivo → Añadir al Dock</strong>. Después puedes fijar ChronBible a la barra de tareas o al Dock.</p>';
    }
    if (!help.open) help.showModal();
    refreshReady();
  }
  async function requestInstall() {
    if (standalone.matches || navigator.standalone === true) { update(); return; }
    if (installed) {
      steps.innerHTML = '<p><strong>ChronBible ya está instalado.</strong> Usa el botón <strong>Abrir en la aplicación</strong> en la barra de direcciones de Chrome para iniciarlo.</p>';
      if (!help.open) help.showModal();
      return;
    }
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
    navigator.serviceWorker.register('/es/chronbible/sw.js', { scope: '/es/chronbible/', updateViaCache: 'none' })
      .catch(error => console.warn('Configuración de pantalla de inicio:', error.message));
  }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
