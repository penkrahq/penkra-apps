export function documentCardPeople(document, currentProfile) {
  const lastEditor = document.lastEditor;
  const editor = lastEditor?.isCurrentUser && currentProfile
    ? currentUserProfile(currentProfile, lastEditor.accountId)
    : lastEditor;
  return uniquePeople([editor ?? creatorProfile(document, currentProfile)]).slice(0, 4);
}

export function folderCardPeople(folder, grants, currentProfile) {
  const members = (grants ?? []).filter((grant) => grant.status === undefined || grant.status === "active");
  return uniquePeople([creatorProfile(folder, currentProfile), ...members]).slice(0, 4);
}

function creatorProfile(item, currentProfile) {
  const accountId = String(item?.ownerAccountId ?? "").trim();
  if (item?.access === "owner" && currentProfile) return currentUserProfile(currentProfile, accountId, true);
  if (!accountId) return null;
  const isCurrentUser = accountId === currentProfile?.id;
  if (isCurrentUser && currentProfile) return currentUserProfile(currentProfile, accountId, true);
  return {
    accountId,
    name: item.ownerName ?? (isCurrentUser ? currentProfile?.name : null),
    avatarUrl: isCurrentUser ? currentProfile?.avatarUrl ?? null : null,
    isOwner: true,
    isCurrentUser,
  };
}

function currentUserProfile(currentProfile, accountId, isOwner = false) {
  return {
    ...currentProfile,
    accountId: String(accountId || currentProfile.accountId || currentProfile.id || "").trim(),
    isOwner,
    isCurrentUser: true,
  };
}

function uniquePeople(people) {
  const seen = new Set();
  return people.filter((person) => {
    if (!person) return false;
    const key = person.accountId ?? (person.isOwner ? person.id : person.email ?? person.id);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
