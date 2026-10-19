/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": "@request.auth.id != \"\"",
    "deleteRule": "@request.auth.id = author || @request.auth.id != \"\"",
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
        "cascadeDelete": false,
        "collectionId": "users",
        "hidden": false,
        "id": "relation3247589123",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "author",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "hidden": false,
        "id": "text3208210257",
        "max": 50,
        "min": 1,
        "name": "targetType",
        "pattern": "^(deal|activity)$",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "cascadeDelete": false,
        "collectionId": "crm_deals",
        "hidden": false,
        "id": "relation3247589124",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "deal",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "relation"
      },
      {
        "cascadeDelete": false,
        "collectionId": "crm_activities",
        "hidden": false,
        "id": "relation3247589125",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "activity",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "relation"
      },
      {
        "cascadeDelete": false,
        "collectionId": "crm_comments",
        "hidden": false,
        "id": "relation3247589126",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "parent",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "relation"
      },
      {
        "hidden": false,
        "id": "editor3247589127",
        "name": "body",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "editor"
      },
      {
        "hidden": false,
        "id": "json3247589128",
        "maxSize": 0,
        "name": "mentions",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "bool3247589129",
        "name": "edited",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "bool"
      }
    ],
    "id": "pbc_847291035",
    "indexes": [
      "CREATE INDEX idx_crm_comments_deal ON crm_comments (deal)",
      "CREATE INDEX idx_crm_comments_activity ON crm_comments (activity)",
      "CREATE INDEX idx_crm_comments_parent ON crm_comments (parent)",
      "CREATE INDEX idx_crm_comments_created ON crm_comments (created)"
    ],
    "listRule": "@request.auth.id != \"\"",
    "name": "crm_comments",
    "system": false,
    "type": "base",
    "updateRule": "@request.auth.id = author",
    "viewRule": "@request.auth.id != \"\""
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_847291035");

  return app.delete(collection);
})