# Collaboration Feature Specification

## Overview

Add team-based collaboration to the CRM with role-based access control (RBAC), team membership management, and real-time subscriptions for multi-user editing.

---

## 1. Data Models

### 1.1 New Collections

#### `crm_teams`
Represents a team within the organization. A user can belong to multiple teams.

| Field | Type | Description |
|-------|------|-------------|
| `id` | text (15) | Primary key, auto-generated |
| `name` | text | Team display name (required, unique per org) |
| `description` | text | Optional team description |
| `owner` | relation (users) | User who created/owns the team (required) |
| `avatar` | file | Optional team avatar/logo |
| `settings` | json | Team-level settings: `{ defaultRole: string, allowInvites: boolean, requireApproval: boolean }` |
| `createdAt` | number | Unix timestamp (ms) |
| `updatedAt` | number | Unix timestamp (ms) |

**Indexes:**
- `owner` (for "my teams" queries)
- `name` (for search)

**Auth Rules:**
- `createRule`: `@request.auth.id != ""`
- `listRule`: `@request.auth.id = owner.id || teamMembers.member.id = @request.auth.id`
- `viewRule`: `@request.auth.id = owner.id || teamMembers.member.id = @request.auth.id`
- `updateRule`: `@request.auth.id = owner.id || (teamMembers.member.id = @request.auth.id && teamMembers.role in ["owner", "admin"])`
- `deleteRule`: `@request.auth.id = owner.id`

---

#### `crm_team_members`
Junction table linking users to teams with roles.

| Field | Type | Description |
|-------|------|-------------|
| `id` | text (15) | Primary key, auto-generated |
| `team` | relation (crm_teams) | Team reference (required) |
| `member` | relation (users) | User reference (required) |
| `role` | select | `owner` \| `admin` \| `member` \| `viewer` (required) |
| `invitedBy` | relation (users) | Who invited this member |
| `invitedAt` | number | Unix timestamp (ms) |
| `joinedAt` | number | Unix timestamp (ms), null if pending |
| `status` | select | `active` \| `pending` \| `removed` (required, default: `pending`) |

**Indexes:**
- `team` + `member` (unique composite)
- `team` + `status` (for team roster)
- `member` + `status` (for "my teams")
- `member` + `role` (for permission checks)

**Auth Rules:**
- `createRule`: `@request.auth.id = team.owner.id || (teamMembers.team = team.id && teamMembers.member.id = @request.auth.id && teamMembers.role in ["owner", "admin"])`
- `listRule`: `@request.auth.id = team.owner.id || teamMembers.member.id = @request.auth.id`
- `viewRule`: `@request.auth.id = team.owner.id || teamMembers.member.id = @request.auth.id`
- `updateRule`: `@request.auth.id = team.owner.id || (teamMembers.member.id = @request.auth.id && role = "owner") || (team.member.id = @request.auth.id && team.role in ["owner", "admin"] && new.role != "owner")`
- `deleteRule`: `@request.auth.id = team.owner.id || (teamMembers.member.id = @request.auth.id && teamMembers.role = "owner")`

**Role Hierarchy:**
```
owner  >  admin  >  member  >  viewer
```
- `owner`: Full control, can delete team, transfer ownership
- `admin`: Manage members (except owner), edit team settings
- `member`: Create/edit own records, view team records
- `viewer`: Read-only access to team records

---

#### `crm_roles` (optional - predefined roles)
Defines granular permissions per role. Can be extended later for custom roles.

| Field | Type | Description |
|-------|------|-------------|
| `id` | text (15) | Primary key |
| `name` | text | Role key: `owner`, `admin`, `member`, `viewer` |
| `label` | text | Display name |
| `permissions` | json | Granular permissions map |
| `isSystem` | bool | System roles cannot be deleted |

