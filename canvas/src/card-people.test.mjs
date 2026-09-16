import assert from "node:assert/strict";
import test from "node:test";
import { documentCardPeople, folderCardPeople } from "./card-people.mjs";

const currentProfile = { id: "owner-account", name: "Owner", avatarUrl: "https://cdn.example.test/owner.png" };

test("document cards show the last editor, including the creator when they edited last", () => {
  const people = documentCardPeople({
    ownerAccountId: "owner-account",
    ownerName: "Owner",
    lastEditor: { accountId: "owner-account", name: "Owner", isCurrentUser: true },
  }, currentProfile);

  assert.deepEqual(people.map((person) => person.accountId), ["owner-account"]);
  assert.equal(people[0].isCurrentUser, true);
});

test("folder cards include the creator and unique active shared accounts", () => {
  const people = folderCardPeople({ ownerAccountId: "owner-account", access: "owner" }, [
    { id: "member-1", accountId: "member-account", status: "active" },
    { id: "duplicate-member", accountId: "member-account", status: "active" },
    { id: "pending-member", accountId: "invite-account", status: "pending" },
  ], currentProfile);

  assert.deepEqual(people.map((person) => person.accountId), ["owner-account", "member-account"]);
});

test("owner access joins the host profile even when backend and profile IDs differ", () => {
  const people = folderCardPeople({ ownerAccountId: "backend-account", access: "owner" }, [], currentProfile);

  assert.equal(people[0].accountId, "backend-account");
  assert.equal(people[0].name, "Owner");
  assert.equal(people[0].avatarUrl, currentProfile.avatarUrl);
  assert.equal(people[0].isCurrentUser, true);
});

test("a current last editor inherits the host profile avatar", () => {
  const people = documentCardPeople({
    lastEditor: { accountId: "backend-account", isCurrentUser: true },
  }, currentProfile);

  assert.equal(people[0].accountId, "backend-account");
  assert.equal(people[0].name, "Owner");
  assert.equal(people[0].avatarUrl, currentProfile.avatarUrl);
});
