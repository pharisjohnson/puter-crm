/**
 * Presence indicators - shows who's viewing a record.
 * Lightweight avatars with tooltip names, updates via realtime presence.
 */

import { el } from './dom.js';
import { icon } from './icons.js';
import { store } from '../lib/store.js';
import {
  subscribeToPresence,
  startPresence,
  stopPresence,
  getPresence,
  initRealtime
} from '../lib/realtime.js';

/** Active presence components keyed by record key. */
const presenceComponents = new Map();

/** Current user ID for filtering self. */
let currentUserId = null;

/**
 * Initialize presence system with current user.
 * @param {Object} user - PocketBase user record
 */
export function initPresence(user) {
  currentUserId = user?.id || null;
  // Initialize realtime if not already done
  if (typeof window !== 'undefined' && window.pb) {
    initRealtime({ pb: window.pb });
  }
}

/**
 * Create a presence indicator component for a record.
 * @param {string} recordType - 'deal' | 'activity' | 'contact' | 'company'
 * @param {string} recordId - Record ID
 * @param {Object} [options]
 * @param {number} [options.maxAvatars=3] - Max avatars to show before +N
 * @param {boolean} [options.showSelf=false] - Whether to include current user
 * @returns {HTMLElement} Presence indicator element
 */
export function createPresenceIndicator(recordType, recordId, options = {}) {
  const { maxAvatars = 3, showSelf = false } = options;
  const key = `${recordType}:${recordId}`;

  const container = el('div.presence-indicator', {
    dataset: { recordType, recordId },
    role: 'group',
    'aria-label': 'People viewing this record'
  });

  const avatarsWrap = el('div.presence-avatars', { 'aria-hidden': 'true' });
  const tooltip = el('div.presence-tooltip', { role: 'tooltip' });

  container.append(avatarsWrap, tooltip);

  /** Render current presence avatars. */
  function render() {
    const presences = getPresence(recordType, recordId)
      .filter(p => showSelf || p.user?.id !== currentUserId)
      .sort((a, b) => b.at - a.at); // Most recent first

    clear(avatarsWrap);
    clear(tooltip);

    if (!presences.length) {
      container.hidden = true;
      return;
    }

    container.hidden = false;

    const showCount = Math.min(presences.length, maxAvatars);
    const overflow = presences.length - showCount;

    for (let i = 0; i < showCount; i++) {
      const p = presences[i];
      const avatar = el('span.presence-avatar', {
        title: p.user?.username || p.user?.email || 'Someone',
        style: { zIndex: maxAvatars - i }
      }, initials(p.user?.username || p.user?.email || '?'));
      avatarsWrap.append(avatar);
    }

    if (overflow > 0) {
      const more = el('span.presence-avatar.presence-more', {
        title: `${overflow} more viewing`
      }, `+${overflow}`);
      avatarsWrap.append(more);
    }

    // Tooltip with names
    const names = presences.slice(0, 10).map(p =>
      p.user?.username || p.user?.email || 'Someone'
    );
    if (names.length) {
      tooltip.textContent = names.join(', ');
    }
  }

  /** Start presence tracking for this record. */
  function start() {
    // Start our own heartbeat
    const cleanup = startPresence(recordType, recordId);

    // Subscribe to others' presence
    const unsub = subscribeToPresence(recordType, recordId, (data) => {
      render();
    });

    // Store cleanup functions
    presenceComponents.set(key, { cleanup, unsub, render });

    // Initial render
    render();
  }

  /** Stop presence tracking. */
  function stop() {
    const comp = presenceComponents.get(key);
    if (comp) {
      comp.cleanup?.();
      comp.unsub?.();
      presenceComponents.delete(key);
    }
    stopPresence(recordType, recordId);
    container.hidden = true;
  }

  // Auto-start if visible
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        start();
      } else {
        stop();
      }
    }
  }, { rootMargin: '100px' });

  observer.observe(container);

  // Expose control functions
  container.start = start;
  container.stop = stop;
  container.render = render;
  container.destroy = () => {
    observer.disconnect();
    stop();
  };

  return container;
}

/**
 * Create a compact presence badge for list views.
 * Shows count only, expands on hover.
 * @param {string} recordType
 * @param {string} recordId
 * @returns {HTMLElement}
 */
export function createPresenceBadge(recordType, recordId) {
  const key = `${recordType}:${recordId}`;
  const badge = el('span.presence-badge', {
    dataset: { recordType, recordId },
    role: 'img',
    'aria-label': 'Viewers'
  });

  function update() {
    const presences = getPresence(recordType, recordId)
      .filter(p => p.user?.id !== currentUserId && p.action !== 'leave');
    const count = presences.length;

    if (count === 0) {
      badge.hidden = true;
      return;
    }

    badge.hidden = false;
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.title = presences.map(p => p.user?.username || 'Someone').join(', ');
  }

  // Subscribe to updates
  const unsub = subscribeToPresence(recordType, recordId, update);
  update();

  badge.destroy = () => unsub();
  return badge;
}

/**
 * Create a detailed presence panel for deal/activity detail views.
 * Shows avatars with names and "X minutes ago" timestamps.
 * @param {string} recordType
 * @param {string} recordId
 * @returns {HTMLElement}
 */
export function createPresencePanel(recordType, recordId) {
  const panel = el('div.presence-panel', { role: 'region', 'aria-label': 'Active viewers' });
  const list = el('div.presence-list');
  panel.append(list);

  function render() {
    const presences = getPresence(recordType, recordId)
      .filter(p => p.user?.id !== currentUserId && p.action !== 'leave')
      .sort((a, b) => b.at - a.at);

    clear(list);

    if (!presences.length) {
      panel.hidden = true;
      return;
    }

    panel.hidden = false;

    for (const p of presences) {
      const mins = Math.max(1, Math.floor((Date.now() - p.at) / 60000));
      const timeAgo = mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;

      const item = el('div.presence-item', {},
        el('span.presence-item-avatar', { 'aria-hidden': 'true' }, initials(p.user?.username || '?')),
        el('div.presence-item-info', {},
          el('span.presence-item-name', {}, p.user?.username || p.user?.email || 'Someone'),
          el('span.presence-item-time', {}, timeAgo)
        ),
        el('span.presence-dot', { 'aria-hidden': 'true', dataset: { status: 'active' } })
      );
      list.append(item);
    }
  }

  const unsub = subscribeToPresence(recordType, recordId, render);
  render();

  panel.destroy = () => unsub();
  return panel;
}

/** Get initials from a name. */
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Clear element children. */
function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * Hook to add presence to a detail view header.
 * Call from dealDetail or activity detail render.
 * @param {HTMLElement} headerEl - Header element to append to
 * @param {string} recordType
 * @param {string} recordId
 */
export function addPresenceToHeader(headerEl, recordType, recordId) {
  const indicator = createPresenceIndicator(recordType, recordId, { maxAvatars: 4 });
  headerEl.append(indicator);
  return indicator;
}