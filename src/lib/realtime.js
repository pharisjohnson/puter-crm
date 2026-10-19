/**
 * PocketBase realtime subscriptions for live collaboration.
 *
 * Provides subscribe/unsubscribe for collections and records,
 * plus a lightweight presence heartbeat for "who's viewing" indicators.
 */

import { store } from '../lib/store.js';

/** Active subscriptions keyed by channel name. */
const subscriptions = new Map();

/** Presence heartbeats keyed by record (type:id). */
const presenceHeartbeats = new Map();

/** Current user's presence registrations. */
const myPresence = new Map();

/** Debounced presence broadcast timer. */
let presenceTimer = null;

/** PocketBase realtime client (initialized from pocketbase-adapter). */
let pb = null;

/** Initialize the realtime client from the PocketBase adapter. */
export function initRealtime(adapter) {
  if (adapter?.pb) {
    pb = adapter.pb;
  } else if (typeof window !== 'undefined' && window.pb) {
    pb = window.pb;
  }
  return !!pb;
}

/**
 * Subscribe to realtime changes on a collection.
 * @param {string} collection - Collection name (e.g., 'crm_deals', 'crm_activities', 'crm_comments')
 * @param {Function} callback - Called with (event, record) on each change
 * @param {Object} [options] - Filter options
 * @param {string} [options.filter] - PocketBase filter string
 * @returns {Function} Unsubscribe function
 */
export function subscribe(collection, callback, options = {}) {
  if (!pb) {
    console.warn('[realtime] PocketBase not initialized, call initRealtime() first');
    return () => {};
  }

  const channel = options.filter ? `${collection}:${options.filter}` : collection;
  const key = `${channel}:${callback.toString().slice(0, 50)}`;

  if (subscriptions.has(key)) {
    return subscriptions.get(key).unsubscribe;
  }

  const unsubscribe = pb.collection(collection).subscribe('*', (event) => {
    // event: { action: 'create'|'update'|'delete', record: {...} }
    try {
      callback(event.action, event.record);
    } catch (err) {
      console.error(`[realtime] Error in ${collection} subscription:`, err);
    }
  }, options.filter);

  const sub = { unsubscribe, collection, channel };
  subscriptions.set(key, sub);

  // Also listen for store changes to keep local state in sync
  const storeHandler = () => {
    // Store handles its own refresh from KV; realtime is for cross-tab/device sync
  };
  store.addEventListener('change', storeHandler);

  return () => {
    sub.unsubscribe();
    subscriptions.delete(key);
    store.removeEventListener('change', storeHandler);
  };
}

/**
 * Subscribe to a specific record by ID.
 * @param {string} collection - Collection name
 * @param {string} recordId - Record ID
 * @param {Function} callback - Called with (event, record)
 * @returns {Function} Unsubscribe function
 */
export function subscribeToRecord(collection, recordId, callback) {
  return subscribe(collection, (action, record) => {
    if (record.id === recordId) {
      callback(action, record);
    }
  }, { filter: `id="${recordId}"` });
}

/**
 * Subscribe to comments on a target (deal or activity).
 * @param {string} targetType - 'deal' | 'activity'
 * @param {string} targetId - Target record ID
 * @param {Function} callback - Called with (action, comment)
 * @returns {Function} Unsubscribe function
 */
export function subscribeToComments(targetType, targetId, callback) {
  const field = targetType === 'deal' ? 'deal' : 'activity';
  return subscribe('crm_comments', callback, {
    filter: `${field}="${targetId}"`
  });
}

/**
 * Subscribe to threaded comments (replies to a parent comment).
 * @param {string} parentId - Parent comment ID
 * @param {Function} callback - Called with (action, comment)
 * @returns {Function} Unsubscribe function
 */
export function subscribeToReplies(parentId, callback) {
  return subscribe('crm_comments', callback, {
    filter: `parent="${parentId}"`
  });
}

/**
 * Start a presence heartbeat for a record.
 * Broadcasts "user X is viewing record Y" every 30s.
 * @param {string} recordType - 'deal' | 'activity' | 'contact' | 'company'
 * @param {string} recordId - Record ID
 * @returns {Function} Stop function
 */
