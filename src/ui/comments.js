/**
 * Threaded comments with @mention autocomplete for deals and activities.
 * Integrates with PocketBase crm_comments collection and realtime subscriptions.
 */

import { el, clear, keepingFocus } from './dom.js';
import { icon } from './icons.js';
import { store } from '../lib/store.js';
import { todayISO } from '../lib/util.js';
import { formatDate } from '../lib/util.js';
import { openModal, confirmDialog } from './modal.js';
import { toast } from './toast.js';
import {
  subscribeToComments,
  subscribeToReplies,
  initRealtime
} from '../lib/realtime.js';

/** Active comment components for cleanup. */
const commentComponents = new Map();

/** Mention autocomplete state. */
let mentionState = {
  active: false,
  query: '',
  startPos: 0,
  candidates: [],
  selectedIndex: 0,
  inputEl: null,
  overlayEl: null,
  onSelect: null
};

/** Team members cache for @mentions. */
let teamMembersCache = null;
let teamMembersPromise = null;

/**
 * Initialize comments system (call once at app boot).
 * @param {Object} adapter - PocketBase adapter with .pb property
 */
export function initComments(adapter) {
  initRealtime(adapter);
  // Pre-load team members
  fetchTeamMembers();
}

/**
 * Fetch all team members (users) for @mention autocomplete.
 * @returns {Promise<Array<{id, username, email, avatar}>>}
 */
async function fetchTeamMembers() {
  if (teamMembersCache) return teamMembersCache;
  if (teamMembersPromise) return teamMembersPromise;

  teamMembersPromise = (async () => {
    try {
      // Use PocketBase's users collection via the adapter
      // This assumes the adapter exposes a way to query users
      if (typeof window !== 'undefined' && window.pb) {
        const result = await window.pb.collection('users').getList(1, 100, {
          sort: 'username',
          filter: 'username != ""'
        });
        teamMembersCache = result.items.map(u => ({
          id: u.id,
          username: u.username,
          email: u.email,
          avatar: u.avatar
        }));
        return teamMembersCache;
      }
      // Fallback: get from store if users are synced
      return [];
    } catch (err) {
      console.warn('[comments] Could not fetch team members:', err);
      teamMembersCache = [];
      return [];
    }
  })();

  return teamMembersPromise;
}

/**
 * Filter team members by query for @mention autocomplete.
 * @param {string} query - Search query (without @)
 * @returns {Array} Matched team members
 */
function filterTeamMembers(query) {
  const q = query.toLowerCase();
  return (teamMembersCache || []).filter(m =>
    m.username.toLowerCase().includes(q) ||
    m.email.toLowerCase().includes(q)
  ).slice(0, 10);
}

/**
 * Create a comment thread component for a deal or activity.
 * @param {string} targetType - 'deal' | 'activity'
 * @param {string} targetId - Target record ID
 * @param {Object} [options]
 * @param {boolean} [options.readOnly=false] - Disable editing
 * @param {Function} [options.onCommentChange] - Called when comments change
 * @returns {HTMLElement} Comment thread element
 */
