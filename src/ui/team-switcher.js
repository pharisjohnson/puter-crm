/**
 * Team switcher UI component.
 * Renders a dropdown/button in the header for switching between teams.
 */

import { el, clear } from './dom.js';
import { icon } from './icons.js';
import { openModal, closeAllModals } from './modal.js';
import { teamProvider } from '../lib/team.js';
import { store } from '../lib/store.js';

/** CSS classes for the team switcher. */
const CSS = {
  wrapper: 'team-switcher',
  button: 'team-switcher-btn',
  buttonText: 'team-switcher-btn-text',
  buttonIcon: 'team-switcher-btn-icon',
  dropdown: 'team-switcher-dropdown',
  dropdownItem: 'team-switcher-item',
  dropdownItemActive: 'team-switcher-item-active',
  dropdownItemName: 'team-switcher-item-name',
  dropdownItemActions: 'team-switcher-item-actions',
  newTeamBtn: 'team-switcher-new',
  divider: 'team-switcher-divider',
};

/** Create the team switcher button element. */
function createButton(teamProvider) {
  const team = teamProvider.currentTeam;
  const btn = el('button', {
    className: CSS.button,
    type: 'button',
    'aria-haspopup': 'listbox',
    'aria-expanded': 'false',
    'aria-label': team ? `Current team: ${team.name}` : 'No team selected',
    onclick: (e) => {
      e.stopPropagation();
      toggleDropdown(btn, teamProvider);
    },
  }, [
    el('span', { className: CSS.buttonText }, team ? team.name : 'Select team'),
    el('span', { className: CSS.buttonIcon, 'aria-hidden': 'true', html: icon('chevronDown', 14, 2) }),
  ]);

  return btn;
}

/** Create the dropdown menu element. */
function createDropdown(teamProvider, button) {
  const dropdown = el('div', {
    className: CSS.dropdown,
    role: 'listbox',
    'aria-label': 'Teams',
    style: { display: 'none' },
  });

  function render() {
    clear(dropdown);

    // Team items
    for (const team of teamProvider.teams) {
      const isActive = team.id === teamProvider.currentTeamId;
      const item = el('button', {
        className: `${CSS.dropdownItem}${isActive ? ` ${CSS.dropdownItemActive}` : ''}`,
        type: 'button',
        role: 'option',
        'aria-selected': isActive,
        tabindex: isActive ? 0 : -1,
        onclick: () => selectTeam(team.id, teamProvider, button, dropdown),
      }, [
        el('span', { className: CSS.dropdownItemName }, team.name),
        el('div', { className: CSS.dropdownItemActions }, [
          el('button', {
            type: 'button',
            className: 'icon-btn team-switcher-edit',
            'aria-label': `Rename ${team.name}`,
            onclick: (e) => {
              e.stopPropagation();
              renameTeam(team, teamProvider, button, dropdown);
            },
          }, icon('edit', 14, 2)),
          el('button', {
            type: 'button',
            className: 'icon-btn team-switcher-delete',
            'aria-label': `Delete ${team.name}`,
            onclick: (e) => {
              e.stopPropagation();
              deleteTeam(team.id, teamProvider, button, dropdown);
            },
          }, icon('trash', 14, 2)),
        ]),
      ]);
      dropdown.append(item);
    }

    // Divider
    if (teamProvider.teams.length > 0) {
      dropdown.append(el('div', { className: CSS.divider, role: 'separator' }));
    }

    // New team button
    dropdown.append(el('button', {
      className: `${CSS.dropdownItem} ${CSS.newTeamBtn}`,
      type: 'button',
      role: 'option',
      onclick: () => createNewTeam(teamProvider, button, dropdown),
    }, [
      el('span', { 'aria-hidden': 'true', html: icon('plus', 14, 2) }),
      el('span', { className: CSS.dropdownItemName }, 'New team'),
    ]));
  }

  render();
  return { element: dropdown, render };
}

/** Toggle dropdown visibility. */
function toggleDropdown(button, teamProvider) {
  const dropdownEl = button.nextElementSibling;
  if (!dropdownEl) return;

  const isOpen = dropdownEl.style.display !== 'none';
  dropdownEl.style.display = isOpen ? 'none' : 'block';
  button.setAttribute('aria-expanded', !isOpen);

  if (!isOpen) {
    // Position dropdown
    const rect = button.getBoundingClientRect();
    dropdownEl.style.top = `${rect.bottom + 4}px`;
    dropdownEl.style.right = '0';
    dropdownEl.style.minWidth = `${rect.width}px`;

    // Close on outside click
    const closeHandler = (e) => {
      if (!dropdownEl.contains(e.target) && e.target !== button) {
        dropdownEl.style.display = 'none';
        button.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);

    // Keyboard navigation
    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        dropdownEl.style.display = 'none';
        button.setAttribute('aria-expanded', 'false');
        button.focus();
        document.removeEventListener('keydown', keyHandler);
      }
    };
    document.addEventListener('keydown', keyHandler);
  }
}