**Default Permissions Map:**
```json
{
  "records": {
    "create": ["contacts", "companies", "deals", "activities", "tasks"],
    "read": ["contacts", "companies", "deals", "activities", "tasks", "templates", "attachments"],
    "update": ["own", "team"],
    "delete": ["own"]
  },
  "team": {
    "invite": false,
    "removeMember": false,
    "changeRole": false,
    "editSettings": false,
    "deleteTeam": false
  },
  "settings": {
    "pipeline": false,
    "customFields": false,
    "templates": false,
    "playbooks": false
  }
}
```

---

### 1.2 Extended Existing Collections

#### `crm_companies` - Add fields:
| Field | Type | Description |
|-------|------|-------------|
| `team` | relation (crm_teams) | Owning team (required for team-scoped records) |
| `owner` | relation (users) | Record owner (required) |
| `visibility` | select | `private` \| `team` \| `public` (default: `team`) |

#### `crm_contacts` - Add fields:
| Field | Type | Description |
|-------|------|-------------|
| `team` | relation (crm_teams) | Owning team |
| `owner` | relation (users) | Record owner |
| `visibility` | select | `private` \| `team` \| `public` (default: `team`) |

#### `crm_deals` - Add fields:
| Field | Type | Description |
|-------|------|-------------|
| `team` | relation (crm_teams) | Owning team |
| `owner` | relation (users) | Record owner (deal lead) |
| `visibility` | select | `private` \| `team` \| `public` (default: `team`) |

#### `crm_activities` - Add fields:
| Field | Type | Description |
|-------|------|-------------|
| `team` | relation (crm_teams) | Owning team |
| `owner` | relation (users) | Activity logger |

#### `crm_tasks` - Add fields:
| Field | Type | Description |
|-------|------|-------------|
| `team` | relation (crm_teams) | Owning team |
| `owner` | relation (users) | Task assignee |
| `assignee` | relation (users) | Alternative: separate assignee from creator |

#### `crm_templates` - Add fields:
| Field | Type | Description |
|-------|------|-------------|
| `team` | relation (crm_teams) | Owning team (null = personal) |
| `owner` | relation (users) | Template creator |
| `visibility` | select | `private` \| `team` \| `public` (default: `private`) |

#### `crm_attachments` - Add fields:
| Field | Type | Description |
|-------|------|-------------|
| `team` | relation (crm_teams) | Owning team |
| `owner` | relation (users) | Uploader |

#### `crm_settings` - Extend:
| Field | Type | Description |
|-------|------|-------------|
| `team` | relation (crm_teams) | Team these settings belong to (null = global defaults) |
| `owner` | relation (users) | User these settings belong to (for personal overrides) |

---

### 1.3 Permission Evaluation Logic

```
canAccess(record, user, action) {
  // 1. Record owner always has full access
  if (record.owner?.id === user.id) return true

  // 2. Check team membership
  const membership = user.teamMemberships.find(m => m.team.id === record.team?.id)
  if (!membership) return false

  // 3. Check role permissions
  const rolePerms = ROLE_PERMISSIONS[membership.role]
  if (!rolePerms.records[action]?.includes(record.collection)) return false

  // 4. Check visibility
  if (record.visibility === 'private' && record.owner?.id !== user.id) return false
  if (record.visibility === 'team' && !membership) return false
  // 'public' - any authenticated user in org

  return true
}
```

---

## 2. PocketBase API Changes

### 2.1 New Migrations

Create 2 new migration files:

