import { test } from "node:test";
import assert from "node:assert/strict";
import { Role } from "@prisma/client";

import {
  canAssignActions,
  canManageLocations,
  canManageTemplates,
  canManageUsers,
  canSeeDashboard,
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
    [
      "ADMIN",
      "DIRECTOR_OF_OPS",
      "DISTRICT",
      "GM",
      "MANAGER",
      "OPERATOR",
      "PRESIDENT",
      "REGIONAL",
      "STAFF",
      "VICE_PRESIDENT",
    ],
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

test("seniority is not system administration", () => {
  // The roles somebody will eventually be tempted to widen. A president sees
  // the whole company and still cannot change what a store is asked to do.
  for (const role of [
    Role.PRESIDENT,
    Role.VICE_PRESIDENT,
    Role.DIRECTOR_OF_OPS,
    Role.REGIONAL,
    Role.DISTRICT,
  ]) {
    assert.equal(canManageTemplates(as(role)), false, `${role} must not manage checklists`);
    assert.equal(canManageUsers(as(role)), false, `${role} must not manage people`);
    assert.equal(canManageLocations(as(role)), false, `${role} must not manage stores`);
  }
});

test("company officers look across the fleet; an operator runs stores", () => {
  for (const role of [Role.PRESIDENT, Role.VICE_PRESIDENT, Role.DIRECTOR_OF_OPS]) {
    assert.equal(isLeader(as(role)), true, `${role} should be leadership`);
  }
  // An Operator answers for their own stores, so they get the scored rollup,
  // but the org-wide Activity log is an oversight view they are not part of.
  assert.equal(isLeader(as(Role.OPERATOR)), false);
  assert.equal(canSeeDashboard(as(Role.OPERATOR)), true);
});

test("the dashboard reaches store leadership, and stops at shift manager", () => {
  for (const role of [Role.PRESIDENT, Role.DIRECTOR_OF_OPS, Role.OPERATOR, Role.GM]) {
    assert.equal(canSeeDashboard(as(role)), true, `${role} should see the dashboard`);
  }
  assert.equal(canSeeDashboard(as(Role.MANAGER)), false);
  assert.equal(canSeeDashboard(as(Role.STAFF)), false);
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
  for (const role of EVERY_ROLE.filter((r) => r !== Role.STAFF)) {
    assert.equal(canAssignActions(as(role)), true, `${role} should assign actions`);
  }
  assert.equal(canAssignActions(as(Role.STAFF)), false);
});

test("verifying a resolved action stops at general manager", () => {
  for (const role of [
    Role.ADMIN,
    Role.PRESIDENT,
    Role.VICE_PRESIDENT,
    Role.DIRECTOR_OF_OPS,
    Role.REGIONAL,
    Role.DISTRICT,
    Role.OPERATOR,
    Role.GM,
  ]) {
    assert.equal(canVerifyActions(as(role)), true, `${role} should verify actions`);
  }
  // A shift manager resolving their own finding must not also sign it off.
  assert.equal(canVerifyActions(as(Role.MANAGER)), false);
  assert.equal(canVerifyActions(as(Role.STAFF)), false);
});

test("leadership is the three multi-store roles", () => {
  assert.deepEqual(
    EVERY_ROLE.filter((role) => isLeader(as(role))).sort(),
    ["ADMIN", "DIRECTOR_OF_OPS", "DISTRICT", "PRESIDENT", "REGIONAL", "VICE_PRESIDENT"],
  );
});