/** Select a team. */
async function selectTeam(teamId, teamProvider, button, dropdownEl) {
  try {
    await teamProvider.setCurrentTeam(teamId);
    updateButton(button, teamProvider);
    dropdownEl.style.display = 'none';
    button.setAttribute('aria-expanded', 'false');
    button.focus();
  } catch (err) {
    console.error(err);
  }
}

/** Update button text to reflect current team. */
function updateButton(button, teamProvider) {
  const team = teamProvider.currentTeam;
  const textEl = button.querySelector(`.${CSS.buttonText}`);
  if (textEl) textEl.textContent = team ? team.name : 'Select team';
  button.setAttribute('aria-label', team ? `Current team: ${team.name}` : 'No team selected');
}

/** Create a new team via modal. */
function createNewTeam(teamProvider, button, dropdownEl) {
  dropdownEl.style.display = 'none';
  button.setAttribute('aria-expanded', 'false');

  const input = el('input', {
    type: 'text',
    placeholder: 'Team name',
    style: { width: '100%', marginBottom: '8px' },
    autofocus: true,
  });

  const modal = openModal({
    title: 'Create team',
    content: el('div', {}, input),
    onConfirm: async () => {
      const name = input.value.trim();
      if (!name) return false;
      try {
        await teamProvider.createTeam(name);
        // Re-render dropdown
        dropdownEl._renderer?.render();
        updateButton(button, teamProvider);
      } catch (err) {
        console.error(err);
        alert(err.message);
        return false;
      }
      return true;
    },
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') modal.confirm?.();
  });
}

/** Rename a team via modal. */
function renameTeam(team, teamProvider, button, dropdownEl) {
  const input = el('input', {
    type: 'text',
    value: team.name,
    style: { width: '100%', marginBottom: '8px' },
    autofocus: true,
  });

  const modal = openModal({
    title: 'Rename team',
    content: el('div', {}, input),
    onConfirm: async () => {
      const name = input.value.trim();
      if (!name) return false;
      try {
        await teamProvider.updateTeam(team.id, name);
        dropdownEl._renderer?.render();
        updateButton(button, teamProvider);
      } catch (err) {
        console.error(err);
        alert(err.message);
        return false;
      }
      return true;
    },
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') modal.confirm?.();
  });
}

/** Delete a team with confirmation. */
async function deleteTeam(teamId, teamProvider, button, dropdownEl) {
  const team = teamProvider.teams.find(t => t.id === teamId);
  if (!team) return;

  const confirmed = await new Promise(resolve => {
    const modal = openModal({
      title: 'Delete team?',
      message: `Delete "${team.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      confirmVariant: 'danger',
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });

  if (!confirmed) return;

  try {
    await teamProvider.deleteTeam(teamId);
    dropdownEl._renderer?.render();
    updateButton(button, teamProvider);
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}

/**
 * Create and mount the team switcher component.
 * Returns an object with the root element and update method.
 */
export function createTeamSwitcher() {
  let currentButton = null;
  let currentDropdown = null;

  const wrapper = el('div', { className: CSS.wrapper });
  const button = createButton(teamProvider);
  const { element: dropdown, render } = createDropdown(teamProvider, button);
  dropdown._renderer = { render };

  wrapper.append(button, dropdown);
  currentButton = button;
  currentDropdown = dropdown;

  // Listen for team changes to update UI
  teamProvider.addEventListener('team-changed', () => {
    updateButton(currentButton, teamProvider);
    currentDropdown._renderer?.render();
  });
  teamProvider.addEventListener('team-created', () => {
    currentDropdown._renderer?.render();
  });
  teamProvider.addEventListener('team-updated', () => {
    currentDropdown._renderer?.render();
    updateButton(currentButton, teamProvider);
  });
  teamProvider.addEventListener('team-deleted', () => {
    currentDropdown._renderer?.render();
    updateButton(currentButton, teamProvider);
  });
  teamProvider.addEventListener('teams-loaded', () => {
    currentDropdown._renderer?.render();
    updateButton(currentButton, teamProvider);
  });

  return {
    element: wrapper,
    update: () => {
      updateButton(currentButton, teamProvider);
      currentDropdown._renderer?.render();
    },
  };
}

/** Mount team switcher into a container element. */
export function mountTeamSwitcher(container) {
  const switcher = createTeamSwitcher();
  container.append(switcher.element);
  return switcher;
}