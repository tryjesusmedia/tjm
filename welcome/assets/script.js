(() => {
  'use strict';

  const config = window.TJM_CONFIG || {};

  const TIME_ZONE = 'America/New_York';
  const DEFAULT_DISCUSSION_DAY = 4; // Sunday = 0, Thursday = 4
  const DEFAULT_DISCUSSION_HOUR = 20; // 8:00 PM Eastern
  const DEFAULT_DISCUSSION_MINUTE = 0;
  const LIVE_DURATION_MINUTES = 60; // Live from 8:00–9:00 PM Eastern

  const zoomButton = document.getElementById('zoomButton');
  const zoomNote = document.getElementById('zoomNote');
  const countdown = document.getElementById('discussionCountdown');
  const countdownLabel = document.getElementById('countdownLabel');
  const meetingStatus = document.getElementById('meetingStatus');

  let timer = null;
  let defaultZoomButtonHtml = '';
  let defaultZoomNoteText = '';

  function configureLinks() {
    const zoomUrl =
      config.zoomUrl || 'https://zoombiblestudy.com/';

    const isDirectZoom =
      /(^|\.)zoom\.us\//i.test(zoomUrl) ||
      /zoom\.us\/j\//i.test(zoomUrl);

    if (zoomButton) {
      zoomButton.href = zoomUrl;

      defaultZoomButtonHtml = isDirectZoom
        ? 'Enter the Live Zoom Call <span aria-hidden="true">↗</span>'
        : 'Join the Live Discussion <span aria-hidden="true">↗</span>';

      zoomButton.innerHTML = defaultZoomButtonHtml;
    }

    if (zoomNote) {
      defaultZoomNoteText = isDirectZoom
        ? 'This button opens the live Zoom meeting room in a new tab.'
        : 'This button opens the discussion access page in a new tab.';

      zoomNote.textContent = defaultZoomNoteText;
    }

    document.querySelectorAll('[data-social]').forEach((link) => {
      const key = link.dataset.social;
      const url = config.social && config.social[key];

      if (url) {
        link.href = url;
        link.hidden = false;
      }
    });

    const year = document.getElementById('year');

    if (year) {
      year.textContent = String(new Date().getFullYear());
    }
  }

  function getZonedParts(date, timeZone = TIME_ZONE) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });

    const values = {};

    formatter.formatToParts(date).forEach((part) => {
      if (part.type !== 'literal') {
        values[part.type] = Number(part.value);
      }
    });

    return values;
  }

  function getTimeZoneOffsetMs(date, timeZone = TIME_ZONE) {
    const parts = getZonedParts(date, timeZone);

    const zonedTimeAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );

    return zonedTimeAsUtc - date.getTime();
  }

  function zonedDateTimeToUtc(
    year,
    month,
    day,
    hour,
    minute,
    second = 0,
    timeZone = TIME_ZONE
  ) {
    const wallTimeAsUtc = Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      second
    );

    let utcGuess = wallTimeAsUtc;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const offset = getTimeZoneOffsetMs(
        new Date(utcGuess),
        timeZone
      );

      const correctedGuess = wallTimeAsUtc - offset;

      if (correctedGuess === utcGuess) {
        break;
      }

      utcGuess = correctedGuess;
    }

    return new Date(utcGuess);
  }

  function getDiscussionSettings() {
    return {
      day: Number.isInteger(config.discussionDay)
        ? config.discussionDay
        : DEFAULT_DISCUSSION_DAY,

      hour: Number.isFinite(config.discussionHourEastern)
        ? config.discussionHourEastern
        : DEFAULT_DISCUSSION_HOUR,

      minute: Number.isFinite(config.discussionMinuteEastern)
        ? config.discussionMinuteEastern
        : DEFAULT_DISCUSSION_MINUTE
    };
  }

  function getDiscussionState(now = new Date()) {
    const settings = getDiscussionSettings();
    const eastern = getZonedParts(now);

    const easternCivilDate = new Date(
      Date.UTC(
        eastern.year,
        eastern.month - 1,
        eastern.day
      )
    );

    const weekday = easternCivilDate.getUTCDay();

    const currentSeconds =
      eastern.hour * 3600 +
      eastern.minute * 60 +
      eastern.second;

    const meetingStartSeconds =
      settings.hour * 3600 +
      settings.minute * 60;

    const meetingEndSeconds =
      meetingStartSeconds +
      LIVE_DURATION_MINUTES * 60;

    const isDiscussionDay =
      weekday === settings.day;

    const isLive =
      isDiscussionDay &&
      currentSeconds >= meetingStartSeconds &&
      currentSeconds < meetingEndSeconds;

    if (isLive) {
      return {
        live: true,
        target: null
      };
    }

    let daysUntilDiscussion =
      (settings.day - weekday + 7) % 7;

    /*
     * At 9:00 PM Eastern on Thursday,
     * begin counting down to the following Thursday.
     */
    if (
      isDiscussionDay &&
      currentSeconds >= meetingEndSeconds
    ) {
      daysUntilDiscussion = 7;
    }

    const targetCivilDate =
      new Date(easternCivilDate);

    targetCivilDate.setUTCDate(
      targetCivilDate.getUTCDate() +
      daysUntilDiscussion
    );

    const target = zonedDateTimeToUtc(
      targetCivilDate.getUTCFullYear(),
      targetCivilDate.getUTCMonth() + 1,
      targetCivilDate.getUTCDate(),
      settings.hour,
      settings.minute
    );

    return {
      live: false,
      target
    };
  }

  function setUnit(unit, value) {
    if (!countdown) {
      return;
    }

    const element = countdown.querySelector(
      `[data-unit="${unit}"]`
    );

    if (element) {
      element.textContent =
        String(value).padStart(2, '0');
    }
  }

  function setCountdownValues(
    days,
    hours,
    minutes,
    seconds
  ) {
    setUnit('days', days);
    setUnit('hours', hours);
    setUnit('minutes', minutes);
    setUnit('seconds', seconds);
  }

  function showLiveState() {
    setCountdownValues(0, 0, 0, 0);

    if (countdownLabel) {
      countdownLabel.textContent =
        'The live discussion is happening now';
    }

    if (meetingStatus) {
      meetingStatus.textContent = 'LIVE NOW';

      if (meetingStatus.parentElement) {
        meetingStatus.parentElement.classList.add(
          'is-live'
        );
      }
    }

    if (countdown) {
      countdown.classList.add('is-live');
    }

    if (zoomButton) {
      zoomButton.innerHTML =
        'Join the Discussion Now <span aria-hidden="true">↗</span>';
    }

    if (zoomNote) {
      zoomNote.textContent =
        'The discussion is live until 9:00 PM Eastern.';
    }
  }

  function showCountdownState(target, now) {
    if (countdownLabel) {
      countdownLabel.textContent =
        'The next live discussion begins in';
    }

    if (meetingStatus) {
      meetingStatus.textContent =
        'NEXT LIVE DISCUSSION';

      if (meetingStatus.parentElement) {
        meetingStatus.parentElement.classList.remove(
          'is-live'
        );
      }
    }

    if (countdown) {
      countdown.classList.remove('is-live');
    }

    if (
      zoomButton &&
      defaultZoomButtonHtml
    ) {
      zoomButton.innerHTML =
        defaultZoomButtonHtml;
    }

    if (
      zoomNote &&
      defaultZoomNoteText
    ) {
      zoomNote.textContent =
        defaultZoomNoteText;
    }

    const remainingMs = Math.max(
      0,
      target.getTime() - now.getTime()
    );

    const totalSeconds =
      Math.floor(remainingMs / 1000);

    const days =
      Math.floor(totalSeconds / 86400);

    const hours =
      Math.floor(
        (totalSeconds % 86400) / 3600
      );

    const minutes =
      Math.floor(
        (totalSeconds % 3600) / 60
      );

    const seconds =
      totalSeconds % 60;

    setCountdownValues(
      days,
      hours,
      minutes,
      seconds
    );
  }

  function updateCountdown() {
    if (!countdown) {
      return;
    }

    const now = new Date();
    const state = getDiscussionState(now);

    if (state.live) {
      showLiveState();
    } else {
      showCountdownState(
        state.target,
        now
      );
    }
  }

  function configureGuideTracks() {
    const guideTracks =
      document.querySelectorAll(
        '.guide-library .guide-track'
      );

    guideTracks.forEach((track) => {
      track.addEventListener('toggle', () => {
        if (!track.open) {
          return;
        }

        guideTracks.forEach((otherTrack) => {
          if (otherTrack !== track) {
            otherTrack.open = false;
          }
        });
      });
    });
  }

  configureLinks();
  configureGuideTracks();
  updateCountdown();

  timer = window.setInterval(
    updateCountdown,
    1000
  );

  window.addEventListener(
    'beforeunload',
    () => {
      if (timer) {
        window.clearInterval(timer);
      }
    }
  );
})();