#### `YYYYMMDDHHMMSS_created_crm_teams.js`
```javascript
migrate((app) => {
  const collection = new Collection({
    "createRule": "@request.auth.id != \"\"",
    "deleteRule": "@request.auth.id = owner.id",
    "fields": [
      { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text3208210256", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
      { "hidden": false, "id": "text1", "max": 100, "min": 1, "name": "name", "pattern": "", "presentable": true, "primaryKey": false, "required": true, "system": false, "type": "text" },
      { "hidden": false, "id": "text2", "max": 500, "min": 0, "name": "description", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "cascadeDelete": false, "collectionId": "_pb_users_auth_", "hidden": false, "id": "relation1", "maxSelect": 1, "minSelect": 0, "name": "owner", "presentable": false, "required": true, "system": false, "type": "relation" },
      { "hidden": false, "id": "file1", "maxSelect": 1, "maxSize": 5242880, "mimeTypes": ["image/png", "image/jpeg", "image/webp"], "name": "avatar", "presentable": false, "protected": false, "required": false, "system": false, "type": "file" },
      { "hidden": false, "id": "json1", "maxSize": 0, "name": "settings", "presentable": false, "required": false, "system": false, "type": "json" },
      { "hidden": false, "id": "number1", "max": null, "min": 0, "name": "createdAt", "onlyInt": true, "presentable": false, "required": true, "system": false, "type": "number" },
      { "hidden": false, "id": "number2", "max": null, "min": 0, "name": "updatedAt", "onlyInt": true, "presentable": false, "required": true, "system": false, "type": "number" }
    ],
    "id": "pbc_teams_new",
    "indexes": ["CREATE INDEX idx_teams_owner ON crm_teams (owner)", "CREATE INDEX idx_teams_name ON crm_teams (name)"],
    "listRule": "@request.auth.id = owner.id || (teamMembers.team.id = id && teamMembers.member.id = @request.auth.id && teamMembers.status = \"active\")",
    "name": "crm_teams",
    "system": false,
    "type": "base",
    "updateRule": "@request.auth.id = owner.id || (teamMembers.team.id = id && teamMembers.member.id = @request.auth.id && teamMembers.role in [\"owner\", \"admin\"])",
    "viewRule": "@request.auth.id = owner.id || (teamMembers.team.id = id && teamMembers.member.id = @request.auth.id && teamMembers.status = \"active\")"
  })
  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_teams_new")
  return app.delete(collection)
})
```

#### `YYYYMMDDHHMMSS_created_crm_team_members.js`
```javascript
migrate((app) => {
  const collection = new Collection({
    "createRule": "@request.auth.id = team.owner.id || (teamMembers.team = team.id && teamMembers.member.id = @request.auth.id && teamMembers.role in [\"owner\", \"admin\"])",
    "deleteRule": "@request.auth.id = team.owner.id || (teamMembers.member.id = @request.auth.id && teamMembers.role = \"owner\")",
    "fields": [
      { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text3208210256", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
      { "cascadeDelete": true, "collectionId": "pbc_teams_new", "hidden": false, "id": "relation1", "maxSelect": 1, "minSelect": 1, "name": "team", "presentable": false, "required": true, "system": false, "type": "relation" },
      { "cascadeDelete": true, "collectionId": "_pb_users_auth_", "hidden": false, "id": "relation2", "maxSelect": 1, "minSelect": 1, "name": "member", "presentable": false, "required": true, "system": false, "type": "relation" },
      { "hidden": false, "id": "select1", "maxSelect": 1, "name": "role", "presentable": false, "required": true, "system": false, "type": "select", "values": ["owner", "admin", "member", "viewer"] },
      { "cascadeDelete": false, "collectionId": "_pb_users_auth_", "hidden": false, "id": "relation3", "maxSelect": 1, "minSelect": 0, "name": "invitedBy", "presentable": false, "required": false, "system": false, "type": "relation" },
      { "hidden": false, "id": "number1", "max": null, "min": 0, "name": "invitedAt", "onlyInt": true, "presentable": false, "required": true, "system": false, "type": "number" },
      { "hidden": false, "id": "number2", "max": null, "min": 0, "name": "joinedAt", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
      { "hidden": false, "id": "select2", "maxSelect": 1, "name": "status", "presentable": false, "required": true, "system": false, "type": "select", "values": ["active", "pending", "removed"] }
    ],
    "id": "pbc_team_members_new",
    "indexes": ["CREATE UNIQUE INDEX idx_team_members_unique ON crm_team_members (team, member)", "CREATE INDEX idx_team_members_team_status ON crm_team_members (team, status)", "CREATE INDEX idx_team_members_member_status ON crm_team_members (member, status)", "CREATE INDEX idx_team_members_member_role ON crm_team_members (member, role)"],
    "listRule": "@request.auth.id = team.owner.id || member.id = @request.auth.id",
    "name": "crm_team_members",
    "system": false,
    "type": "base",
    "updateRule": "@request.auth.id = team.owner.id || (member.id = @request.auth.id && role = \"owner\") || (team.member.id = @request.auth.id && team.role in [\"owner\", \"admin\"] && role != \"owner\")",
    "viewRule": "@request.auth.id = team.owner.id || member.id = @request.auth.id"
  })
  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_team_members_new")
  return app.delete(collection)
})
```

