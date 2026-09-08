import { test } from "node:test";
import assert from "node:assert/strict";
import { Role } from "@prisma/client";

import {
  canAssignActions,
  canManageLocations,
  canManageTemplates,
  canManageUsers,
  canVerifyActions,
  isLeader,
} from "../src/lib/role-access";

const EVERY_ROLE = Object.values(Role);
const NOT_ADMIN = EVERY_ROLE.filter((role) => role !== Role.ADMIN);

function as(role: Role) {
  return { role };
}

test("every role in the schema is covered by these tests", () => {
  // A role added to the schema without a decision here would otherwise slip
  // through with whatever the fallback happens to be.
  assert.deepEqual(
    [...EVERY_ROLE].sort(),
    ["ADMIN", "DISTRICT", "GM", "MANAGER", "REGIONAL", "STAFF"],
  );
});

test("only an administrator can change or delete a checklist", () => {
  assert.equal(canManageTemplates(as(Role.ADMIN)), true);
  for (const role of NOT_ADMIN) {
    assert.equal(
      canManageTemplates(as(role)),
      false,
      `${role} must not be able to manage checklists`,
    );
  }
});

test("a regional or district lead cannot delete a checklist", () => {
  // Worth stating on its own: these are the roles senior enough that somebody
  // will be tempted to widen this, and the ones whose reach spans many stores.
  assert.equal(canManageTemplates(as(Role.REGIONAL)), false);
  assert.equal(canManageTemplates(as(Role.DISTRICT)), false);
});

test("only an administrator can manage people or stores", () => {
  for (const role of NOT_ADMIN) {
    assert.equal(canManageUsers(as(role)), false, `${role} must not manage users`);
    assert.equal(canManageLocations(as(role)), false, `${role} must not manage stores`);
  }
  assert.equal(canManageUsers(as(Role.ADMIN)), true);
  assert.equal(canManageLocations(as(Role.ADMIN)), true);
});

test("assigning work reaches down to shift managers, but not to staff", () => {
  for (const role of [Role.ADMIN, Role.REGIONAL, Role.DISTRICT, Role.GM, Role.MANAGER]) {
    assert.equal(canAssignActions(as(role)), true, `${role} should assign actions`);
  }
  assert.equal(canAssignActions(as(Role.STAFF)), false);
});

test("verifying a resolved action stops at general manager", () => {
  for (const role of [Role.ADMIN, Role.REGIONAL, Role.DISTRICT, Role.GM]) {
    assert.equal(canVerifyActions(as(role)), true, `${role} should verify actions`);
  }
  // A shift manager resolving their own finding must not also sign it off.
  assert.equal(canVerifyActions(as(Role.MANAGER)), false);
  assert.equal(canVerifyActions(as(Role.STAFF)), false);
});

test("leadership is the three multi-store roles", () => {
  assert.deepEqual(
    EVERY_ROLE.filter((role) => isLeader(as(role))).sort(),
    ["ADMIN", "DISTRICT", "REGIONAL"],
  );
});
