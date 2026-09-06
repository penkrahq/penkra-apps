import { relative, sep } from "node:path";

export function evidenceRelativePath(evidenceRoot, targetPath) {
  const path = relative(evidenceRoot, targetPath).split(sep).join("/");
  if (!path || path === ".." || path.startsWith("../")) throw new Error(`Path is outside the evidence root: ${targetPath}`);
  return path;
}

export function buildUnmeasuredLaunchEntry({ caseId, deviceId, contentSize, scale, evidenceRoot, referencePath, failureLogPath, exitCode }) {
  return {
    caseId,
    deviceId,
    contentSize,
    scale,
    referencePath: evidenceRelativePath(evidenceRoot, referencePath),
    capturePath: null,
    registration: null,
    comparedPixels: 0,
    mismatchedPixels: 0,
    status: "unmeasured",
    launchExitCode: exitCode,
    launchFailureLogPath: evidenceRelativePath(evidenceRoot, failureLogPath),
    notes: `simctl launch failed with exit ${exitCode}; no screenshot was taken, so the case is unmeasured.`,
  };
}