---

### 2.2 Migration for Existing Collections (Add Team Fields)

For each existing collection (companies, contacts, deals, activities, tasks, templates, attachments), create a migration adding:

```javascript
// Example for crm_companies - repeat for each collection
migrate((app) => {
  const collection = app.findCollectionByNameOrId("crm_companies")
  collection.fields.add(
    new RelationField({
      "cascadeDelete": false,
      "collectionId": "pbc_teams_new",
      "hidden": false,
      "id": "relation_team",
      "maxSelect": 1,
      "minSelect": 0,
      "name": "team",
      "presentable": false,
      "required": false, // Required for new records, optional for existing
      "system": false
    }),
    new RelationField({
      "cascadeDelete": false,
      "collectionId": "_pb_users_auth_",
      "hidden": false,
      "id": "relation_owner",
      "maxSelect": 1,
      "minSelect": 0,
      "name": "owner",
      "presentable": false,
      "required": false,
      "system": false
    }),
    new SelectField({
      "hidden": false,
      "id": "select_visibility",
      "maxSelect": 1,
      "name": "visibility",
      "presentable": false,
      "required": true,
      "system": false,
      "type": "select",
      "values": ["private", "team", "public"]
    })
  )
  collection.listRule = "@request.auth.id = owner.id || (team != \"\" && teamMembers.team.id = team.id && teamMembers.member.id = @request.auth.id && teamMembers.status = \"active\") || visibility = \"public\""
  collection.viewRule = "@request.auth.id = owner.id || (team != \"\" && teamMembers.team.id = team.id && teamMembers.member.id = @request.auth.id && teamMembers.status = \"active\") || visibility = \"public\""
  collection.createRule = "@request.auth.id != \"\""
  collection.updateRule = "@request.auth.id = owner.id || (team != \"\" && teamMembers.team.id = team.id && teamMembers.member.id = @request.auth.id && teamMembers.status = \"active\" && teamMembers.role in [\"owner\", \"admin\", \"member\"]) || visibility = \"public\""
  collection.deleteRule = "@request.auth.id = owner.id || (team != \"\" && teamMembers.team.id = team.id && teamMembers.member.id = @request.auth.id && teamMembers.status = \"active\" && teamMembers.role in [\"owner\", \"admin\"])"

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("crm_companies")
  collection.fields.removeByName("team")
  collection.fields.removeByName("owner")
  collection.fields.removeByName("visibility")
  // Reset auth rules
  return app.save(collection)
})
```

---

### 2.3 PocketBase Hooks (pb_hooks)

Create `pb_hooks/teams.js` for server-side logic:

