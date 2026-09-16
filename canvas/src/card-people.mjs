export function documentCardPeople(document, currentProfile) {
  return uniquePeople([document.lastEditor ?? creatorProfile(document, currentProfile)]).slice(0, 4);
}

export function folderCardPeople(folder, grants, currentProfile) {
  const members = (grants ?? []).filter((grant) => grant.status === undefined || grant.status === "active");
  return uniquePeople([creatorProfile(folder, currentProfile), ...members]).slice(0, 4);
}

function creatorProfile(item, currentProfile) {
  const accountId = String(item?.ownerAccountId ?? "").trim();
  if (!accountId) {
    return item?.access === "owner" && currentProfile
      ? { ...currentProfile, accountId: currentProfile.id, isOwner: true, isCurrentUser: true }
      : null;
  }
  const isCurrentUser = accountId === currentProfile?.id;
  return {
    accountId,
    name: item.ownerName ?? (isCurrentUser ? currentProfile?.name : null),
    avatarUrl: isCurrentUser ? currentProfile?.avatarUrl ?? null : null,
    isOwner: true,
    isCurrentUser,
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
