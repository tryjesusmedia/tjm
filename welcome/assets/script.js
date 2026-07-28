(() => {
  'use strict';

  const config = window.TJM_CONFIG || {};

    const zoomButtons = [
  document.getElementById('zoomButton')
].filter(Boolean);
  
  const zoomNote = document.getElementById('zoomNote');
  const countdown = document.getElementById('discussionCountdown');
  const countdownLabel = document.getElementById('countdownLabel');
  const meetingStatus = document.getElementById('meetingStatus');
  let timer = null;

  function configureLinks() {
    const zoomUrl = config.zoomUrl || 'https://zoombiblestudy.com/';
    const isDirectZoom = /(^|\.)zoom\.us\//i.test(zoomUrl) || /zoom\.us\/j\//i.test(zoomUrl);

    zoomButtons.forEach((button, index) => {
      button.href = zoomUrl;
      if (isDirectZoom) {
        if (index === 0) button.innerHTML = 'Enter the Live Zoom Call <span aria-hidden="true">↗</span>';
        if (index === 1) button.innerHTML = 'Join Thursday’s Zoom Discussion <span aria-hidden="true">↗</span>';
        if (index === 2) button.innerHTML = 'Enter the Live Zoom Call <span aria-hidden="true">↗</span>';
      }
    });

    if (zoomNote) {
      zoomNote.textContent = isDirectZoom
        ? 'This button opens the live Zoom meeting room in a new tab.'
        : 'This button opens the discussion access page in a new tab.';
    }

    document.querySelectorAll('[data-social]').forEach((link) => {
      const key = link.dataset.social;
      const url = config.social && config.social[key];
      if (url) link.href = url;
      else link.hidden = true;
    });

    const year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();
  }

  function getEasternParts(date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).formatToParts(date);
    return Object.fromEntries(parts.map((part) => [part.type, part.value]));
  }

  function easternOffsetMs(date) {
    const parts = getEasternParts(date);
    const asUTC = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
    );
    return asUTC - date.getTime();
  }

  function easternWallTimeToDate(year, month, day, hour, minute) {
    let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    guess = new Date(guess.getTime() - easternOffsetMs(guess));
    const correction = easternOffsetMs(guess);
    const wallUTC = Date.UTC(year, month - 1, day, hour, minute, 0);
    return new Date(wallUTC - correction);
  }

  function nextDiscussion(now = new Date()) {
    const targetDay = Number.isInteger(config.discussionDay) ? config.discussionDay : 4;
    const targetHour = Number.isFinite(config.discussionHourEastern) ? config.discussionHourEastern : 20;
    const targetMinute = Number.isFinite(config.discussionMinuteEastern) ? config.discussionMinuteEastern : 0;
    const eastern = getEasternParts(now);
    const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(eastern.weekday);
    let daysAhead = (targetDay - weekdayIndex + 7) % 7;

    const currentMinutes = (Number(eastern.hour) % 24) * 60 + Number(eastern.minute);
    const targetMinutes = targetHour * 60 + targetMinute;
    const isTargetDay = daysAhead === 0;
    const isLiveWindow = isTargetDay && currentMinutes >= targetMinutes && currentMinutes < targetMinutes + 90;

    if (isLiveWindow) {
      return { live: true, date: now };
    }

    if (isTargetDay && currentMinutes >= targetMinutes + 90) daysAhead = 7;

    const baseUTC = Date.UTC(Number(eastern.year), Number(eastern.month) - 1, Number(eastern.day));
    const targetDayDate = new Date(baseUTC + daysAhead * 86400000);
    return {
      live: false,
      date: easternWallTimeToDate(
        targetDayDate.getUTCFullYear(),
        targetDayDate.getUTCMonth() + 1,
        targetDayDate.getUTCDate(),
        targetHour,
        targetMinute
      )
    };
  }

  function setUnit(unit, value) {
    const el = countdown && countdown.querySelector(`[data-unit="${unit}"]`);
    if (el) el.textContent = String(value).padStart(2, '0');
  }

  function updateCountdown() {
    if (!countdown) return;
    const now = new Date();
    const next = nextDiscussion(now);

    if (next.live) {
      setUnit('days', 0); setUnit('hours', 0); setUnit('minutes', 0); setUnit('seconds', 0);
      countdownLabel.textContent = 'The live discussion is happening now';
      meetingStatus.textContent = 'LIVE NOW';
      meetingStatus.parentElement.classList.add('is-live');
      return;
    }

    meetingStatus.textContent = 'NEXT LIVE DISCUSSION';
    meetingStatus.parentElement.classList.remove('is-live');
    countdownLabel.textContent = 'The next live discussion begins in';

    const diff = Math.max(0, next.date.getTime() - now.getTime());
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    setUnit('days', days);
    setUnit('hours', hours);
    setUnit('minutes', minutes);
    setUnit('seconds', seconds);
  }

  configureLinks();
  updateCountdown();
  timer = window.setInterval(updateCountdown, 1000);
  window.addEventListener('beforeunload', () => window.clearInterval(timer));
})();
