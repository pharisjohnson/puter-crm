/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // 1. Create crm_teams collection
  const teamsCollection = new Collection({
    "createRule": "@request.auth.id != \"\"",
    "deleteRule": "@request.auth.id = owner",
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "text1234567890",
        "max": 100,
        "min": 1,
        "name": "name",
        "pattern": "",
        "presentable": true,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "text0987654321",
        "max": 500,
        "min": 0,
        "name": "description",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "cascadeDelete": false,
        "collectionId": "_pb_users_auth_",
        "hidden": false,
        "id": "relation1111111111",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "owner",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "hidden": false,
        "id": "bool1111111111",
        "name": "isActive",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "bool"
      }
    ],
    "id": "pbc_teams_000001",
    "indexes": [
      "CREATE INDEX idx_teams_owner ON crm_teams (owner)"
    ],
    "listRule": "@request.auth.id != \"\"",
    "name": "crm_teams",
    "system": false,
    "type": "base",
    "updateRule": "@request.auth.id = owner",
    "viewRule": "@request.auth.id != \"\""
  });

  app.save(teamsCollection);

  // 2. Create crm_team_members collection
  const teamMembersCollection = new Collection({
    "createRule": "@request.auth.id != \"\" && @request.auth.id = user || @request.auth.id in (select owner from crm_teams where id = team)",
    "deleteRule": "@request.auth.id = user || @request.auth.id in (select owner from crm_teams where id = team)",
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "cascadeDelete": true,
        "collectionId": "pbc_teams_000001",
        "hidden": false,
        "id": "relation2222222222",
        "maxSelect": 1,
        "minSelect": 1,
        "name": "team",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "cascadeDelete": true,
        "collectionId": "_pb_users_auth_",
        "hidden": false,
        "id": "relation3333333333",
        "maxSelect": 1,
        "minSelect": 1,
        "name": "user",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "hidden": false,
        "id": "select4444444444",
        "maxSelect": 1,
        "name": "role",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "select",
        "values": [
          "owner",
          "admin",
          "member",
          "viewer"
        ]
      }
    ],
    "id": "pbc_team_members_000002",
    "indexes": [
      "CREATE UNIQUE INDEX idx_team_members_unique ON crm_team_members (team, user)",
      "CREATE INDEX idx_team_members_user ON crm_team_members (user)",
      "CREATE INDEX idx_team_members_team ON crm_team_members (team)"
    ],
    "listRule": "@request.auth.id != \"\" && (@request.auth.id = user || @request.auth.id in (select owner from crm_teams where id = team))",
    "name": "crm_team_members",
    "system": false,
    "type": "base",
    "updateRule": "@request.auth.id = user || @request.auth.id in (select owner from crm_teams where id = team)",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.id = user || @request.auth.id in (select owner from crm_teams where id = team))"
  });

  app.save(teamMembersCollection);

  // 3. Add teamId field and update rules for all existing collections
  const collectionsToUpdate = [
    "crm_activities",
    "crm_attachments",
    "crm_backup",
    "crm_companies",
    "crm_contacts",
    "crm_deals",
    "crm_kv",
    "crm_settings",
    "crm_tasks",
    "crm_templates",
    "crm_trash"
  ];

  const teamIdField = {
    "cascadeDelete": false,
    "collectionId": "pbc_teams_000001",
    "hidden": false,
    "id": "relation_team_id",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "teamId",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  };

  // Team-based access rules
  // User can access if they are a member of the record's team
  const teamListRule = "@request.auth.id != \"\" && (teamId = \"\" || @request.auth.id in (select user from crm_team_members where team = teamId))";
  const teamViewRule = "@request.auth.id != \"\" && (teamId = \"\" || @request.auth.id in (select user from crm_team_members where team = teamId))";
  const teamCreateRule = "@request.auth.id != \"\" && (teamId = \"\" || @request.auth.id in (select user from crm_team_members where team = teamId and role in ('owner', 'admin', 'member')))";
  const teamUpdateRule = "@request.auth.id != \"\" && (teamId = \"\" || @request.auth.id in (select user from crm_team_members where team = teamId and role in ('owner', 'admin', 'member')))";
  const teamDeleteRule = "@request.auth.id != \"\" && (teamId = \"\" || @request.auth.id in (select user from crm_team_members where team = teamId and role in ('owner', 'admin')))";

  for (const collectionName of collectionsToUpdate) {
    const collection = app.findCollectionByNameOrId(collectionName);
    
    // Add teamId field if not exists
    const hasTeamId = collection.fields.some(f => f.name === "teamId");
    if (!hasTeamId) {
      collection.fields.push(teamIdField);
    }
    
    // Update access rules for team-based collaboration
    collection.listRule = teamListRule;
    collection.viewRule = teamViewRule;
    collection.createRule = teamCreateRule;
    collection.updateRule = teamUpdateRule;
    collection.deleteRule = teamDeleteRule;
    
    app.save(collection);
  }

  // 4. Add indexes for teamId on all collections
  for (const collectionName of collectionsToUpdate) {
    const collection = app.findCollectionByNameOrId(collectionName);
    const hasTeamIndex = collection.indexes.some(idx => idx.includes("teamId"));
    if (!hasTeamIndex) {
      collection.indexes.push(`CREATE INDEX idx_${collectionName}_teamId ON ${collectionName} (teamId)`);
      app.save(collection);
    }
  }
}, (app) => {
  // Rollback: remove teamId fields and restore original rules, delete new collections
  const collectionsToUpdate = [
    "crm_activities",
    "crm_attachments",
    "crm_backup",
    "crm_companies",
    "crm_contacts",
    "crm_deals",
    "crm_kv",
    "crm_settings",
    "crm_tasks",
    "crm_templates",
    "crm_trash"
  ];

  const originalRule = "@request.auth.id != \"\"";

  for (const collectionName of collectionsToUpdate) {
    const collection = app.findCollectionByNameOrId(collectionName);
    
    // Remove teamId field
    collection.fields = collection.fields.filter(f => f.name !== "teamId");
    
    // Restore original rules
    collection.listRule = originalRule;
    collection.viewRule = originalRule;
    collection.createRule = originalRule;
    collection.updateRule = originalRule;
    collection.deleteRule = originalRule;
    
    // Remove teamId index
    collection.indexes = collection.indexes.filter(idx => !idx.includes("teamId"));
    
    app.save(collection);
  }

  // Delete crm_team_members collection
  const teamMembersCollection = app.findCollectionByNameOrId("crm_team_members");
  if (teamMembersCollection) {
    app.delete(teamMembersCollection);
  }

  // Delete crm_teams collection
  const teamsCollection = app.findCollectionByNameOrId("crm_teams");
  if (teamsCollection) {
    app.delete(teamsCollection);
  }
})