export function createCommentThread(targetType, targetId, options = {}) {
  const { readOnly = false, onCommentChange = null } = options;
  const key = `${targetType}:${targetId}`;

  const root = el('div.comment-thread', { dataset: { targetType, targetId } });
  const list = el('div.comment-list', { role: 'list', 'aria-label': 'Comments' });
  const formWrap = el('div.comment-form-wrap');

  root.append(list, formWrap);

  /** All comments for this target (flat, with parent refs). */
  let comments = [];

  /** Render the comment thread. */
  function render() {
    clear(list);

    // Build tree: top-level comments with nested replies
    const byParent = new Map();
    const roots = [];

    for (const c of comments) {
      const pid = c.parent || 'root';
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(c);
    }

    // Sort each thread by created date
    for (const [, arr] of byParent) {
      arr.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
    }

    const renderComment = (comment, depth = 0) => {
      const item = el('article.comment', {
        role: 'listitem',
        dataset: { commentId: comment.id, depth },
        className: `comment${depth > 0 ? ' comment-reply' : ''}${comment.author === currentUserId() ? ' comment-mine' : ''}`
      });

      const authorName = comment.authorName || comment.author || 'Unknown';
      const authorInitials = getInitials(authorName);
      const timeAgo = formatRelativeTime(comment.created);
      const isMine = comment.author === currentUserId();
      const canEdit = isMine && !readOnly;
      const canDelete = isMine && !readOnly;
      const hasReplies = byParent.has(comment.id) && byParent.get(comment.id).length > 0;
      const replyCount = hasReplies ? byParent.get(comment.id).length : 0;

      item.append(
        el('div.comment-avatar', { 'aria-hidden': 'true' }, authorInitials),
        el('div.comment-body', {},
          el('div.comment-header', {},
            el('span.comment-author', {}, authorName),
            el('span.comment-time', { title: formatDate(comment.created) }, timeAgo),
            canEdit && el('button.icon-btn.comment-edit', {
              html: icon('pencil', 14, 2),
              'aria-label': 'Edit comment',
              onclick: () => openEditForm(comment)
            }),
            canDelete && el('button.icon-btn.comment-delete', {
              html: icon('trash', 14, 2),
              'aria-label': 'Delete comment',
              onclick: () => deleteComment(comment)
            })
          ),
          el('div.comment-content', { html: renderMentions(comment.body) }),
          hasReplies && el('button.comment-toggle-replies', {
            type: 'button',
            'aria-expanded': 'false',
            onclick: (e) => toggleReplies(item, comment.id)
          }, `${replyCount} repl${replyCount === 1 ? 'y' : 'ies'}`),
          // Replies container
          el('div.comment-replies', {
            role: 'list',
            'aria-label': `Replies to ${authorName}`,
            hidden: true,
            dataset: { parentId: comment.id }
          })
        )
      );

      // Render nested replies
      const repliesContainer = item.querySelector('.comment-replies');
      if (hasReplies) {
        for (const reply of byParent.get(comment.id)) {
          repliesContainer.append(renderComment(reply, depth + 1));
        }
      }

      return item;
    };

    for (const comment of byParent.get('root') || []) {
      list.append(renderComment(comment));
    }

    // Render form
    renderForm();
  }

  /** Render the comment form (add new or edit). */
  function renderForm(editingComment = null) {
    clear(formWrap);

    if (readOnly) return;

    const isEditing = !!editingComment;
    const placeholder = isEditing ? 'Edit comment…' : 'Add a comment… (@mention teammates)';

    const textarea = el('textarea.comment-input', {
      placeholder,
      rows: 3,
      'aria-label': isEditing ? 'Edit comment' : 'Add comment',
      value: editingComment?.body || ''
    });

    // Set up mention autocomplete
    setupMentions(textarea);

    const actions = el('div.comment-actions', {},
      el('button.btn.btn-primary.comment-submit', {
        type: 'button',
        onclick: () => submitComment(textarea, editingComment)
      }, isEditing ? 'Save' : 'Post'),
      !isEditing && el('button.btn.btn-ghost.btn-sm', {
        type: 'button',
        onclick: () => { textarea.value = ''; hideMentions(); }
      }, 'Cancel')
    );

    formWrap.append(textarea, actions);

    // Focus
    setTimeout(() => textarea.focus(), 0);
  }

  /** Submit a new comment or update existing. */
  async function submitComment(textarea, editingComment) {
    const body = textarea.value.trim();
    if (!body) return;

    const mentions = extractMentions(body);
    const payload = {
      targetType,
      [targetType]: targetId,
      body,
      mentions: mentions.length ? mentions : undefined,
      parent: editingComment?.parent || null
    };

    try {
      if (editingComment) {
        await updateComment(editingComment.id, { body, mentions: payload.mentions });
      } else {
        await createComment(payload);
      }
      textarea.value = '';
      hideMentions();
      if (!isEditing) renderForm();
    } catch (err) {
      console.error('[comments] Submit failed:', err);
      toast('Couldn\'t save comment. Check your connection', { icon: 'wifiOff' });
    }
  }

  /** Create a new comment via PocketBase. */
  async function createComment(data) {
    if (!window.pb) throw new Error('PocketBase not initialized');
    const record = await window.pb.collection('crm_comments').create(data);
    // Realtime will push the new comment; but for immediate feedback:
    comments.push(record);
    render();
    onCommentChange?.(comments);
  }

  /** Update an existing comment. */
  async function updateComment(id, data) {
    if (!window.pb) throw new Error('PocketBase not initialized');
    const record = await window.pb.collection('crm_comments').update(id, {
      ...data,
      edited: true
    });
    const idx = comments.findIndex(c => c.id === id);
    if (idx >= 0) comments[idx] = record;
    render();
    onCommentChange?.(comments);
  }

  /** Delete a comment. */
  async function deleteComment(comment) {
    const ok = await confirmDialog({
      title: 'Delete this comment?',
      message: 'This cannot be undone. Replies will also be deleted.',
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;

    try {
      if (!window.pb) throw new Error('PocketBase not initialized');
      // Delete comment and all replies recursively
      await deleteCommentTree(comment.id);
      comments = comments.filter(c => c.id !== comment.id && c.parent !== comment.id);
      render();
      onCommentChange?.(comments);
      toast('Comment deleted', { icon: 'trash' });
    } catch (err) {
      console.error('[comments] Delete failed:', err);
      toast('Couldn\'t delete comment. Check your connection', { icon: 'wifiOff' });
    }
  }

  /** Recursively delete a comment and its replies. */
  async function deleteCommentTree(id) {
    if (!window.pb) return;
    const replies = comments.filter(c => c.parent === id);
    for (const r of replies) await deleteCommentTree(r.id);
    await window.pb.collection('crm_comments').delete(id);
  }

  /** Open edit form for a comment. */
  function openEditForm(comment) {
    renderForm(comment);
    const textarea = formWrap.querySelector('.comment-input');
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  }

  /** Toggle replies visibility. */
  function toggleReplies(item, parentId) {
    const btn = item.querySelector('.comment-toggle-replies');
    const repliesEl = item.querySelector('.comment-replies');
    const expanded = btn.getAttribute('aria-expanded') === 'true';

    btn.setAttribute('aria-expanded', String(!expanded));
    repliesEl.hidden = expanded;
    btn.textContent = expanded
      ? `${item.querySelector('.comment-replies').children.length} replies`
      : 'Hide replies';
  }

  /** Load initial comments from PocketBase. */
  async function loadComments() {
    if (!window.pb) return;
    try {
      const field = targetType === 'deal' ? 'deal' : 'activity';
      const result = await window.pb.collection('crm_comments').getList(1, 200, {
        filter: `${field}="${targetId}"`,
        sort: 'created',
        expand: 'author,parent'
      });
      comments = result.items;
      render();
    } catch (err) {
      console.error('[comments] Load failed:', err);
    }
  }

  /** Subscribe to realtime comment updates. */
  function subscribe() {
    const unsub = subscribeToComments(targetType, targetId, (action, record) => {
      if (action === 'create') {
        comments.push(record);
      } else if (action === 'update') {
        const idx = comments.findIndex(c => c.id === record.id);
        if (idx >= 0) comments[idx] = record;
      } else if (action === 'delete') {
        comments = comments.filter(c => c.id !== record.id && c.parent !== record.id);
      }
      render();
      onCommentChange?.(comments);
    });

    // Also subscribe to replies for nested updates
    // (handled by the same subscription since filter includes parent)

    root.destroy = () => {
      unsub();
      hideMentions();
    };
  }

  // Initialize
  loadComments();
  subscribe();

  return root;
}

/**
 * Create a compact comment count badge for list views.
 * @param {string} targetType
 * @param {string} targetId
 * @returns {HTMLElement}
 */
export function createCommentBadge(targetType, targetId) {
  const badge = el('span.comment-badge', {
    dataset: { targetType, targetId },
    role: 'img',
    'aria-label': 'Comments'
  });

  async function update() {
    if (!window.pb) return;
    try {
      const field = targetType === 'deal' ? 'deal' : 'activity';
      const result = await window.pb.collection('crm_comments').getList(1, 1, {
        filter: `${field}="${targetId}"`
      });
      const count = result.totalItems;
      if (count > 0) {
        badge.hidden = false;
        badge.textContent = count > 99 ? '99+' : String(count);
      } else {
        badge.hidden = true;
      }
    } catch {
      badge.hidden = true;
    }
  }

  update();
  // Subscribe to realtime for live count updates
  const unsub = subscribeToComments(targetType, targetId, update);
  badge.destroy = () => unsub();
  return badge;
}

/* ---------- Mention Autocomplete ---------- */

/** Current user ID helper. */
function currentUserId() {
  return window.pb?.authStore?.model?.id || null;
}

/** Get initials from name. */
function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Extract @mentions from text. */
function extractMentions(text) {
  const mentions = [];
  const regex = /@(\w+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const username = match[1];
    const member = (teamMembersCache || []).find(m => m.username === username);
    if (member) {
      mentions.push({ id: member.id, username: member.username });
    }
  }
  return mentions;
}

/** Render @mentions as highlighted links. */
function renderMentions(text) {
  return String(text || '').replace(/@(\w+)/g, (match, username) => {
    const member = (teamMembersCache || []).find(m => m.username === username);
    if (member) {
      return `<span class="mention" data-user-id="${member.id}" title="${member.email}">@${username}</span>`;
    }
    return match;
  });
}

/** Set up mention autocomplete on a textarea. */
function setupMentions(textarea) {
  mentionState.inputEl = textarea;

  textarea.addEventListener('input', (e) => {
    handleMentionInput(e.target);
  });

  textarea.addEventListener('keydown', (e) => {
    handleMentionKeydown(e);
  });

  textarea.addEventListener('blur', () => {
    // Delay to allow click on mention item
    setTimeout(hideMentions, 200);
  });

  // Create overlay if not exists
  if (!mentionState.overlayEl) {
    mentionState.overlayEl = el('div.mention-overlay', { role: 'listbox', 'aria-label': 'Mention suggestions' });
    document.body.append(mentionState.overlayEl);
  }
}

/** Handle input for mention detection. */
function handleMentionInput(textarea) {
  const value = textarea.value;
  const cursorPos = textarea.selectionStart;

  // Find @ at or before cursor
  const beforeCursor = value.slice(0, cursorPos);
  const atIndex = beforeCursor.lastIndexOf('@');

  if (atIndex >= 0 && (atIndex === 0 || /\s/.test(beforeCursor[atIndex - 1]))) {
    const query = beforeCursor.slice(atIndex + 1);
    if (/^[\w.]*$/.test(query)) { // Only alphanumeric, underscore, dot
      showMentions(textarea, query, atIndex, cursorPos);
      return;
    }
  }

  hideMentions();
}

/** Show mention suggestions. */
function showMentions(textarea, query, startPos, cursorPos) {
  const candidates = filterTeamMembers(query);
  if (!candidates.length) {
    hideMentions();
    return;
  }

  mentionState.active = true;
  mentionState.query = query;
  mentionState.startPos = startPos;
  mentionState.candidates = candidates;
  mentionState.selectedIndex = 0;

  // Position overlay near cursor
  const coords = getCursorCoordinates(textarea, cursorPos);
  mentionState.overlayEl.style.left = `${coords.left}px`;
  mentionState.overlayEl.style.top = `${coords.top}px`;

  renderMentionList();
  mentionState.overlayEl.hidden = false;
}

/** Render mention candidate list. */
function renderMentionList() {
  clear(mentionState.overlayEl);
  for (let i = 0; i < mentionState.candidates.length; i++) {
    const m = mentionState.candidates[i];
    const item = el('div.mention-item', {
      role: 'option',
      'aria-selected': i === mentionState.selectedIndex,
      dataset: { index: i, userId: m.id },
      onclick: () => selectMention(m)
    }, el('span.mention-item-avatar', { 'aria-hidden': 'true' }, getInitials(m.username)),
      el('div.mention-item-info', {},
        el('span.mention-item-name', {}, m.username),
        el('span.mention-item-email', {}, m.email)
      ));
    mentionState.overlayEl.append(item);
  }
}

/** Handle keyboard navigation in mention list. */
function handleMentionKeydown(e) {
  if (!mentionState.active) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    mentionState.selectedIndex = Math.min(
      mentionState.selectedIndex + 1,
      mentionState.candidates.length - 1
    );
    renderMentionList();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    mentionState.selectedIndex = Math.max(mentionState.selectedIndex - 1, 0);
    renderMentionList();
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    if (mentionState.candidates[mentionState.selectedIndex]) {
      selectMention(mentionState.candidates[mentionState.selectedIndex]);
    }
  } else if (e.key === 'Escape') {
    hideMentions();
  }
}

/** Select a mention and insert into textarea. */
function selectMention(member) {
  const textarea = mentionState.inputEl;
  if (!textarea) return;

  const value = textarea.value;
  const beforeCursor = value.slice(0, textarea.selectionStart);
  const afterCursor = value.slice(textarea.selectionStart);

  // Replace @query with @username
  const newValue = beforeCursor.slice(0, mentionState.startPos) +
    `@${member.username} ` + afterCursor;

  textarea.value = newValue;
  const newPos = mentionState.startPos + member.username.length + 2;
  textarea.setSelectionRange(newPos, newPos);
  textarea.focus();

  hideMentions();
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Hide mention autocomplete. */
function hideMentions() {
  mentionState.active = false;
  mentionState.query = '';
  mentionState.candidates = [];
  if (mentionState.overlayEl) {
    mentionState.overlayEl.hidden = true;
  }
}

/** Get cursor coordinates in textarea. */
function getCursorCoordinates(textarea, pos) {
  // Create a mirror div to measure text position
  const mirror = document.createElement('div');
  const style = window.getComputedStyle(textarea);
  mirror.style.cssText = `
    position: absolute;
    visibility: hidden;
    white-space: pre-wrap;
    word-wrap: break-word;
    font: ${style.font};
    line-height: ${style.lineHeight};
    padding: ${style.padding};
    border: ${style.border};
    width: ${style.width};
    left: -9999px;
  `;
  mirror.textContent = textarea.value.slice(0, pos);
  document.body.append(mirror);

  const textareaRect = textarea.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;

  document.body.removeChild(mirror);

  return {
    left: textareaRect.left + mirrorRect.width + 2,
    top: textareaRect.top + mirrorRect.height + lineHeight + 4
  };
}

/** Format relative time (e.g., "2m ago", "3h ago"). */
function formatRelativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

/**
 * Add a comment button to a detail view header.
 * @param {HTMLElement} headerEl - Header element
 * @param {string} targetType - 'deal' | 'activity'
 * @param {string} targetId
 * @param {number} count - Current comment count
 */
export function addCommentButton(headerEl, targetType, targetId, count = 0) {
  const btn = el('button.btn.btn-ghost.btn-sm.comment-toggle', {
    html: icon('messageSquare', 15, 2),
    onclick: () => openCommentModal(targetType, targetId),
    'aria-label': count ? `${count} comment${count === 1 ? '' : 's'}` : 'Add comment'
  }, count > 0 ? ` ${count}` : ' Comment');

  headerEl.append(btn);
  return btn;
}

/** Open comments in a modal. */
export function openCommentModal(targetType, targetId) {
  const target = targetType === 'deal' ? store.dealById(targetId) : store.activities.find(a => a.id === targetId);
  const title = target?.name || target?.summary || (targetType === 'deal' ? 'Deal' : 'Activity');

  const modal = openModal({
    title: `Comments on ${title}`,
    size: 'lg',
    content: el('div.comment-modal-body', {})
  });

  const thread = createCommentThread(targetType, targetId);
  modal.querySelector('.comment-modal-body').append(thread);

  modal.addEventListener('close', () => thread.destroy?.());
}