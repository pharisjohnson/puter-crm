/**
 * Team context provider for multi-tenant CRM.
 * Manages current team state, provides team-aware store wrapper,
 * and persists team selection to localStorage.
 */

import { uid } from './util.js';

const TEAM_KV_KEY = 'crm:teams:v1';
const STORAGE_KEY = 'crm:currentTeamId';

/**
 * Normalize a team record from storage.
 */
function normalizeTeam(t) {
  return {
    id: t.id || uid(),
    name: String(t.name || '').trim(),
    createdAt: Number(t.createdAt) || Date.now(),
    updatedAt: Number(t.updatedAt) || Date.now(),
  };
}

/**
 * TeamProvider - manages team context and provides team-aware store access.
 * Usage: import { teamProvider } from './lib/team.js';
 *        const { currentTeamId, teams, setCurrentTeam, createTeam } = teamProvider;
 *        const teamStore = teamProvider.wrapStore(store);
 */
class TeamProvider extends EventTarget {
  constructor() {
    super();
    this._teams = [];
    this._currentTeamId = null;
    this._initialized = false;
  }

  /** Initialize from KV and localStorage. Must be called before store.init(). */
  async init() {
    if (this._initialized) return;

    // Load teams from KV
    try {
      const raw = await puter.kv.get(TEAM_KV_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      this._teams = Array.isArray(parsed) ? parsed.map(normalizeTeam) : [];
    } catch {
      this._teams = [];
    }

    // Restore current team from localStorage, fallback to first team
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && this._teams.some(t => t.id === saved)) {
      this._currentTeamId = saved;
    } else if (this._teams.length > 0) {
      this._currentTeamId = this._teams[0].id;
      localStorage.setItem(STORAGE_KEY, this._currentTeamId);
    }

    this._initialized = true;
    this.dispatchEvent(new CustomEvent('teams-loaded', { detail: { teams: this._teams, currentTeamId: this._currentTeamId } }));
  }

