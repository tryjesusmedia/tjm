(() => {
  'use strict';

  const safeStorage = {
    get(key) {
      try { return window.localStorage.getItem(key); } catch (_) { return null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); } catch (_) { /* Preferences remain session-only. */ }
    }
  };

  const cleanText = (value = '') => value.replace(/\s+/g, ' ').trim();

  // Scale the original declarations, preserving each guide's cascade, heading
  // hierarchy and responsive sizes. Inherited text then scales exactly once,
  // including content revealed later. The local sheets are loaded before us.
  const prepareGuideTextScaling = () => {
    const scaleRules = (rules) => {
      [...rules].forEach((rule) => {
        // Keep the existing large-print layout independent of screen settings.
        if (rule.media?.mediaText.includes('print')) return;
        if (rule.cssRules) scaleRules(rule.cssRules);
        if (!rule.selectorText || !rule.style) return;
        const size = rule.style.getPropertyValue('font-size');
        if (!size || /^(inherit|initial|unset|revert|revert-layer|0)$/.test(size)) return;
        // The rem basis must remain unscaled to avoid multiplying it twice.
        if (rule.selectorText.split(',').some((selector) => /^(html|:root)$/.test(selector.trim()))) return;
        if (size.includes('--tjm-guide-scale')) return;
        rule.style.setProperty('font-size', `calc((${size}) * var(--tjm-guide-scale, 1))`, rule.style.getPropertyPriority('font-size'));
      });
    };
    [...document.styleSheets].forEach((sheet) => {
      // Cross-origin font-provider sheets contain font faces, not guide sizes.
      if (sheet.href && new URL(sheet.href).origin !== window.location.origin) return;
      scaleRules(sheet.cssRules);
    });
  };

  const enhanceGuideLibrary = () => {
    const library = document.getElementById('bible-guides');
    if (!library) return;

    const heading = library.querySelector('#guidesTitle');
    if (heading) heading.innerHTML = 'Choose a Bible Guide<br><em>and Begin at Your Own Pace.</em>';

    const headingCopy = library.querySelector('.section-heading > p:not(.eyebrow)');
    if (headingCopy) {
      headingCopy.textContent = 'Choose the topic that matters to you. Each clear, Scripture-based guide takes about 10–16 minutes, and your place is saved on this device.';
    }

    library.querySelectorAll('.journey-card').forEach((journey) => {
      const copy = journey.querySelector('.journey-summary p');
      if (copy && journey.classList.contains('journey-jesus')) {
        copy.textContent = 'Ten warm, practical guides about Jesus, salvation, and everyday faith.';
      }
      if (copy && journey.classList.contains('journey-prophecy')) {
        copy.textContent = 'Nine clear, step-by-step guides that make Bible prophecy easier to understand.';
      }
    });

    library.querySelectorAll('.guide-item').forEach((item) => {
      const match = item.getAttribute('href')?.match(/^\/(get-to-know-jesus|bible-prophecy)\/guide(\d+)\/?$/);
      if (!match) return;

      const [, collection, guideNumber] = match;
      const storageKey = collection === 'get-to-know-jesus'
        ? `tjm-jesus-guide-${guideNumber}-progress`
        : `tjm-bible-prophecy-guide-${guideNumber}-progress`;
      const readingTimes = {
        'get-to-know-jesus': [10, 10, 10, 10, 12, 13, 14, 15, 15, 16],
        'bible-prophecy': [10, 10, 10, 12, 12, 12, 12, 12, 13]
      };
      const readingTime = readingTimes[collection][Number.parseInt(guideNumber, 10) - 1];
      const saved = Number.parseInt(safeStorage.get(storageKey) || '1', 10);
      const validStep = Number.isInteger(saved) ? Math.max(1, Math.min(8, saved)) : 1;
      const status = validStep >= 8
        ? 'Completed on this device'
        : validStep > 1
          ? `Continue at section ${validStep} of 8`
          : `About ${readingTime} minutes`;
      const action = validStep >= 8 ? 'Review Guide' : validStep > 1 ? 'Continue Guide' : 'Begin Guide';

      const copy = item.querySelector('.guide-item-copy');
      if (!copy || copy.querySelector('.guide-item-meta')) return;

      const meta = document.createElement('span');
      meta.className = 'guide-item-meta';
      meta.innerHTML = `<span class="guide-item-status">${status}</span><span class="guide-item-action">${action}</span>`;
      copy.appendChild(meta);
      item.setAttribute('aria-label', `${cleanText(copy.querySelector('strong')?.textContent)}. ${status}. ${action}.`);
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
      if (index === 0) return 'Introduction';
      const eyebrow = cleanText(panel.querySelector('.eyebrow')?.textContent);
      if (eyebrow) return eyebrow;
      return cleanText(panel.querySelector('h2, h1')?.textContent) || `Section ${index + 1}`;
    };

    const sectionNames = panels.map(getSectionName);
    const isProphecyGuide = shell.classList.contains('prophecy-shell');

    const sizeCount = 40;
    const defaultSize = 5;
    const preferredSize = safeStorage.get('tjm-guide-text-size');
    const legacySizes = { small: 3, default: defaultSize, large: 8 };
    const savedSize = legacySizes[preferredSize] ?? Number(preferredSize);
    let textSize = Number.isInteger(savedSize) && savedSize >= 1 && savedSize <= sizeCount ? savedSize : defaultSize;
    prepareGuideTextScaling();

    const toolbar = document.createElement('div');
    toolbar.className = 'guide-reader-toolbar';
    toolbar.setAttribute('aria-label', 'Reading tools');
    toolbar.innerHTML = `
      <div class="guide-text-controls" role="group" aria-label="Text size">
        <span>Text size</span>
        <button type="button" data-text-size="decrease" aria-label="Decrease text size">A−</button>
        <button type="button" data-text-size="increase" aria-label="Increase text size">A+</button>
        <span class="guide-text-status" role="status" aria-live="polite" aria-atomic="true"></span>
      </div>
      <label class="guide-audio-speed">Listen speed
        <select id="guideAudioSpeed" aria-label="Audio reading speed">
          <option value="0.82">Slower</option>
          <option value="0.94">Normal</option>
          <option value="1.1">Faster</option>
        </select>
      </label>
      <div class="guide-reader-links">
        <a href="/welcome/#bible-guides">Save &amp; Finish Later</a>
        <a href="/welcome/#bible-guides">Return to Bible Guides</a>
        <a href="https://chat.whatsapp.com/Lqv7ZVbC3PPBmQNMjRoXaM" target="_blank" rel="noopener noreferrer">Need Help?</a>
      </div>`;

    shell.insertBefore(toolbar, stage);

    const sizeButtons = [...toolbar.querySelectorAll('[data-text-size]')];
    const applyTextSize = () => {
      // Forty distinct settings: 80% through 275%, in five-percent steps.
      const percentage = 80 + (textSize - 1) * 5;
      document.body.style.setProperty('--tjm-guide-scale', String(percentage / 100));
      document.documentElement.dataset.guideTextSize = String(textSize);
      document.documentElement.dataset.guideTextEnlarged = String(percentage > 100);
      toolbar.querySelector('.guide-text-status').textContent = `Text size ${textSize} of ${sizeCount}, ${percentage} percent`;
      sizeButtons.forEach((button) => {
        button.disabled = button.dataset.textSize === 'decrease' ? textSize === 1 : textSize === sizeCount;
      });
    };
    applyTextSize();
    sizeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        textSize = Math.max(1, Math.min(sizeCount, textSize + (button.dataset.textSize === 'increase' ? 1 : -1)));
        safeStorage.set('tjm-guide-text-size', String(textSize));
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
      <summary><span>View All Sections</span><span aria-hidden="true">＋</span></summary>
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

    panels.forEach((panel, index) => {
      panel.querySelectorAll('details.evidence-drawer > summary > span:first-child').forEach((label) => {
        const text = cleanText(label.textContent);
        if (text && !/^go deeper:/i.test(text)) label.textContent = `Go deeper: ${text}`;
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
          const summaryLabel = index === 0 ? 'WHAT YOU’LL DISCOVER' : isProphecyGuide ? 'WHAT THIS MEANS' : 'THE MAIN POINT';
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

    if (backButton) backButton.innerHTML = '<span aria-hidden="true">←</span> Previous Section';
    if (nextButton) nextButton.innerHTML = 'Continue to Next Section <span aria-hidden="true">→</span>';

    const sectionStatus = document.createElement('div');
    sectionStatus.className = 'guide-section-status';
    sectionStatus.setAttribute('aria-live', 'polite');
    if (dots) dots.insertAdjacentElement('beforebegin', sectionStatus);

    const mobileNavigation = document.createElement('nav');
    mobileNavigation.className = 'mobile-guide-navigation';
    mobileNavigation.setAttribute('aria-label', 'Mobile guide navigation');
    mobileNavigation.innerHTML = `
      <button type="button" class="mobile-guide-back" aria-label="Previous section"><span aria-hidden="true">←</span><span>Previous</span></button>
      <span class="mobile-guide-status" aria-live="polite"></span>
      <button type="button" class="mobile-guide-next" aria-label="Next section"><span>Continue</span><span aria-hidden="true">→</span></button>`;
    document.body.appendChild(mobileNavigation);
    mobileNavigation.querySelector('.mobile-guide-back')?.addEventListener('click', () => backButton?.click());
    mobileNavigation.querySelector('.mobile-guide-next')?.addEventListener('click', () => nextButton?.click());

    const currentIndex = () => Math.max(0, panels.findIndex((panel) => !panel.hidden));
    const updateSectionUI = () => {
      const index = currentIndex();
      const sectionNumber = index + 1;
      const name = sectionNames[index];
      if (panelCount) panelCount.textContent = `SECTION ${sectionNumber} OF ${panels.length}`;
      sectionStatus.innerHTML = `<span>Section ${sectionNumber} of ${panels.length}</span><strong>${name}</strong>`;
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
      if (mobileStatus) mobileStatus.textContent = `${sectionNumber} of ${panels.length}`;
      if (mobileBack) mobileBack.disabled = index === 0;
      if (mobileNext) {
        mobileNext.disabled = index === panels.length - 1;
        mobileNext.querySelector('span:first-child').textContent = index === panels.length - 1 ? 'Finished' : 'Continue';
      }
    };

    const observer = new MutationObserver(updateSectionUI);
    panels.forEach((panel) => observer.observe(panel, { attributes: true, attributeFilter: ['hidden', 'class'] }));
    updateSectionUI();

    const printButton = [...document.querySelectorAll('.header-link')].find((button) => /print/i.test(button.textContent));
    if (printButton) {
      printButton.textContent = 'Large Print';
      printButton.setAttribute('aria-label', 'Open the large-print version');
    }
    const restartButton = document.getElementById('restartLesson');
    if (restartButton) restartButton.textContent = 'Start Over';

    const saveNote = document.querySelector('.save-note');
    if (saveNote) saveNote.textContent = 'Your place is saved automatically on this device.';

  };

  enhanceGuideLibrary();
  enhanceLesson();
})();
