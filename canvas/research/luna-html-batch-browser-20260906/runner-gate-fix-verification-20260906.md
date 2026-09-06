# HTML batch browser runner gate fix verification — 2026-09-06

## Outcome

The runner now writes measurements before returning its gate result and sets the CLI process exit code to nonzero for any mismatch, missing expected observation or screenshot, incomplete result, unobserved browser termination, or infrastructure failure. It never calls `process.exit` during cleanup. Child termination is successful only when the child exit event is observed; a forced timeout is retained as `terminated:false`, `observedExit:false`, and an explicit failure.

## Focused runner regressions

Command (exit 0):

```text
node --test compatibility/luna-html-batch-browser-runner.test.mjs
```

Six passed, zero failed/cancelled/skipped. The cases cover:

- complete success returns exit code 0;
- mismatch, missing observation, missing screenshot, and infrastructure failure each return 1;
- confirmed graceful child exit is successful without forcing;
- an unobserved forced-exit timeout is explicit failure/unknown and does not fabricate a SIGKILL exit;
- an exit observed after forcing is successful and marked forced;
- fake CDP open, command, and event waits reject with bounded `CANVAS_BROWSER_TIMEOUT` errors.

## Fresh explicit live run

Command (exit 0):

```text
node scripts/luna-html-batch-browser.mjs
```

Fresh non-overwriting evidence is retained under `run-N7ab8U/`: 40 actual HTML bundle directories, 120 PNG screenshots, and `measurements.json`. The run measured all 40 real `slide.html` files at 800, 1200, and 1600 × 600 with device scale factor 1. It recorded 120 observations, 120 pass, 0 mismatch, 0 infrastructure failures, 0 console/page exceptions, and 0 failed local resource requests. The CLI printed `exitCode:0` and actually exited 0.

Chrome was version `152.0.7977.76` at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`; Node was `v24.19.0`. One isolated task-owned Chrome process and one CDP page were used. Chrome required the exact-child SIGKILL fallback after bounded SIGTERM, but its exit event was observed, so the result correctly records `terminated:true`, `observedExit:true`, `forced:true`, and `exit.signal:"SIGKILL"`. The isolated profile was removed; no Chrome process remained. An unobserved timeout is covered separately by the fake-child test and is never reported as success.

## Full non-live regression

Command (exit 0):

```text
node --test compatibility/luna-html-batch-browser.test.mjs compatibility/luna-html-batch-browser-runner.test.mjs src/export-delivery.test.mjs src/export-delivery-contract-matrix.test.mjs src/export-four-format-batch.test.mjs src/export-bundle.test.mjs src/export-service.test.mjs src/export-publication-matrix.test.mjs
```

Result: 45 passed, 0 failed, 0 cancelled, 0 skipped. The default compatibility test reads the committed `corpus/` and does not launch live Chrome or perform 120 navigations. The original successful corpus remains preserved; the fresh post-fix live corpus is separately retained under `run-N7ab8U/`. No production, service, renderer, manifest, protected prose, mobile capability, or existing browser helper/test was changed.
