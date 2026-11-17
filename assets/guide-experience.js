(() => {
  'use strict';

  const spanish = document.documentElement.lang.toLowerCase().startsWith('es') || /^\/es(?:\/|$)/.test(location.pathname);

  const safeStorage = {
    get(key) {
      try { return window.localStorage.getItem(key); } catch (_) { return null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); } catch (_) { /* Preferences remain session-only. */ }
    }
  };

  const cleanText = (value = '') => value.replace(/\s+/g, ' ').trim();

  const openBibleLinksOnBibleGateway = () => {
    document.querySelectorAll('a[href*="biblegateway.com/passage"]').forEach((link) => {
      try {
        const destination = new URL(link.href);
        destination.searchParams.set('version', spanish ? 'RVR1960' : 'KJV');
        link.href = destination.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.removeAttribute('data-native-bible-link');
        const reference = destination.searchParams.get('search') || cleanText(link.querySelector('span')?.textContent);
        link.setAttribute('aria-label', `${reference} — ${spanish ? 'leer en Reina-Valera 1960 en BibleGateway' : 'read in the KJV on BibleGateway'}`);
        const detail = link.querySelector('small');
        if (detail && !/↗\s*$/.test(detail.textContent)) detail.textContent = `${detail.textContent.replace(/\s*·\s*Opens here\s*$/, '')} ↗`;
      } catch (_) {
        // Leave malformed links untouched.
      }
    });
  };

  // Scale the original declarations, preserving each guide's cascade, heading
  // hierarchy and responsive sizes. Inherited text then scales exactly once,
  // including content revealed later. The local sheets are loaded before us.
  const enhanceGuideLibrary = () => {
    const library = document.getElementById('bible-guides');
    if (!library) return;
    library.classList.add('app-guide-library');

    const heading = library.querySelector('#guidesTitle');
    if (heading) heading.textContent = spanish ? 'Guías bíblicas' : 'Bible Guides';

    const eyebrow = library.querySelector('.section-heading > .eyebrow');
    if (eyebrow) eyebrow.hidden = true;

    const headingCopy = library.querySelector('.section-heading > p:not(.eyebrow)');
    if (headingCopy) {
      headingCopy.textContent = spanish
        ? 'Elige uno de los dos recorridos de guías. Tu progreso se guarda por separado en cada conjunto. ¿Prefieres guías impresas? '
        : 'Choose one of your two guide journeys. Your progress is saved separately for each set. Prefer printed guides? ';
      const printedGuides = document.createElement('a');
      printedGuides.href = '/guides/';
      printedGuides.textContent = spanish ? 'Haz clic aquí' : 'Click here';
      headingCopy.append(printedGuides, '.');
    }

    library.querySelectorAll('.journey-card').forEach((journey) => {
      const isJesus = journey.classList.contains('journey-jesus');
      const guideCount = isJesus ? 10 : 9;
      const label = journey.querySelector('.journey-label');
      const title = journey.querySelector('.journey-summary h2');
      const copy = journey.querySelector('.journey-summary p');
      const toggle = journey.querySelector('.journey-toggle');
      const toggleCopy = toggle?.querySelector('span');
      const guideItems = [...journey.querySelectorAll('.guide-item')];

      journey.querySelector('.journey-number')?.remove();
      if (label) label.textContent = isJesus
        ? (spanish ? 'RECORRIDO DE 10 GUÍAS SOBRE JESÚS Y LA FE' : '10-GUIDE RELATIONSHIP JOURNEY')
        : (spanish ? 'RECORRIDO DE 9 GUÍAS DE PROFECÍA' : '9-GUIDE PROPHECY JOURNEY');
      if (title) title.textContent = isJesus
        ? (spanish ? 'Conoce a Jesús' : 'Get to Know Jesus')
        : (spanish ? 'Profecía bíblica' : 'Bible Prophecy');
      if (copy) copy.textContent = isJesus
        ? (spanish ? 'Descubre quién es Dios, lo que Jesús ha hecho y qué significa seguirlo en tu vida.' : 'Explore who God is, what Jesus has done, and what following Him means for your life.')
        : (spanish ? 'Examina las pruebas, la secuencia y el significado de la profecía bíblica, una guía a la vez.' : 'Examine the Bible’s prophetic evidence, sequence, and meaning one guide at a time.');

      const savedGuides = guideItems.map((item, index) => {
        const value = Number.parseInt(safeStorage.get(`tjm-${isJesus ? 'jesus' : 'bible-prophecy'}-guide-${index + 1}-progress`) || '1', 10);
        return { guide: index + 1, step: Number.isInteger(value) ? Math.max(1, Math.min(8, value)) : 1 };
      }).filter((item) => item.step > 1);
      const current = savedGuides.at(-1) || null;
      const percent = current
        ? Math.round((((current.guide - 1) + ((current.step - 1) / 7)) / guideCount) * 100)
        : 0;

      const progress = document.createElement('div');
      progress.className = 'app-guide-progress';
      progress.innerHTML = `<div><strong>${percent}% ${spanish ? 'completado' : 'complete'}</strong>${current ? `<span>${spanish ? 'Guía' : 'Guide'} ${current.guide} ${spanish ? 'de' : 'of'} ${guideCount}</span>` : ''}</div><div class="app-guide-progress-track"><span style="width:${percent}%"></span></div>`;
      toggle?.before(progress);

      const updateToggle = () => {
        const titleText = title?.textContent || '';
        if (toggleCopy) toggleCopy.textContent = journey.open
          ? (spanish ? 'Ocultar guías' : 'Hide Guides')
          : (spanish ? 'Ver guías' : 'See Guides');
        toggle?.setAttribute('aria-label', journey.open
          ? (spanish ? `Ocultar las guías de ${titleText}` : `Hide ${titleText} guides`)
          : (spanish ? `Ver las guías de ${titleText}` : `See ${titleText} guides`));
      };
      journey.addEventListener('toggle', updateToggle);
      updateToggle();

      guideItems.forEach((item) => {
        if (spanish) {
          try {
            const url = new URL(item.href, location.href);
            if (url.origin === location.origin && /^\/(?:get-to-know-jesus|bible-prophecy)\/guide\d+\/?$/.test(url.pathname)) {
              item.href = '/es' + url.pathname;
            }
          } catch (_) {}
        }
        item.querySelector('.guide-item-copy > small')?.remove();
        item.querySelector('.guide-item-meta')?.remove();
        const arrow = item.querySelector(':scope > b');
        if (arrow) arrow.textContent = '›';
        const copyElement = item.querySelector('.guide-item-copy');
        item.setAttribute('aria-label',
          (spanish ? 'Abrir ' : 'Open ') + cleanText(copyElement?.querySelector('strong')?.textContent));
      });
    });

    if (window.location.hash === '#bible-guides') {
      library.querySelector('.journey-card')?.setAttribute('open', '');
    }
  };

  const glossary = {
    antichrist: 'A person or power that opposes Christ or tries to take His place.',
    atonement: 'God’s work of reconciling people to Himself through Jesus.',
    covenant: 'A serious promise that establishes a relationship between God and His people.',
    gospel: 'The good news that Jesus saves and restores us.',
    judgment: 'God’s fair examination of truth, choices, and character.',
    millennium: 'A period of one thousand years described in Revelation 20.',
    prophecy: 'A message from God that may explain His will or reveal future events.',
    resurrection: 'God bringing a person back to life.',
    righteousness: 'Being right with God and living in a way that reflects His character.',
    salvation: 'God rescuing us from sin and giving us new life through Jesus.',
    sanctuary: 'The Bible’s worship center that illustrates God’s plan to save and restore people.',
    sin: 'Distrusting God and choosing attitudes or actions that harm our relationship with Him and others.'
  };

  const enhanceLesson = () => {
    const shell = document.querySelector('.lesson-shell');
    const stage = document.getElementById('panelStage');
    const panels = [...document.querySelectorAll('.lesson-panel')];
    if (!shell || !stage || !panels.length) return;

    document.body.classList.add('guide-reader-page');

    const getSectionName = (panel, index) => {
      if (index === 0) return spanish ? 'Introducción' : 'Introduction';
      const eyebrow = cleanText(panel.querySelector('.eyebrow')?.textContent);
      if (eyebrow) return eyebrow;
      return cleanText(panel.querySelector('h2, h1')?.textContent) || (spanish ? `Sección ${index + 1}` : `Section ${index + 1}`);
    };

    const sectionNames = panels.map(getSectionName);
    const isProphecyGuide = shell.classList.contains('prophecy-shell');

    const sizeCount = 40;
    const defaultSize = 11;
    const preferredSize = null; // Font-size controls retired; use authored layout.
    const savedSize = preferredSize === null ? defaultSize : Number(preferredSize) + 1;
    let textSize = Number.isInteger(savedSize) && savedSize >= 1 && savedSize <= sizeCount ? savedSize : defaultSize;
    const scaleBody = window.createBodyTextScaler();

    const toolbar = document.createElement('div');
    toolbar.className = 'guide-reader-toolbar';
    toolbar.setAttribute('aria-label', spanish ? 'Herramientas de lectura' : 'Reading tools');
    toolbar.innerHTML = `
      <div class="guide-reading-controls">
        <div class="guide-text-controls" role="group" aria-label="${spanish ? 'Tamaño de texto' : 'Text size'}">
          <button type="button" data-text-size="decrease" aria-label="${spanish ? 'Disminuir tamaño de texto' : 'Decrease text size'}">−</button>
          <button type="button" data-text-size="increase" aria-label="${spanish ? 'Aumentar tamaño de texto' : 'Increase text size'}">+</button>
          <span class="guide-text-status" role="status" aria-live="polite" aria-atomic="true"></span>
        </div>
        <label class="guide-audio-speed"><span>${spanish ? 'Velocidad de audio' : 'Listen speed'}</span>
          <select id="guideAudioSpeed" aria-label="${spanish ? 'Velocidad de lectura en voz alta' : 'Audio reading speed'}">
            <option value="0.82">${spanish ? 'Más lento' : 'Slower'}</option>
            <option value="0.94">Normal</option>
            <option value="1.1">${spanish ? 'Más rápido' : 'Faster'}</option>
          </select>
        </label>
      </div>
      <div class="guide-reader-links">
        <a href="${spanish ? '/es/welcome/#bible-guides' : '/welcome/#bible-guides'}">${spanish ? 'Guardar y terminar después' : 'Save &amp; Finish Later'}</a>
        <a href="${spanish ? '/es/welcome/#bible-guides' : '/welcome/#bible-guides'}">${spanish ? 'Volver a las guías bíblicas' : 'Return to Bible Guides'}</a>
        <a href="https://chat.whatsapp.com/Lqv7ZVbC3PPBmQNMjRoXaM" target="_blank" rel="noopener noreferrer">${spanish ? '¿Necesitas ayuda?' : 'Need Help?'}</a>
      </div>`;

    shell.insertBefore(toolbar, stage);

    const sizeButtons = [...toolbar.querySelectorAll('[data-text-size]')];
    const applyTextSize = () => {
      // Forty distinct settings: 75% through 172.5%, in 2.5-percent steps.
      const percentage = 75 + (textSize - 1) * 2.5;
      scaleBody(percentage / 100);
      document.documentElement.dataset.guideTextSize = String(textSize);
      document.documentElement.dataset.guideTextEnlarged = String(percentage > 100);
      document.querySelector('.guide-text-status').textContent = `${textSize} / ${sizeCount}`;
      sizeButtons.forEach((button) => {
        button.disabled = button.dataset.textSize === 'decrease' ? textSize === 1 : textSize === sizeCount;
      });
    };
    applyTextSize();
    sizeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        textSize = Math.max(1, Math.min(sizeCount, textSize + (button.dataset.textSize === 'increase' ? 1 : -1)));
        safeStorage.set('tjm-body-text-level', String(textSize - 1));
        applyTextSize();
      });
    });

    const speed = toolbar.querySelector('#guideAudioSpeed');
    if (speed) {
      const storedSpeed = safeStorage.get('tjm-guide-audio-rate') || '0.94';
      speed.value = ['0.82', '0.94', '1.1'].includes(storedSpeed) ? storedSpeed : '0.94';
      speed.addEventListener('change', () => safeStorage.set('tjm-guide-audio-rate', speed.value));
    }

    const outline = document.createElement('details');
    outline.className = 'guide-outline';
    outline.innerHTML = `
      <summary><span>${spanish ? 'Ver todas las secciones' : 'View All Sections'}</span><span aria-hidden="true">＋</span></summary>
      <ol>${sectionNames.map((name, index) => `<li><button type="button" data-section-index="${index}"><span>${index + 1}</span>${name}</button></li>`).join('')}</ol>`;
    shell.insertBefore(outline, stage);

    outline.querySelectorAll('[data-section-index]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number.parseInt(button.dataset.sectionIndex, 10);
        const dot = document.getElementById('lessonDots')?.children[index];
        if (dot instanceof HTMLElement) dot.click();
        outline.open = false;
      });
    });

    const fullText = cleanText(stage.textContent).toLowerCase();
    const usedTerms = Object.entries(glossary).filter(([term]) => fullText.includes(term));
    if (usedTerms.length) {
      const plainLanguage = document.createElement('details');
      plainLanguage.className = 'guide-glossary';
      plainLanguage.innerHTML = `
        <summary><span>Plain-Language Bible Words</span><span aria-hidden="true">＋</span></summary>
        <dl>${usedTerms.map(([term, definition]) => `<div><dt>${term}</dt><dd>${definition}</dd></div>`).join('')}</dl>`;
      shell.insertBefore(plainLanguage, stage);
    }

    // Keep optional controls together so the guide itself comes first.
    if (document.body.classList.contains('tjm-simple')) {
      const tools = document.createElement('details');
      tools.className = 'guide-simple-tools';
      const label = document.createElement('summary');
      label.textContent = spanish ? 'Herramientas de lectura y ayuda' : 'Reading tools & help';
      tools.appendChild(label);
      shell.insertBefore(tools, stage);
      [toolbar, outline, shell.querySelector('.guide-glossary')].filter(Boolean)
        .forEach((control) => tools.appendChild(control));
    }

    panels.forEach((panel, index) => {
      panel.querySelectorAll('details.evidence-drawer > summary > span:first-child').forEach((label) => {
        const text = cleanText(label.textContent);
        if (text && !/^(?:go deeper|profundiza):/i.test(text)) label.textContent = `${spanish ? 'Profundiza' : 'Go deeper'}: ${text}`;
      });

      if (!panel.querySelector('.main-point')) {
        const lead = panel.querySelector('.panel-lead');
        const readableParagraphs = [...panel.querySelectorAll('.panel-copy > p, .panel-copy-wide > p')]
          .filter((paragraph) => !paragraph.classList.contains('eyebrow') && !paragraph.classList.contains('save-note'));
        const summarySource = index === 0
          ? readableParagraphs.find((paragraph) => !paragraph.classList.contains('panel-lead')) || lead
          : lead || readableParagraphs[0];
        const summaryText = cleanText(summarySource?.textContent);
        if (summaryText) {
          const summary = document.createElement('aside');
          summary.className = 'main-point';
          const summaryLabel = spanish ? (index === 0 ? 'LO QUE DESCUBRIRÁS' : isProphecyGuide ? 'LO QUE SIGNIFICA' : 'LA IDEA PRINCIPAL') : (index === 0 ? 'WHAT YOU’LL DISCOVER' : isProphecyGuide ? 'WHAT THIS MEANS' : 'THE MAIN POINT');
          summary.setAttribute('aria-label', summaryLabel.toLowerCase());
          summary.innerHTML = `<span>${summaryLabel}</span><p>${summaryText}</p>`;
          const copy = panel.querySelector('.panel-copy, .panel-copy-wide');
          const chips = index === 0 ? panel.querySelector('.study-chips') : null;
          if (copy && chips) copy.insertBefore(summary, chips);
          else copy?.appendChild(summary);
        }
      }
    });

    const navigation = document.getElementById('lessonNavigation');
    const dots = document.getElementById('lessonDots');
    const backButton = document.getElementById('backButton');
    const nextButton = document.getElementById('nextButton');
    const panelCount = document.getElementById('panelCount');

    if (backButton) backButton.innerHTML = spanish ? '<span aria-hidden="true">←</span> Sección anterior' : '<span aria-hidden="true">←</span> Previous Section';
    if (nextButton) nextButton.innerHTML = spanish ? 'Continuar <span aria-hidden="true">→</span>' : 'Continue <span aria-hidden="true">→</span>';

    const sectionStatus = document.createElement('div');
    sectionStatus.className = 'guide-section-status';
    sectionStatus.setAttribute('aria-live', 'polite');
    if (dots) dots.insertAdjacentElement('beforebegin', sectionStatus);

    const mobileNavigation = document.createElement('nav');
    mobileNavigation.className = 'mobile-guide-navigation';
    mobileNavigation.setAttribute('aria-label', spanish ? 'Navegación móvil de la guía' : 'Mobile guide navigation');
    mobileNavigation.innerHTML = `
      <button type="button" class="mobile-guide-back" aria-label="${spanish ? 'Sección anterior' : 'Previous section'}"><span aria-hidden="true">←</span><span>${spanish ? 'Anterior' : 'Previous'}</span></button>
      <span class="mobile-guide-status" aria-live="polite"></span>
      <button type="button" class="mobile-guide-next" aria-label="${spanish ? 'Sección siguiente' : 'Next section'}"><span>${spanish ? 'Continuar' : 'Continue'}</span><span aria-hidden="true">→</span></button>`;
    document.body.appendChild(mobileNavigation);
    mobileNavigation.querySelector('.mobile-guide-back')?.addEventListener('click', () => backButton?.click());
    mobileNavigation.querySelector('.mobile-guide-next')?.addEventListener('click', () => nextButton?.click());

    const currentIndex = () => Math.max(0, panels.findIndex((panel) => !panel.hidden));
    const updateSectionUI = () => {
      const index = currentIndex();
      const sectionNumber = index + 1;
      const name = sectionNames[index];
      if (panelCount) panelCount.textContent = `${spanish ? 'SECCIÓN' : 'SECTION'} ${sectionNumber} ${spanish ? 'DE' : 'OF'} ${panels.length}`;
      sectionStatus.innerHTML = `<span>${spanish ? 'Sección' : 'Section'} ${sectionNumber} ${spanish ? 'de' : 'of'} ${panels.length}</span><strong>${name}</strong>`;
      outline.querySelectorAll('[data-section-index]').forEach((button, buttonIndex) => {
        button.classList.toggle('is-current', buttonIndex === index);
        button.setAttribute('aria-current', buttonIndex === index ? 'step' : 'false');
      });
      if (navigation) navigation.style.removeProperty('display');
      if (backButton) backButton.disabled = index === 0;
      if (nextButton) {
        nextButton.disabled = index === panels.length - 1;
        nextButton.style.visibility = index === panels.length - 1 ? 'hidden' : 'visible';
      }
      const mobileStatus = mobileNavigation.querySelector('.mobile-guide-status');
      const mobileBack = mobileNavigation.querySelector('.mobile-guide-back');
      const mobileNext = mobileNavigation.querySelector('.mobile-guide-next');
      if (mobileStatus) mobileStatus.textContent = `${sectionNumber} ${spanish ? 'de' : 'of'} ${panels.length}`;
      if (mobileBack) mobileBack.disabled = index === 0;
      if (mobileNext) {
        mobileNext.disabled = index === panels.length - 1;
        mobileNext.querySelector('span:first-child').textContent = index === panels.length - 1 ? (spanish ? 'Finalizado' : 'Finished') : (spanish ? 'Continuar' : 'Continue');
      }
    };

    const observer = new MutationObserver(updateSectionUI);
    panels.forEach((panel) => observer.observe(panel, { attributes: true, attributeFilter: ['hidden', 'class'] }));
    updateSectionUI();

    const printButton = [...document.querySelectorAll('.header-link')].find((button) => /print/i.test(button.textContent));
    if (printButton) {
      printButton.textContent = spanish ? 'Letra grande' : 'Large Print';
      printButton.setAttribute('aria-label', spanish ? 'Abrir la versión de letra grande' : 'Open the large-print version');
    }
    const restartButton = document.getElementById('restartLesson');
    if (restartButton) restartButton.textContent = spanish ? 'Empezar de nuevo' : 'Start Over';

    const saveNote = document.querySelector('.save-note');
    if (saveNote) saveNote.textContent = spanish ? 'Tu progreso se guarda automáticamente en este dispositivo.' : 'Your place is saved automatically on this device.';

  };

  openBibleLinksOnBibleGateway();
  enhanceGuideLibrary();
  enhanceLesson();
})();
