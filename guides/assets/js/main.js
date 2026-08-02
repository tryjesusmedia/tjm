(() => {
  const revealItems = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  }

  const previewForm = document.getElementById('request-form-preview');
  const status = document.getElementById('form-status');
  if (previewForm) {
    previewForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!previewForm.checkValidity()) {
        previewForm.reportValidity();
        return;
      }
      if (status) {
        status.textContent = 'The page design is ready. Connect your Omnisend form before publishing to receive submissions.';
      }
    });
  }

  document.querySelectorAll('.accordion details').forEach((detail) => {
    detail.addEventListener('toggle', () => {
      if (!detail.open) return;
      document.querySelectorAll('.accordion details').forEach((other) => {
        if (other !== detail) other.open = false;
      });
    });
  });
})();
