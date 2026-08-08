export const ACCESS_REMOVED_HEADING = "You no longer have access";
export const ACCESS_REMOVED_MESSAGE = "The owner removed your access to this file.";

export function assertExportAllowed(accessRemoved) {
  if (accessRemoved) {
    throw new Error("Access removed. This document can no longer be exported.");
  }
}