```javascript
// Auto-assign team/owner on create
routerAdd("POST", "/api/collections/:collection/records", (e) => {
  const collection = e.requestInfo().collection
  const teamCollections = ["crm_companies", "crm_contacts", "crm_deals", "crm_activities", "crm_tasks", "crm_templates", "crm_attachments"]

  if (teamCollections.includes(collection.name) && e.auth) {
    const data = e.requestInfo().data
    if (!data.team) {
      // Auto-assign to user's first active team
      const membership = $app.findFirstRecordByFilter(
        "crm_team_members",
        "member.id = {:id} && status = \"active\"",
        "-createdAt",
        { "id": e.auth.id }
      )
      if (membership) data.team = membership.team.id
    }
    if (!data.owner) data.owner = e.auth.id
    if (!data.visibility) data.visibility = "team"
  }
  return e.next()
})

// Auto-create owner membership when team created
routerAdd("POST", "/api/collections/crm_teams/records", (e) => {
  const data = e.requestInfo().data
  data.owner = e.auth.id
  return e.next()
}, () => {
  // After create hook
  routerAdd("POST", "/api/collections/crm_teams/records", (e) => {
    const team = e.response
    $app.save(new Record($app.findCollectionByNameOrId("crm_team_members"), {
      team: team.id,
      member: e.auth.id,
      role: "owner",
      invitedBy: e.auth.id,
      invitedAt: Date.now(),
      joinedAt: Date.now(),
      status: "active"
    }))
    return e.next()
  })
})
```

---

### 2.4 Real-time Subscriptions

PocketBase supports real-time via SSE. Client subscribes to collection changes:

```javascript
// Subscribe to all team-scoped collections
const collections = ['crm_companies', 'crm_contacts', 'crm_deals', 'crm_activities', 'crm_tasks', 'crm_templates', 'crm_attachments']

collections.forEach(coll => {
  pb.collection(coll).subscribe('*', (e) => {
    // e.action: "create" | "update" | "delete"
    // e.record: the record
    // Filter by team on client or use filter in subscription
  })
})
```

**Subscription Filter** (PocketBase v0.22+):
```javascript
// Subscribe only to records in user's teams
const userTeams = await getUserTeams(userId)
const teamIds = userTeams.map(t => t.id)
const filter = teamIds.map(id => `team.id = "${id}"`).join(" || ")

collections.forEach(coll => {
  pb.collection(coll).subscribe('*', (e) => { ... }, { filter })
})
```

---

## 3. Frontend Integration Points

### 3.1 Store Layer Extensions (`src/lib/store.js`)

#### New State Properties
```javascript
// Add to Store class
teams = []           // crm_teams records
teamMembers = []     // crm_team_members records (for current user's teams)
currentTeam = null   // Active team context
userRole = null      // Role in currentTeam
```

#### New Methods
```javascript
// Team management
async createTeam(name, description)
async updateTeam(teamId, patch)
async deleteTeam(teamId)
async getUserTeams()           // Teams where user is active member
async getTeam(teamId)
async setCurrentTeam(teamId)   // Switch team context

// Membership management
async inviteMember(teamId, email, role)
async acceptInvite(inviteToken)
async removeMember(teamId, memberId)
async changeMemberRole(teamId, memberId, newRole)
async getTeamMembers(teamId)
async getMyMembership(teamId)  // Returns membership record for current user

// Permission helpers
canCreate(collection)          // Check if current user can create in collection
canRead(record)                // Check if current user can read record
canUpdate(record)              // Check if current user can update record
canDelete(record)              // Check if current user can delete record
canManageTeam(teamId)          // owner or admin
canInvite(teamId)              // owner or admin
```

#### Modified Existing Methods
All `addX`, `updateX`, `deleteX` methods must:
1. Auto-populate `team`, `owner`, `visibility` from `currentTeam` and `user`
2. Check permissions before mutating
3. Include team filter in list queries

```javascript
// Example: addContact
async addContact(data) {
  if (!this.currentTeam) throw new Error('No team selected')
  if (!this.canCreate('contacts')) throw new Error('No permission')

  const contact = {
    ...data,
    id: uid(),
    team: this.currentTeam,
    owner: this.user.id,
    visibility: 'team',
    createdAt: Date.now()
  }
  // ... rest unchanged
}
```

