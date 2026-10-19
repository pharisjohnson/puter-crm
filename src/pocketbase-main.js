import './styles/index.css';
import { el } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { store } from './lib/store.js';
import { initTeamContext, getTeamStore, getTeamProvider } from './lib/team-context.js';
import { shouldOnboard, openOnboarding } from './ui/onboarding.js';
import { applyTheme } from './ui/theme.js';
import { mountShell } from './ui/shell.js';
import { startReminders } from './lib/reminders.js';
import { runBackupIfDue } from './lib/backups.js';
import { pbAuthView } from './views/pb-auth.js';
import { startOfflineSync } from './ui/offline.js';
import './lib/pocketbase-adapter.js';

const appRoot = document.getElementById('app');

function showError(title, message, onRetry) {
  appRoot.replaceChildren(el('div.auth-view', {},
    el('div.empty-icon', { html: icon('wifiOff', 30) }),
    el('h1.auth-title.auth-title-sm', {}, title),
    el('p.auth-sub', {}, message),
    el('button.btn.btn-primary.auth-cta', { onclick: onRetry }, 'Try again')
  ));
}

async function start() {
  registerWorker();

  // Wait for PocketBase adapter to initialize
  await new Promise(r => setTimeout(r, 100));

  if (typeof puter === 'undefined') {
    showError('Couldn\'t initialize PocketBase', 'The PocketBase adapter failed to load. Check your connection and try again.', () => location.reload());
    return;
  }

  let signedIn = false;
  let asked = true;
  try {
    signedIn = await Promise.resolve(puter.auth.isSignedIn());
  } catch {
    asked = false;
    signedIn = false;
  }

  if (!signedIn) {
    if (!asked && await store.outbox().hasLocalData().catch(() => false)) {
      await boot();
      return;
    }
    appRoot.replaceChildren(pbAuthView({ onSignedIn: boot }));
    return;
  }
  await boot();
}

function registerWorker() {
  if (import.meta.env?.DEV) return;
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

async function boot() {
  try {
    // Initialize team context (includes store.init())
    const teamStore = await initTeamContext();
    const teamProvider = getTeamProvider();
  } catch (err) {
    console.error(err);
    showError('Couldn\'t load your data', 'Something went wrong talking to PocketBase.', () => location.reload());
    return;
  }

  const teamStore = getTeamStore();
  const teamProvider = getTeamProvider();

  applyTheme(store.settings.theme || 'system');
  mountShell(appRoot);

  const catchUp = () => { store.refresh().catch(() => {}); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) catchUp(); });
  window.addEventListener('focus', catchUp);

  startReminders(teamStore);
  startOfflineSync();
  runBackupIfDue(teamStore).catch(() => {});

  if (shouldOnboard(teamStore)) openOnboarding();
}

if (import.meta.env?.DEV) window.__crm = { store };

start();