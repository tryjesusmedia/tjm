(() => {
  'use strict';
  window.TJMChronBibleAuth = {
    create(db, siteUrl, getSession) {
      const el = id => document.getElementById(id);
      let mode = 'signin';
      let busy = false;
      let recoveryPending = new URL(location.href).searchParams.get('next') === 'recovery';
      const form = el('email-auth-form');
      const email = el('auth-email');
      const password = el('auth-password');
      const confirm = el('auth-confirm');
      const error = el('auth-error');
      const message = el('auth-message');
      const gate = el('auth-gate');
      const socialButtons = [el('apple-sign-in'), el('google-sign-in')];
      function clearPassword() { password.value = ''; confirm.value = ''; }
      function setBusy(value) {
        busy = value;
        gate.setAttribute('aria-busy', String(value));
        gate.querySelectorAll('button,input').forEach(input => { input.disabled = value; });
      }
      function show(next = 'signin') {
        mode = next; error.textContent = ''; message.textContent = ''; clearPassword();
        const member = getSession();
        const managing = mode === 'password';
        gate.hidden = false;
        el('auth-title').textContent = managing ? 'Your account password' : member ? 'Your sign-in methods' : 'Keep your place everywhere.';
        el('auth-description').textContent = member ? `Account: ${member.user.email || 'Try Jesus member'}. Connect Apple or Google here to keep your existing progress, even when Apple hides your email.` : 'Sign in to save your progress across devices.';
        el('email-auth-title').textContent = ({ signin: 'Sign in with email', signup: 'Create an email account', reset: 'Reset your password', password: 'Set or change password' })[mode];
        el('email-address-field').hidden = managing;
        email.required = !managing;
        el('email-password-field').hidden = mode === 'reset';
        password.required = mode !== 'reset';
        password.autocomplete = mode === 'signup' || managing ? 'new-password' : 'current-password';
        password.minLength = mode === 'signup' || managing ? 6 : 1;
        el('email-confirm-field').hidden = !managing;
        confirm.required = managing;
        el('email-auth-submit').textContent = ({ signin: 'Sign in', signup: 'Create account', reset: 'Send reset link', password: 'Save password' })[mode];
        el('email-auth-toggle').textContent = mode === 'signin' ? 'Create an email account' : 'Back to email sign-in';
        el('email-auth-toggle').hidden = Boolean(member);
        el('email-auth-reset').textContent = member ? 'Set or change email password' : 'Forgot password?';
        el('email-auth-reset').hidden = managing || (!member && mode !== 'signin');
        el('auth-account-hint').hidden = Boolean(member);
        el('continue-without-sign-in').textContent = member ? 'Back to reading' : 'Explore without saving';
        form.hidden = Boolean(member) && !managing;
        socialButtons.forEach(button => { button.hidden = managing; });
        // Google retains its official mark while the verb changes for linking.
        el('google-sign-in').lastChild.textContent = member ? ' Connect Google' : ' Continue with Google';
        (managing ? password : member ? el('email-auth-reset') : email).focus();
      }
      async function social(provider) {
        if (busy) return;
        error.textContent = ''; setBusy(true);
        try {
          const request = { provider, options: { redirectTo: siteUrl } };
          const result = getSession() ? await db.auth.linkIdentity(request) : await db.auth.signInWithOAuth(request);
          if (result.error) throw result.error;
        } catch { error.textContent = 'We could not complete sign-in. Please try again or use another method.'; }
        finally { setBusy(false); }
      }
      el('apple-sign-in').addEventListener('click', () => { void social('apple'); });
      el('google-sign-in').addEventListener('click', () => { void social('google'); });
      el('email-auth-toggle').addEventListener('click', () => { if (!busy) show(mode === 'signin' ? 'signup' : 'signin'); });
      el('email-auth-reset').addEventListener('click', () => { if (!busy) show(getSession() ? 'password' : 'reset'); });
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || !form.reportValidity()) return;
        error.textContent = ''; message.textContent = '';
        if ((mode === 'signup' || mode === 'password') && password.value.length < 6) { error.textContent = 'Use at least 6 characters for your password.'; return; }
        if (mode === 'password' && password.value !== confirm.value) { error.textContent = 'The passwords do not match.'; return; }
        setBusy(true);
        try {
          let result;
          if (mode === 'password') {
            if (!getSession()) throw new Error('A signed-in session is required.');
            result = await db.auth.updateUser({ password: password.value });
          } else if (mode === 'signup') result = await db.auth.signUp({ email: email.value.trim(), password: password.value, options: { emailRedirectTo: siteUrl } });
          else if (mode === 'reset') {
            const redirect = new URL(siteUrl); redirect.searchParams.set('next', 'recovery');
            result = await db.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: redirect.href });
          } else result = await db.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
          if (result.error) throw result.error;
          clearPassword();
          if (mode === 'reset') message.textContent = 'If this email has an account, a reset link will arrive shortly. Check your inbox and spam folder. Open the link in this browser.';
          else if (mode === 'signup' && !result.data.session) message.textContent = 'Check your email to confirm your account. Open the link in this browser, then sign in. If you already have an account, use Sign in or Forgot password.';
          else if (mode === 'password') {
            recoveryPending = false;
            const url = new URL(location.href); url.searchParams.delete('next'); history.replaceState(null, '', url.pathname + url.search);
            message.textContent = 'Password saved. Use your account email and this password to sign in. Your progress stays in this account.';
          } else gate.hidden = true;
        } catch (failure) {
          const passwordErrors = {
            same_password: 'This is already your password. Choose a different password, or sign out and use this password to sign in.',
            reauthentication_needed: 'Please sign out, sign in again with Apple or Google, then return here to save your password.',
            reauthentication_not_valid: 'Your password-change verification expired. Sign in again before trying again.',
            session_not_found: 'Your sign-in session expired. Please sign in again before saving your password.',
            bad_jwt: 'Your sign-in session expired. Please sign in again before saving your password.',
            over_request_rate_limit: 'Please wait a few minutes before trying to save your password again.',
            email_provider_disabled: 'Email sign-in is currently unavailable. Please use Apple or Google.',
          };
          if ((mode === 'signup' || mode === 'password') && failure?.code === 'weak_password') {
            const minimum = /at least (\d{1,3}) characters/i.exec(failure.message || '')?.[1];
            error.textContent = minimum ? `Your account currently requires at least ${minimum} characters.`
              : failure.reasons?.includes('pwned') ? 'This password appeared in a known data breach. Choose a different password.'
              : 'This password does not meet the account password requirements. Try a different password with letters, numbers and a symbol.';
          } else error.textContent = mode === 'password' && passwordErrors[failure?.code]
            || (mode === 'signin' ? 'Sign-in failed. Check your email and password, confirm your email, or choose Forgot password.' : 'We could not complete this request. Try again, or sign in again before changing your password.');
        }
        finally { setBusy(false); }
      });
      // Escape dismisses the optional dialog; never changes account or progress.
      gate.addEventListener('keydown', event => { if (event.key === 'Escape' && !busy) el('continue-without-sign-in').click(); });
      return {
        open: () => show(),
        close: () => { clearPassword(); error.textContent = ''; message.textContent = ''; },
        busy: () => busy,
        authChanged(event, session) {
          if (event === 'PASSWORD_RECOVERY') recoveryPending = true;
          if (event === 'SIGNED_OUT') { recoveryPending = false; clearPassword(); }
          if (session && recoveryPending) show('password');
        },
        resume(session) { if (session && recoveryPending) show('password'); },
      };
    },
  };
})();