#### Real-time Integration
```javascript
#realtimeSubscriptions = new Map()

async subscribeToTeamChanges() {
  const collections = ['companies', 'contacts', 'deals', 'activities', 'tasks', 'templates', 'attachments']

  for (const coll of collections) {
    const pbColl = this.pb.collection(this.collections[coll])
    const unsub = pbColl.subscribe('*', (e) => this.#handleRealtimeEvent(coll, e))
    this.#realtimeSubscriptions.set(coll, unsub)
  }
}

#handleRealtimeEvent(collection, event) {
  // event: { action: 'create'|'update'|'delete', record: {...} }
  // Merge into local state, emit 'change'
  // Handle conflicts with outbox
}
```

---

### 3.2 PocketBase Adapter Extensions (`src/lib/pocketbase-adapter.js`)

#### New Methods
```javascript
// Teams
async getTeams(filter = {})        // List teams user belongs to
async getTeam(teamId)
async createTeam(data)
async updateTeam(teamId, data)
async deleteTeam(teamId)

// Team Members
async getTeamMembers(teamId)
async inviteMember(teamId, email, role)
async acceptInvite(token)
async removeMember(teamId, memberId)
async changeMemberRole(teamId, memberId, role)
async getMyMembership(teamId)

// Real-time
subscribe(collection, callback, filter)   // Returns unsubscribe fn
unsubscribe(collection)
```

#### Modified KV Methods
Update `kvGet`/`kvSet` to respect team context:
```javascript
async kvGet(key) {
  // If team-scoped key, filter by currentTeam
  if (this.currentTeam && this.#isTeamKey(key)) {
    return this.#getTeamCollection(key)
  }
  return this.#getGlobalKey(key)
}
```

---

### 3.3 UI Components

#### 3.3.1 Team Selector (Header/Sidebar)
**Location:** `src/ui/shell.js` → sidebar brand area

```javascript
function renderTeamSelector() {
  const teams = store.getUserTeams()
  const current = store.currentTeam

  return el('div.team-selector', {},
    el('select.team-select', {
      value: current?.id || '',
      onchange: async (e) => {
        await store.setCurrentTeam(e.target.value)
        // Triggers full app refresh via store.change event
      }
    }, teams.map(t => el('option', { value: t.id }, t.name))),
    current && store.canManageTeam(current.id) && el('button.team-settings', {
      html: icon('gear', 16, 2),
      onclick: () => openTeamSettings(current.id)
    }, ' Team Settings')
  )
}
```

#### 3.3.2 Team Settings View
**New file:** `src/views/team-settings.js`

Tabs:
1. **General** - Name, description, avatar
2. **Members** - List, invite, role change, remove
3. **Roles & Permissions** - Matrix view (future: custom roles)
4. **Danger Zone** - Delete team, transfer ownership

#### 3.3.3 Invite Member Modal
**New file:** `src/ui/team-invite.js`

```javascript
export function openInviteModal(teamId, { onInvited } = {}) {
  // Email input, role select, send invite
  // Creates crm_team_members with status: 'pending'
  // Sends invitation email (via PocketBase email or custom)
}
```

#### 3.3.4 Record Ownership Indicators
**Location:** All list views (leads.js, companies.js, pipeline.js, etc.)

Add to each row:
```javascript
// Show owner avatar + name, lock icon for private records
el('span.record-owner', {
  title: `Owned by ${record.owner?.username || '—'}`,
  className: `record-owner${record.visibility === 'private' ? ' private' : ''}`
}, record.owner ? avatar(record.owner) : icon('lock', 14, 2))
```

#### 3.3.5 Permission-Gated Actions
**Location:** Forms, list actions, bulk operations

```javascript
// In openDealForm, openContactForm, etc.
if (!store.canCreate('deals')) {
  toast('You need member role or higher to create deals', { icon: 'alert' })
  return
}

// In bulk operations
if (!selection.every(r => store.canUpdate(r))) {
  toast('Some records cannot be edited', { icon: 'alert' })
  // Filter or abort
}
```

---

### 3.4 Route & Navigation Updates

#### 3.4.1 New Routes (`src/ui/shell.js`)
```javascript
const ROUTES = [
  // ... existing
  { hash: '#/teams', label: 'Teams', icon: 'users', view: teamsView, tab: false },
  { hash: '#/teams/:teamId/settings', label: 'Team Settings', icon: 'gear', view: teamSettingsView, tab: false },
]
```