  /** Get all teams. */
  get teams() {
    return [...this._teams].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Get current team ID. */
  get currentTeamId() {
    return this._currentTeamId;
  }

  /** Get current team object. */
  get currentTeam() {
    return this._teams.find(t => t.id === this._currentTeamId) || null;
  }

  /** Check if a team is selected. */
  get hasTeam() {
    return !!this._currentTeamId;
  }

  /** Create a new team. */
  async createTeam(name) {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('Team name is required');

    const team = normalizeTeam({ id: uid(), name: cleanName });
    this._teams.push(team);
    await this._saveTeams();

    if (!this._currentTeamId) {
      await this.setCurrentTeam(team.id);
    }

    this.dispatchEvent(new CustomEvent('team-created', { detail: team }));
    return team;
  }

  /** Update a team's name. */
  async updateTeam(teamId, name) {
    const team = this._teams.find(t => t.id === teamId);
    if (!team) throw new Error('Team not found');

    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('Team name is required');

    team.name = cleanName;
    team.updatedAt = Date.now();
    await this._saveTeams();
    this.dispatchEvent(new CustomEvent('team-updated', { detail: team }));
    return team;
  }

  /** Delete a team. */
  async deleteTeam(teamId) {
    const index = this._teams.findIndex(t => t.id === teamId);
    if (index < 0) throw new Error('Team not found');

    const wasCurrent = this._currentTeamId === teamId;
    this._teams.splice(index, 1);
    await this._saveTeams();

    if (wasCurrent) {
      if (this._teams.length > 0) {
        await this.setCurrentTeam(this._teams[0].id);
      } else {
        this._currentTeamId = null;
        localStorage.removeItem(STORAGE_KEY);
        this.dispatchEvent(new CustomEvent('team-changed', { detail: { teamId: null } }));
      }
    }

    this.dispatchEvent(new CustomEvent('team-deleted', { detail: { teamId } }));
  }

  /** Set the current team. Persists to localStorage. */
  async setCurrentTeam(teamId) {
    const team = this._teams.find(t => t.id === teamId);
    if (!team) throw new Error('Team not found');

    if (this._currentTeamId === teamId) return team;

    this._currentTeamId = teamId;
    localStorage.setItem(STORAGE_KEY, teamId);
    this.dispatchEvent(new CustomEvent('team-changed', { detail: { teamId, team } }));
    return team;
  }

  /** Save teams to KV. */
  async _saveTeams() {
    await puter.kv.set(TEAM_KV_KEY, JSON.stringify(this._teams));
  }

  /**
   * Wrap a store instance to automatically scope all queries to current teamId.
   * Returns a proxy that adds teamId filtering to all collection getters and mutators.
   */
  wrapStore(baseStore) {
    const provider = this;

    // Create a proxy that intercepts property access
    return new Proxy(baseStore, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);

        // Wrap collection getters to filter by teamId
        const collectionProps = ['companies', 'contacts', 'deals', 'activities', 'tasks', 'templates', 'attachments'];
        if (collectionProps.includes(prop) && Array.isArray(value)) {
          const teamId = provider.currentTeamId;
          if (!teamId) return value; // No team selected, return all (or empty for safety)
          return value.filter(item => item.teamId === teamId);
        }

        // Wrap methods that query collections
        if (typeof value === 'function') {
          const methodName = prop.toString();

          // Wrap finder methods to filter by teamId
          const finderMethods = [
            'companyById', 'contactById', 'dealById',
            'activityById', 'taskById', 'templateById',
            'attachmentById'
          ];

          if (finderMethods.includes(methodName)) {
            return (...args) => {
              const result = value.apply(target, args);
              const teamId = provider.currentTeamId;
              if (!teamId || !result) return result;
              return result.teamId === teamId ? result : null;
            };
          }

          // Wrap list/filter methods
          const listMethods = [
            'openTasks', 'tasksByContact', 'tasksByDeal',
            'activitiesByContact', 'activitiesByCompany', 'activitiesByDeal',
            'attachmentsByContact', 'attachmentsByCompany', 'attachmentsByDeal',
            'dealsByContact', 'dealsByCompany',
            'contactsByCompany',
          ];

          if (listMethods.includes(methodName)) {
            return (...args) => {
              const result = value.apply(target, args);
              const teamId = provider.currentTeamId;
              if (!teamId || !Array.isArray(result)) return result;
              return result.filter(item => item.teamId === teamId);
            };
          }

          // Wrap mutators to inject teamId
          const mutatorMethods = [
            'createCompany', 'updateCompany', 'deleteCompany',
            'createContact', 'updateContact', 'deleteContact',
            'createDeal', 'updateDeal', 'deleteDeal',
            'createActivity', 'updateActivity', 'deleteActivity',
            'createTask', 'updateTask', 'deleteTask',
            'createTemplate', 'updateTemplate', 'deleteTemplate',
            'createAttachment', 'updateAttachment', 'deleteAttachment',
          ];

          if (mutatorMethods.includes(methodName)) {
            return async (...args) => {
              const teamId = provider.currentTeamId;
              if (!teamId) throw new Error('No team selected');

              // Inject teamId into the first argument if it's an object
              const newArgs = [...args];
              if (newArgs.length > 0 && newArgs[0] && typeof newArgs[0] === 'object' && !Array.isArray(newArgs[0])) {
                newArgs[0] = { ...newArgs[0], teamId };
              }

              return value.apply(target, newArgs);
            };
          }

          // Wrap bulk operations
          if (methodName === 'importAll') {
            return async (data, options) => {
              const teamId = provider.currentTeamId;
              if (!teamId) throw new Error('No team selected');

              // Add teamId to all records in the import
              const withTeam = { ...data };
              const collections = ['companies', 'contacts', 'deals', 'activities', 'tasks', 'templates', 'attachments'];
              for (const coll of collections) {
                if (Array.isArray(withTeam[coll])) {
                  withTeam[coll] = withTeam[coll].map(item => ({ ...item, teamId }));
                }
              }

              return value.apply(target, [withTeam, options]);
            };
          }

          if (methodName === 'exportAll') {
            return (...args) => {
              const result = value.apply(target, args);
              const teamId = provider.currentTeamId;
              if (!teamId) return result;

              // Filter exported data to current team
              const filtered = { ...result };
              const collections = ['companies', 'contacts', 'deals', 'activities', 'tasks', 'templates', 'attachments'];
              for (const coll of collections) {
                if (Array.isArray(filtered[coll])) {
                  filtered[coll] = filtered[coll].filter(item => item.teamId === teamId);
                }
              }
              return filtered;
            };
          }
        }

        return value;
      }
    });
  }
}

// Singleton instance
export const teamProvider = new TeamProvider();

// Convenience exports
export const { teams, currentTeamId, currentTeam, hasTeam, createTeam, updateTeam, deleteTeam, setCurrentTeam, wrapStore } = teamProvider;
export default teamProvider;