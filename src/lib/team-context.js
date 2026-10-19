/**
 * Team context - provides the team-wrapped store after initialization.
 * Views import { teamStore, teamProvider } from './team-context.js'
 */
import { teamProvider, wrapStore } from './team.js';
import { store } from './store.js';

// Re-export constants from store
export { CONTACT_STATUSES, LEAD_SOURCES, ACTIVITY_TYPES, activityTypeInfo, repeatLabel } from './store.js';

let _teamStore = null;
let _initialized = false;

/** Initialize team context - must be called once at app boot. */
export async function initTeamContext() {
  if (_initialized) return _teamStore;
  
  await teamProvider.init();
  await store.init();
  _teamStore = wrapStore(store);
  _initialized = true;
  
  return _teamStore;
}

/** Get the team-wrapped store (filters by current teamId). */
export function getTeamStore() {
  if (!_initialized) {
    throw new Error('Team context not initialized. Call initTeamContext() first.');
  }
  return _teamStore;
}

/** Team-wrapped store (available after initTeamContext() resolves). */
export const teamStore = {
  get companies() { return getTeamStore().companies; },
  get contacts() { return getTeamStore().contacts; },
  get deals() { return getTeamStore().deals; },
  get activities() { return getTeamStore().activities; },
  get tasks() { return getTeamStore().tasks; },
  get templates() { return getTeamStore().templates; },
  get attachments() { return getTeamStore().attachments; },
  get settings() { return getTeamStore().settings; },
  get user() { return getTeamStore().user; },
  get outbox() { return getTeamStore().outbox; },
  companyById: (...args) => getTeamStore().companyById(...args),
  contactById: (...args) => getTeamStore().contactById(...args),
  dealById: (...args) => getTeamStore().dealById(...args),
  activityById: (...args) => getTeamStore().activityById(...args),
  taskById: (...args) => getTeamStore().taskById(...args),
  templateById: (...args) => getTeamStore().templateById(...args),
  attachmentById: (...args) => getTeamStore().attachmentById(...args),
  openTasks: (...args) => getTeamStore().openTasks(...args),
  tasksByContact: (...args) => getTeamStore().tasksByContact(...args),
  tasksByDeal: (...args) => getTeamStore().tasksByDeal(...args),
  activitiesByContact: (...args) => getTeamStore().activitiesByContact(...args),
  activitiesByCompany: (...args) => getTeamStore().activitiesByCompany(...args),
  activitiesByDeal: (...args) => getTeamStore().activitiesByDeal(...args),
  attachmentsByContact: (...args) => getTeamStore().attachmentsByContact(...args),
  attachmentsByCompany: (...args) => getTeamStore().attachmentsByCompany(...args),
  attachmentsByDeal: (...args) => getTeamStore().attachmentsByDeal(...args),
  dealsByContact: (...args) => getTeamStore().dealsByContact(...args),
  dealsByCompany: (...args) => getTeamStore().dealsByCompany(...args),
  contactsByCompany: (...args) => getTeamStore().contactsByCompany(...args),
  createCompany: (...args) => getTeamStore().createCompany(...args),
  updateCompany: (...args) => getTeamStore().updateCompany(...args),
  deleteCompany: (...args) => getTeamStore().deleteCompany(...args),
  createContact: (...args) => getTeamStore().createContact(...args),
  updateContact: (...args) => getTeamStore().updateContact(...args),
  deleteContact: (...args) => getTeamStore().deleteContact(...args),
  createDeal: (...args) => getTeamStore().createDeal(...args),
  updateDeal: (...args) => getTeamStore().updateDeal(...args),
  deleteDeal: (...args) => getTeamStore().deleteDeal(...args),
  createActivity: (...args) => getTeamStore().createActivity(...args),
  updateActivity: (...args) => getTeamStore().updateActivity(...args),
  deleteActivity: (...args) => getTeamStore().deleteActivity(...args),
  createTask: (...args) => getTeamStore().createTask(...args),
  updateTask: (...args) => getTeamStore().updateTask(...args),
  deleteTask: (...args) => getTeamStore().deleteTask(...args),
  createTemplate: (...args) => getTeamStore().createTemplate(...args),
  updateTemplate: (...args) => getTeamStore().updateTemplate(...args),
  deleteTemplate: (...args) => getTeamStore().deleteTemplate(...args),
  createAttachment: (...args) => getTeamStore().createAttachment(...args),
  updateAttachment: (...args) => getTeamStore().updateAttachment(...args),
  deleteAttachment: (...args) => getTeamStore().deleteAttachment(...args),
  importAll: (...args) => getTeamStore().importAll(...args),
  exportAll: (...args) => getTeamStore().exportAll(...args),
  addEventListener: (...args) => getTeamStore().addEventListener(...args),
  removeEventListener: (...args) => getTeamStore().removeEventListener(...args),
  refresh: (...args) => getTeamStore().refresh(...args),
  bulkUpdateContacts: (...args) => getTeamStore().bulkUpdateContacts(...args),
  bulkDelete: (...args) => getTeamStore().bulkDelete(...args),
  bulkTag: (...args) => getTeamStore().bulkTag(...args),
  lastContactedAt: (...args) => getTeamStore().lastContactedAt(...args),
  dealsFor: (...args) => getTeamStore().dealsFor(...args),
  customFields: (...args) => getTeamStore().customFields(...args),
};

/** Get the base store (unfiltered, for admin/superuser operations). */
export function getBaseStore() {
  return store;
}

/** Get the team provider for team management UI. */
export function getTeamProvider() {
  return teamProvider;
}

/** Current team ID (reactive via teamProvider events). */
export function getCurrentTeamId() {
  return teamProvider.currentTeamId;
}

/** Current team object. */
export function getCurrentTeam() {
  return teamProvider.currentTeam;
}

/** All teams. */
export function getTeams() {
  return teamProvider.teams;
}

/** Check if user has permission for action on record. */
export function canCreate(collection) {
  // In a real app, check user's role in current team
  // For now: any team member can create
  return teamProvider.hasTeam;
}

export function canRead(record) {
  if (!record) return false;
  if (!teamProvider.currentTeamId) return false;
  return record.teamId === teamProvider.currentTeamId;
}

export function canUpdate(record) {
  if (!record) return false;
  if (!teamProvider.currentTeamId) return false;
  // Owner or admin can update
  return record.teamId === teamProvider.currentTeamId;
}

export function canDelete(record) {
  if (!record) return false;
  if (!teamProvider.currentTeamId) return false;
  // Owner or admin can delete
  return record.teamId === teamProvider.currentTeamId;
}

/** Ownership badge info for a record. */
export function getOwnershipInfo(record) {
  if (!record || !teamProvider.currentTeamId) return { label: 'Unknown', className: '' };
  
  if (record.teamId !== teamProvider.currentTeamId) {
    return { label: 'Other team', className: 'ownership-other' };
  }
  
  // Could check if current user is the owner
  // For now: all team members see "Team"
  return { label: 'Team', className: 'ownership-team' };
}

/** Listen for team changes. */
export function onTeamChange(callback) {
  teamProvider.addEventListener('team-changed', callback);
  return () => teamProvider.removeEventListener('team-changed', callback);
}

export { teamProvider, wrapStore } from './team.js';
export { store } from './store.js';