#### 3.4.2 Team Context Persistence
- Store `currentTeamId` in localStorage
- Restore on boot in `main.js` before `mountShell`
- Clear on sign-out

---

### 3.5 Real-time UI Updates

#### 3.5.1 Connection Indicator
**Location:** `src/ui/offline.js` → extend `offlineIndicator()`

Add real-time status:
```javascript
// Green dot = connected & subscribed
// Yellow dot = connected, subscription pending
// Red dot = disconnected
```

#### 3.5.2 Conflict Resolution
When real-time update conflicts with local edit:
```javascript
#handleRealtimeEvent(collection, event) {
  const localRecord = this[collection].find(r => r.id === event.record.id)
  if (localRecord && localRecord.updatedAt > event.record.updatedAt) {
    // Local is newer - keep local, queue sync
    return
  }
  // Remote is newer or no local - apply
  this.#applyRemoteRecord(collection, event.record, event.action)
}
```

#### 3.5.3 Presence (Optional - Phase 2)
Show who's viewing/editing a record:
```javascript
// Ephemeral presence via PocketBase real-time
// Subscribe to "presence" topic per record
// Broadcast: { userId, recordId, action: 'view'|'edit', timestamp }
```

---

## 4. Implementation Phases

### Phase 1: Core Data Model (Week 1)
- [ ] Create PocketBase migrations for `crm_teams`, `crm_team_members`
- [ ] Add team/owner/visibility fields to existing collections
- [ ] Update auth rules on all collections
- [ ] Test permission logic with PocketBase API directly

### Phase 2: Store & Adapter (Week 1-2)
- [ ] Extend `store.js` with team state and permission methods
- [ ] Extend `pocketbase-adapter.js` with team/member APIs
- [ ] Implement real-time subscription management
- [ ] Add team context to all CRUD operations

### Phase 3: UI - Team Management (Week 2)
- [ ] Team selector in sidebar/header
- [ ] Team settings view (general, members)
- [ ] Invite/accept/remove member flows
- [ ] Role change UI

### Phase 4: UI - Permission Integration (Week 2-3)
- [ ] Gate all create/edit/delete actions with `canX` checks
- [ ] Show ownership/visibility badges in lists
- [ ] Filter lists by team context
- [ ] Update settings view for team-scoped settings

### Phase 5: Real-time (Week 3)
- [ ] Subscribe to team collections on team switch
- [ ] Merge remote changes into store
- [ ] Handle conflicts with outbox
- [ ] Connection status indicator

### Phase 6: Polish & Edge Cases (Week 3-4)
- [ ] Empty states for no-team users
- [ ] Onboarding: create first team
- [ ] Migration: assign existing records to user's first team
- [ ] Test offline + real-time reconciliation
- [ ] Performance: pagination, subscription cleanup

---

## 5. Security Considerations

1. **Never trust client** - All permission checks duplicated in PocketBase auth rules
2. **Team isolation** - Users only see records from teams they're active members of
3. **Owner privilege** - Record owner always has full access regardless of team role
4. **Admin cannot promote to owner** - Only owner can transfer ownership
5. **Invite validation** - Verify email exists in PocketBase users before creating pending membership
6. **Rate limiting** - Limit invite sends, team creates per user

---

## 6. Migration Strategy for Existing Data

