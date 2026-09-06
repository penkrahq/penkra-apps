# HTML browser runner race-fix verification — 2026-09-06

## Scope and outcome

This follow-up fixes the two remaining rejection races in the task-owned browser runner. `measure()` now attaches a rejection handler to every load-event waiter immediately and cancels/removes that waiter when navigation fails. `connectCdp.send()` removes and rejects the same pending request when `socket.send()` throws synchronously. A socket close before open rejects the open wait immediately.

All bounded waits retain timer/listener cleanup: DevTools discovery, CDP open, CDP commands, CDP events, target discovery, navigation/load events, and readiness evaluation. An unobserved forced child-exit timeout remains `terminated:false`, `observedExit:false`, and an explicit failure.

## Focused race and lifecycle tests

Command (exit 0):

```text
node --test compatibility/luna-html-batch-browser-runner.test.mjs
```

Result: 10 passed, 0 failed, 0 cancelled, 0 skipped. The fake transport/page cases cover navigation rejection first, navigation stalling past the load-event deadline, synchronous CDP send failure, close-before-open, bounded CDP open/command/event waits, and no `unhandledRejection` plus waiter cleanup for both navigation races. Fake-child cases cover success, mismatch/missing-result exit gates, confirmed graceful exit, unobserved forced timeout, and observed forced exit.

## Corpus regeneration and prior suites

Command (exit 0):

```text
node --test compatibility/luna-html-batch-browser.test.mjs compatibility/luna-html-batch-browser-runner.test.mjs src/export-delivery.test.mjs src/export-delivery-contract-matrix.test.mjs src/export-four-format-batch.test.mjs src/export-bundle.test.mjs src/export-service.test.mjs src/export-publication-matrix.test.mjs
```

Result: 49 passed, 0 failed, 0 cancelled, 0 skipped. The default compatibility test remains corpus-only: it reads the committed 120-entry corpus and regenerates current HTML bundles in a cleaned temporary directory. It does not launch 120 browser navigations.

The prior successful corpus remains unchanged under `corpus/`. The prior post-gate live corpus remains under `run-N7ab8U/` with 120/120 successful observations. No new live run was required for these fault-path-only corrections, per the follow-up request.

No production, service, renderer, manifest, protected prose, mobile capability, existing browser helper, or other worktree files changed.
