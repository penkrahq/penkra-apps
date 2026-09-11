export const SNAPSHOT_UPDATE_INTERVAL = 10;

export function shouldCompactSnapshot(snapshotSequence, currentSequence) {
  const snapshot = Number(snapshotSequence ?? 0);
  const current = Number(currentSequence ?? 0);
  return Number.isFinite(snapshot)
    && Number.isFinite(current)
    && current - snapshot >= SNAPSHOT_UPDATE_INTERVAL;
}
