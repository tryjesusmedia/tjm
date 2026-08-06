(() => {
  'use strict';

  const menuToggle = document.getElementById('menuToggle');
  const siteNav = document.getElementById('siteNav');
  const progress = document.getElementById('pageProgress');
  const year = document.getElementById('currentYear');

  if (year) year.textContent = String(new Date().getFullYear());

  if (menuToggle && siteNav) {
    menuToggle.addEventListener('click', () => {
      const open = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', String(!open));
      menuToggle.setAttribute('aria-label', open ? 'Open navigation' : 'Close navigation');
      siteNav.classList.toggle('is-open', !open);
    });

    siteNav.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        siteNav.classList.remove('is-open');
        menuToggle.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && siteNav.classList.contains('is-open')) {
        siteNav.classList.remove('is-open');
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.focus();
      }
    });
  }

  const updateProgress = () => {
    if (!progress) return;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = `${scrollable > 0 ? Math.min(100, (window.scrollY / scrollable) * 100) : 0}%`;
  };
  updateProgress();
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);

  // Change only each data-youtube-url value in index.html.
  const getYouTubeId = (value) => {
    if (!value) return '';
    try {
      const url = new URL(value, window.location.href);
      if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
      if (url.hostname.includes('youtube.com')) {
        if (url.searchParams.get('v')) return url.searchParams.get('v');
        const parts = url.pathname.split('/').filter(Boolean);
        const marker = parts.findIndex((part) => ['embed', 'shorts', 'live'].includes(part));
        if (marker >= 0 && parts[marker + 1]) return parts[marker + 1];
      }
    } catch (_) { return ''; }
    return '';
  };

  document.querySelectorAll('.js-youtube-card[data-youtube-url]').forEach((card) => {
    const url = card.dataset.youtubeUrl.trim();
    const id = getYouTubeId(url);
    if (!url || !id) return;
    card.querySelectorAll('.js-youtube-link').forEach((link) => {
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });
    const thumbnail = card.querySelector('.js-youtube-thumbnail');
    if (thumbnail) thumbnail.src = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
  });


  // Weekly meeting countdown: every Thursday at 8:00 PM in America/New_York.
  // Using an IANA time zone keeps the timer accurate through EST/EDT changes.
  const countdownRoot = document.querySelector('[data-meeting-countdown]');

  if (countdownRoot) {
    const timeZone = 'America/New_York';
    const daysElement = document.getElementById('countdownDays');
    const hoursElement = document.getElementById('countdownHours');
    const minutesElement = document.getElementById('countdownMinutes');
    const secondsElement = document.getElementById('countdownSeconds');
    const dateElement = document.getElementById('nextMeetingDate');

    const zonedPartsFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });

    const displayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });

    const getZonedParts = (date) => {
      const values = {};
      zonedPartsFormatter.formatToParts(date).forEach(({ type, value }) => {
        if (type !== 'literal') values[type] = Number(value);
      });
      return values;
    };

    const zonedDateTimeToUtc = ({ year, month, day, hour, minute = 0, second = 0 }) => {
      const desired = Date.UTC(year, month - 1, day, hour, minute, second);
      let timestamp = desired;

      // Two passes account for the current Eastern offset, including DST.
      for (let pass = 0; pass < 3; pass += 1) {
        const actual = getZonedParts(new Date(timestamp));
        const actualAsUtc = Date.UTC(
          actual.year,
          actual.month - 1,
          actual.day,
          actual.hour,
          actual.minute,
          actual.second
        );
        timestamp += desired - actualAsUtc;
      }

      return new Date(timestamp);
    };

    const getNextMeeting = (now = new Date()) => {
      const easternNow = getZonedParts(now);
      const easternDate = new Date(Date.UTC(
        easternNow.year,
        easternNow.month - 1,
        easternNow.day
      ));
      const thursday = 4;
      let daysUntilThursday = (thursday - easternDate.getUTCDay() + 7) % 7;
      let meetingDate = new Date(easternDate);
      meetingDate.setUTCDate(meetingDate.getUTCDate() + daysUntilThursday);

      let meeting = zonedDateTimeToUtc({
        year: meetingDate.getUTCFullYear(),
        month: meetingDate.getUTCMonth() + 1,
        day: meetingDate.getUTCDate(),
        hour: 20
      });

      if (meeting.getTime() <= now.getTime()) {
        meetingDate.setUTCDate(meetingDate.getUTCDate() + 7);
        meeting = zonedDateTimeToUtc({
          year: meetingDate.getUTCFullYear(),
          month: meetingDate.getUTCMonth() + 1,
          day: meetingDate.getUTCDate(),
          hour: 20
        });
      }

      return meeting;
    };

    let nextMeeting = getNextMeeting();
    if (dateElement) dateElement.textContent = displayFormatter.format(nextMeeting);

    const twoDigits = (value) => String(value).padStart(2, '0');

    const updateCountdown = () => {
      const now = new Date();
      let remaining = nextMeeting.getTime() - now.getTime();

      if (remaining <= 0) {
        nextMeeting = getNextMeeting(new Date(now.getTime() + 1000));
        remaining = nextMeeting.getTime() - now.getTime();
        if (dateElement) dateElement.textContent = displayFormatter.format(nextMeeting);
      }

      const totalSeconds = Math.max(0, Math.floor(remaining / 1000));
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      if (daysElement) daysElement.textContent = twoDigits(days);
      if (hoursElement) hoursElement.textContent = twoDigits(hours);
      if (minutesElement) minutesElement.textContent = twoDigits(minutes);
      if (secondsElement) secondsElement.textContent = twoDigits(seconds);
    };

    updateCountdown();
    window.setInterval(updateCountdown, 1000);
  }


  const journeySets = document.querySelectorAll('.journey-card');
  journeySets.forEach((journey) => {
    journey.addEventListener('toggle', () => {
      if (!journey.open) return;
      journeySets.forEach((other) => {
        if (other !== journey) other.open = false;
      });
    });
  });

  const items = document.querySelectorAll('.reveal');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('is-visible'));
  } else {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    items.forEach((item) => observer.observe(item));
  }
})();