```javascript
// One-time migration script (run via PocketBase console or migration)
migrate((app) => {
  const users = app.findAllRecords("users")
  for (const user of users) {
    // Create personal team for each user
    const team = new Record(app.findCollectionByNameOrId("crm_teams"))
    team.set("name", `${user.username || user.email}'s Team`)
    team.set("owner", user.id)
    team.set("createdAt", Date.now())
    team.set("updatedAt", Date.now())
    team.set("settings", { defaultRole: "member", allowInvites: true, requireApproval: false })
    app.save(team)

    // Add as owner
    const membership = new Record(app.findCollectionByNameOrId("crm_team_members"))
    membership.set("team", team.id)
    membership.set("member", user.id)
    membership.set("role", "owner")
    membership.set("invitedBy", user.id)
    membership.set("invitedAt", Date.now())
    membership.set("joinedAt", Date.now())
    membership.set("status", "active")
    app.save(membership)

    // Assign existing records to this team
    const collections = ["crm_companies", "crm_contacts", "crm_deals", "crm_activities", "crm_tasks", "crm_templates", "crm_attachments"]
    for (const collName of collections) {
      const coll = app.findCollectionByNameOrId(collName)
      const records = app.findRecordsByFilter(collName, "", "", 5000)
      for (const record of records) {
        if (!record.get("team")) record.set("team", team.id)
        if (!record.get("owner")) record.set("owner", user.id)
        if (!record.get("visibility")) record.set("visibility", "team")
        app.save(record)
      }
    }
  }
})
```

---

## 7. API Reference Summary

### PocketBase Collections
| Collection | Auth Rules |
|------------|------------|
| `crm_teams` | Owner + members (active) |
| `crm_team_members` | Owner + member self + team admins |
| `crm_companies` | Owner + team members (per role) + public |
| `crm_contacts` | Owner + team members (per role) + public |
| `crm_deals` | Owner + team members (per role) + public |
| `crm_activities` | Owner + team members (per role) |
| `crm_tasks` | Owner/assignee + team members (per role) |
| `crm_templates` | Owner + team members (per visibility) |
| `crm_attachments` | Owner + team members |

### Store Methods (New)
| Method | Description |
|--------|-------------|
| `createTeam(name, description)` | Create team, auto-add as owner |
| `setCurrentTeam(teamId)` | Switch active team context |
| `getUserTeams()` | All teams where user is active member |
| `inviteMember(teamId, email, role)` | Send invitation |
| `changeMemberRole(teamId, memberId, role)` | Update role (not owner) |
| `removeMember(teamId, memberId)` | Remove from team |
| `canCreate(collection)` | Permission check |
| `canRead(record)` | Permission check |
| `canUpdate(record)` | Permission check |
| `canDelete(record)` | Permission check |
| `subscribeToTeamChanges()` | Start real-time subscriptions |

### Real-time Events
| Event | Payload |
|-------|---------|
| `team:created` | `{ team }` |
| `team:updated` | `{ team, changes }` |
| `team:deleted` | `{ teamId }` |
| `member:joined` | `{ teamId, member, role }` |
| `member:left` | `{ teamId, memberId }` |
| `member:role_changed` | `{ teamId, memberId, oldRole, newRole }` |
| `record:created` | `{ collection, record }` |
| `record:updated` | `{ collection, record, changes }` |
| `record:deleted` | `{ collection, recordId }` |

---

## 8. Testing Checklist

### Unit Tests (store.js)
- [ ] `canCreate/Read/Update/Delete` for each role
- [ ] Team context switching updates filters
- [ ] Membership status transitions (pending → active)
- [ ] Real-time event merging with local edits

### Integration Tests (PocketBase)
- [ ] Auth rules enforce team isolation
- [ ] Owner bypasses team role
- [ ] Admin cannot promote to owner
- [ ] Viewer cannot create/update/delete
- [ ] Real-time subscriptions filter by team

### E2E Tests (Frontend)
- [ ] Create team → invite member → accept → collaborate
- [ ] Switch teams → data filters correctly
- [ ] Private record not visible to team members
- [ ] Offline edit + real-time conflict resolution
- [ ] Sign out → sign in → team context restored

---

## 9. Future Extensions (Not in Scope)

- Custom roles with granular permissions
- Shared pipelines/stages per team
- Team-level reporting/analytics
- Audit log for team actions
- SSO/SCIM provisioning
- Guest access (time-limited links)
- Team templates (pre-configured settings)