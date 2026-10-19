import { el } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/** PocketBase email/password sign-in page */
export function pbAuthView({ onSignedIn }) {
  let mode = 'signin'; // 'signin' | 'signup'
  let emailEl, passwordEl, confirmEl, cta, errorEl;

  function render() {
    const isSignup = mode === 'signup';
    const title = isSignup ? 'Create account' : 'Sign in';
    const subtitle = isSignup
      ? 'Your data lives in your PocketBase, not on our servers.'
      : 'Leads, deals, follow-ups, and forecasts for founders who do their own selling.';

    cta = el('button.btn.btn-primary.auth-cta', {
      onclick: handleSubmit,
      disabled: false,
    }, title);

    errorEl = el('p.auth-error', { style: 'display:none; color:var(--color-red); margin-top:8px; font-size:.9rem;' });

    emailEl = el('input.auth-input', {
      type: 'email',
      placeholder: 'Email',
      required: true,
      autocomplete: 'email',
      onkeydown: (e) => e.key === 'Enter' && handleSubmit(),
    });

    passwordEl = el('input.auth-input', {
      type: 'password',
      placeholder: 'Password',
      required: true,
      autocomplete: isSignup ? 'new-password' : 'current-password',
      onkeydown: (e) => e.key === 'Enter' && handleSubmit(),
    });

    confirmEl = el('input.auth-input', {
      type: 'password',
      placeholder: 'Confirm password',
      required: true,
      autocomplete: 'new-password',
      style: isSignup ? '' : 'display:none',
      onkeydown: (e) => e.key === 'Enter' && handleSubmit(),
    });

    const toggle = el('button.btn.auth-toggle', {
      onclick: () => {
        mode = isSignup ? 'signin' : 'signup';
        container.replaceChildren(render());
      },
    }, isSignup ? 'Already have an account? Sign in' : 'No account? Create one');

    const form = el('div.auth-form', {},
      emailEl,
      passwordEl,
      confirmEl,
      errorEl,
      cta,
      toggle
    );

    return el('div.auth-view', {},
      el('img.auth-logo', { src: './icon-192.png', alt: '', 'aria-hidden': 'true' }),
      el('h1.auth-title', {}, 'Sales CRM'),
      el('p.auth-sub', {}, subtitle),
      form,
      el('p.auth-note', {}, 'Free • No ads • Self-hosted on ',
        el('a', { href: 'https://pocketbase.io', target: '_blank', rel: 'noopener' }, 'PocketBase'))
    );
  }

  async function handleSubmit() {
    const email = emailEl.value.trim();
    const password = passwordEl.value;
    const confirm = confirmEl.value;

    if (!email || !password) {
      showError('Please enter email and password');
      return;
    }
    if (mode === 'signup' && password !== confirm) {
      showError('Passwords do not match');
      return;
    }

    cta.disabled = true;
    cta.textContent = mode === 'signup' ? 'Creating account…' : 'Signing in…';
    hideError();

    try {
      if (mode === 'signup') {
        await puter.auth.signUp(email, password, confirm);
      } else {
        await puter.auth.signIn(email, password);
      }
      onSignedIn();
    } catch (err) {
      showError(err.message || 'Authentication failed');
      cta.disabled = false;
      cta.textContent = mode === 'signup' ? 'Create account' : 'Sign in';
    }
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }
  function hideError() {
    errorEl.style.display = 'none';
  }

  const container = document.createElement('div');
  container.appendChild(render());
  return container;
}