export function startPresence(recordType, recordId) {
  if (!pb?.authStore?.model?.id) return () => {};

  const key = `${recordType}:${recordId}`;
  const userId = pb.authStore.model.id;
  const username = pb.authStore.model.username || pb.authStore.model.email || 'Unknown';

  // Register this presence
  myPresence.set(key, { recordType, recordId, userId, username, at: Date.now() });

  // Broadcast immediately
  broadcastPresence(key, 'join');

  // Heartbeat every 30 seconds
  const interval = setInterval(() => {
    if (myPresence.has(key)) {
      myPresence.get(key).at = Date.now();
      broadcastPresence(key, 'heartbeat');
    }
  }, 30000);

  // Clean up on page unload/visibility change
  const cleanup = () => stopPresence(recordType, recordId);
  window.addEventListener('beforeunload', cleanup);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      broadcastPresence(key, 'leave');
    } else if (myPresence.has(key)) {
      broadcastPresence(key, 'join');
    }
  });

  return cleanup;
}

/**
 * Stop a presence heartbeat.
 * @param {string} recordType - Record type
 * @param {string} recordId - Record ID
 */
export function stopPresence(recordType, recordId) {
  const key = `${recordType}:${recordId}`;
  if (myPresence.has(key)) {
    broadcastPresence(key, 'leave');
    myPresence.delete(key);
  }
}

/**
 * Broadcast presence event via a lightweight KV key or realtime.
 * In a real deployment, this would use a dedicated presence collection or Realtime presence.
 * Here we use a simple KV-based approach for simplicity.
 */
function broadcastPresence(key, action) {
  // For now, use a simple in-memory broadcast via storage event
  // In production, you'd use PocketBase realtime presence or a dedicated collection
  const payload = {
    key,
    action,
    user: pb?.authStore?.model ? {
      id: pb.authStore.model.id,
      username: pb.authStore.model.username || pb.authStore.model.email,
      avatar: pb.authStore.model.avatar || null
    } : null,
    at: Date.now()
  };

  // Broadcast to other tabs via localStorage
  try {
    localStorage.setItem(`crm:presence:${key}`, JSON.stringify(payload));
    // Trigger storage event for other tabs
    window.dispatchEvent(new StorageEvent('storage', {
      key: `crm:presence:${key}`,
      newValue: JSON.stringify(payload)
    }));
  } catch {
    // Ignore quota errors
  }
}

/**
 * Subscribe to presence updates for a record.
 * @param {string} recordType - Record type
 * @param {string} recordId - Record ID
 * @param {Function} callback - Called with ({ user, action, at })
 * @returns {Function} Unsubscribe function
 */
export function subscribeToPresence(recordType, recordId, callback) {
  const key = `${recordType}:${recordId}`;

  const handler = (e) => {
    if (e.key === `crm:presence:${key}` && e.newValue) {
      try {
        const data = JSON.parse(e.newValue);
        // Don't notify about our own presence
        const myId = pb?.authStore?.model?.id;
        if (data.user?.id !== myId) {
          callback(data);
        }
      } catch {
        // Ignore parse errors
      }
    }
  };

  window.addEventListener('storage', handler);

  // Also check for existing presence on subscribe
  const existing = localStorage.getItem(`crm:presence:${key}`);
  if (existing) {
    try {
      const data = JSON.parse(existing);
      const myId = pb?.authStore?.model?.id;
      if (data.user?.id !== myId && data.action !== 'leave') {
        // Only show recent presence (within last 2 minutes)
        if (Date.now() - data.at < 120000) {
          callback(data);
        }
      }
    } catch {
      // Ignore
    }
  }

  return () => window.removeEventListener('storage', handler);
}

/**
 * Get current presence for a record (from localStorage).
 * @param {string} recordType
 * @param {string} recordId
 * @returns {Array} Array of { user, action, at }
 */
export function getPresence(recordType, recordId) {
  const key = `${recordType}:${recordId}`;
  const results = [];

  // Scan localStorage for presence keys (prefix match)
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(`crm:presence:${key}`)) {
      try {
        const data = JSON.parse(localStorage.getItem(k));
        const myId = pb?.authStore?.model?.id;
        if (data.user?.id !== myId && data.action !== 'leave') {
          if (Date.now() - data.at < 120000) {
            results.push(data);
          }
        }
      } catch {
        // Ignore
      }
    }
  }

  return results;
}

/**
 * Unsubscribe from all active subscriptions.
 */
export function unsubscribeAll() {
  for (const sub of subscriptions.values()) {
    sub.unsubscribe();
  }
  subscriptions.clear();

  // Stop all presence heartbeats
  for (const key of myPresence.keys()) {
    const [recordType, recordId] = key.split(':');
    stopPresence(recordType, recordId);
  }
}

/** Check if realtime is connected. */
export function isConnected() {
  return pb?.realtime?.isConnected ?? false;
}

/** Listen for connection status changes. */
export function onConnectionChange(callback) {
  if (!pb?.realtime) return () => {};
  return pb.realtime.onStatusChange(callback);
}