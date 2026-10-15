// Keep explicit IDs for the whole login session, including after panel clearing.
export function claimNotificationId(seenIds, id) {
  if (id == null) return true;
  if (seenIds.has(id)) return false;
  seenIds.add(id);
  return true;
}
