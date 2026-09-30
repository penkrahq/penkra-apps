# Canvas tab-open investigation (research only)

26 September 2026. Scope: Canvas 0.3.12, source commit `8c188d14`, built `dist/app.js` SHA-256 `02a3f218d4c3b35f3a65b56d19ce0e3bb9cbd717b2b01e65f028a00a40381711`. No application or host code was changed, committed, or published for this investigation. This file records evidence and recommendations, not a separate implementation plan; approved implementation work belongs in Canvas's App TODO.

## Finding

The 10-second failure is an **isolated App-test harness deadline**, not a Canvas timeout and not the normal host's 15-second renderer-readiness timeout. The two clocks measure different things but race during `penkra app test`. The host's 15-second clock waits only for the **Penkra-owned preload bridge**, while the test harness's 10-second clock waits for the **whole `openInstalled` operation**, including loading and evaluating Canvas. Thus the test can fail at 10 seconds even though the renderer bridge is already ready and its own 15-second timer never fires. This overlap appears accidental rather than an intentional startup policy; no code comment explains a rationale for a shorter test limit.

The prominent Canvas-specific startup cause is eager inclusion of two complete icon catalogs in the library-screen JavaScript. Together they contribute **12,381,660 of 15,539,268 output bytes (79.7%)**, although the library screen does not need document icon definitions. The 10 trial traces show 0.39–6.68 seconds in the main script's resource/streaming-parse window and 0.35–6.57 seconds in its background parse/compile span, varying heavily with Chromium profile warmth and machine load. This is a local packaged `penkra-app://` resource, **not an internet download**: first-byte latency was only 16–22 ms. Do not treat the resource window as pure network time or add it to parse time; V8 streaming parsing overlaps and can backpressure transfer.

## Deadline inventory and ownership

| File and line | Limit | Owner | Waits for; effect on expiry |
| --- | ---: | --- | --- |
| Penkra `apps/desktop/src/appTestHostPhases.ts:5,12,18-27`, called by `apps/desktop/src/appTestHost.ts:99-107` | 10,000 ms | Penkra **host main**, isolated `penkra app test` process only | Entire `tab-open` phase (`runtime.appTabs.openInstalled`). `Promise.race` rejects with `App integration phase "tab-open" exceeded 10000 ms`; test records failure, then stops runtime. The raced operation is not directly aborted by this helper. |
| Penkra `apps/desktop/src/appRendererIpcBridge.ts:37,51-67`, awaited at `apps/desktop/src/appTabViewHost.ts:1802-1807` | 15,000 ms | Penkra **host main**, normal and test tabs | Host-owned renderer preload's `runtime.markReady()` IPC, sent by `apps/desktop/src/appPreload.ts:172-176`. Rejects `App renderer … did not become ready in time`; `appTabViewHost` catches, reports tab-create failure and closes it. It does **not** measure Canvas first paint or application usability. |
| Penkra `apps/server/src/appDeveloperTools.ts:39,158-177` | 30,000 ms default, caller-overridable | Penkra **server/developer-tool supervisor** | Entire disposable App integration child process. On expiry, stops the child and rejects the test with `App integration test exceeded … ms`. This is an outer safety bound, not a tab-ready policy. |
| Penkra `apps/desktop/src/appTestHost.ts:134,136-144` | 5,000 ms / 2,000 ms | Penkra **host main**, test cleanup only | Runtime stop / terminal evidence write. These start *after* tab-open succeeds or fails and cannot cause the opening deadline. |
| Penkra `apps/server/src/appDeveloperTools.ts:8-10,247-268` | 1,000 ms stop; 250 ms exit grace; 25 ms result poll | Penkra **server/developer-tool supervisor** | Post-result child cleanup and polling, not tab readiness. |
| Penkra `apps/desktop/src/appRendererRpc.ts:143,227-235` | 120,000 ms default | Penkra **host main** RPC broker | Later host-to-renderer RPC calls; on expiry cancels that request. Not the initial `loadURL`/preload-ready gate. |
| Canvas `src/canvas-api.mjs:31-39` | 150 ms retry delay, not a deadline | **Canvas app** renderer | One transient GET retry for Canvas account data; no timeout or tab close. |
| Canvas `src/image-materialization.mjs:7,160` | 60,000 ms | **Canvas app** image-materialization path | Aborts an individual image fetch; not library startup. |

`apps/desktop/src/appTabViewHost.ts:1807` separately awaits Electron `webContents.loadURL(documentUrl)` together with preload readiness. There is no explicit production `loadURL`/Canvas-bootstrap timeout there. Electron resolves `loadURL` on `did-finish-load`; module scripts can delay the load event. See [Electron `webContents.loadURL`](https://www.electronjs.org/docs/latest/api/web-contents#contentsloadurlurl-options) and the [HTML script processing model](https://html.spec.whatwg.org/multipage/scripting.html). `apps/desktop/src/appTabObserver.ts:536,1041-1054` also has a default 10-second *agent wait-for-text* operation, but it is post-open observation, not this tab-open failure.

The **renderer is a Chromium/Electron process and tab view owned by Penkra host**. Canvas is untrusted App JavaScript running *inside* that renderer; Canvas does not own the renderer lifecycle or the host tab deadline. The authoritative user-visible opening decision should be one Penkra host readiness contract with explicit phases (preload bridge, document load, and optionally first visible App frame). The test should use that contract and a compatible outer deadline, rather than imposing an unrelated shorter success criterion. Merely raising the test limit to 15 seconds would remove the observed race but would not cure Canvas's excessive startup work or make the 15-second preload timer a meaningful Canvas-ready check.

## Reproducible ten-open trace sample

I launched the **actual compiled Penkra isolated App-test host** (`apps/desktop/dist-electron/entry.js`) with the exact Canvas `dist` and Electron binary, and enabled Chromium startup tracing (`devtools.timeline,v8,disabled-by-default-v8.compile,blink.user_timing,loading`). Five cold runs each used a new disposable Chromium profile. Five warm runs reused one profile from a preceding cold run, but still launched a new host process each time. The tab was opened via the host's real `openInstalled` path. Times are milliseconds. `Ready` is the host's `app-renderer-ready` diagnostic, from tab open to `Promise.all(loadURL, preload-ready)` completion. `First byte`, script resource window, and V8 spans are from Perfetto trace events for `app.js`.

| Run | Host ready | First byte | `app.js` resource window | V8 background parse/compile | V8 module-evaluation window | First paint |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Cold 1 | 8,569 | 16.3 | 6,681.5 | 6,565.9 | 1,611.0 | Not observable: hidden test window |
| Cold 2 | 3,327 | 20.7 | 2,354.5 | 2,231.3 | 834.3 | Same |
| Cold 3 | 2,173 | 16.9 | 1,409.1 | 1,356.0 | 642.7 | Same |
| Cold 4 | 3,291 | 16.4 | 2,356.5 | 2,270.3 | 775.7 | Same |
| Cold 5 | 2,167 | 16.7 | 1,407.2 | 1,322.3 | 633.0 | Same |
| **Cold median** | **3,291** | **16.7** | **2,354.5** | **2,231.3** | **775.7** | **Not measured** |
| Warm 1 | 2,513 | 20.9 | 1,798.8 | 1,690.1 | 566.6 | Same |
| Warm 2 | 3,067 | 16.0 | 2,122.7 | 2,048.6 | 823.4 | Same |
| Warm 3 | 1,916 | 16.2 | 940.8 | 908.4 | 829.7 | Same |
| Warm 4 | 848 | 15.7 | 462.8 | 435.8 | 274.0 | Same |
| Warm 5 | 721 | 22.2 | 391.6 | 354.9 | 217.8 | Same |
| **Warm median** | **1,916** | **16.2** | **940.8** | **908.4** | **566.6** | **Not measured** |

Raw Perfetto traces and host logs are in Penkra's local scratch `.penkra/scratch/canvas-tab-open.Tkomkn/` (`cold-1` … `cold-5`, `warm-1.trace` … `warm-5.trace`). This path is deliberately not part of the App package. Host trace annotations and Chromium Resource/V8 slices were joined by request ID. Trace buffer warnings mean tiny events might be lost, although the relevant app.js events and host readiness lines were present in each run. The large cold-run variance is real and warns against presenting a single deterministic startup time.

**First-render limitation:** the official App-test host creates `BrowserWindow({show:false})` at `apps/desktop/src/appTestHost.ts:42`, and it presents the tab only *after* `openInstalled` returns (`:108`). All ten traces contain zero Paint/FirstPaint events. Consequently a first-render number from those traces would be invented. A foreground, visible-tab trace with a documented paint marker is still needed before claiming measured end-to-end first-render time. The ten-run table does meet the requested ready, resource, parse/compile, and evaluation measurements; it cannot honestly satisfy first paint without a different (visible) harness. Canvas's `ui.render` JavaScript work is not equivalent to Chromium painting pixels.

## Bundle attribution and first-screen need

The shipped `canvas/dist/app.js` is **15,539,268 bytes raw (14.82 MiB)**, **3,067,202 bytes gzip -9 (2.93 MiB)**, or **2,743,136 bytes Brotli q5 (2.62 MiB)**. The compressed sizes describe possible packaging/transport; the local `penkra-app://` load is not an HTTP download of the Brotli size. In-memory Bun `metafile:true` analysis with the App's production build options attributed 1,880 source modules as follows (rounded per input contribution; built output may vary by a few KiB):

| Module/source | Bytes in initial output | Library first-screen need? |
| --- | ---: | --- |
| `@iconify-json/material-symbols/icons.json` | 7,988,728 | No: document icon rendering/search only |
| `@iconify-json/ph/icons.json` | 4,392,932 | No: document icon rendering/search only |
| `vendor/open-pencil/engine.source.mjs` | 2,056,608 | No for library; yes for document editor |
| `canvaskit-wasm/bin/canvaskit.js` | 133,855 | No for library; editor rendering |
| `src/app.mjs` | 124,359 | Yes, but its editor code could be route-split |
| `yjs/dist/yjs.mjs` | 76,091 | No for library; document collaboration |
| `@iconify-json/feather/icons.json` | 63,123 | No for library |
| Vue runtime-core | 61,989 | Engine/editor dependency, not library shell |
| Lucide icon definitions and aliases | 38,628 | Potentially small shell subset only |
| QuickJS core | 34,346 | No for library; document scripts |

The static chain is `src/app.mjs:35-40` → `src/openpencil-render-document.mjs:1` → `src/pencil-icon-provider.mjs:2-4` → entire Iconify JSON catalogs. The icon lookups occur only when compiling icon nodes (`src/openpencil-render-document.mjs:552,843`), not to show the initial library. Canvas starts at `route: "library"` (`src/app.mjs:119`), then runs top-level `await bootstrap()` (`:355-370`) for identity/profile/library. For an editor tab, these catalogs may be needed soon, so deferring them must preserve correct icon rendering and avoid a blank editor while loading.

As a falsification check, building the **unchanged** entry with Bun `splitting:true` in memory emitted a 15,486,269-byte `app.js` plus only ~52 KiB in five other chunks. The two full icon catalogs stayed eager. Enabling splitting alone therefore cannot materially change this startup.

## Standard guidance and recommendation

Bun documents that JSON imports are inlined into the JavaScript output and that code splitting depends on import boundaries; its bundler performs tree shaking, but a whole imported catalog used for dynamic name lookups cannot be safely reduced to a handful of icons by ordinary tree shaking ([Bun bundler documentation](https://bun.sh/docs/bundler)). [Vue's performance guide](https://vuejs.org/guide/best-practices/performance) recommends measuring bundle size and lazy-loading code not needed at startup. [web.dev's code-splitting guidance](https://web.dev/learn/performance/code-split-javascript) likewise frames the benefit as avoiding parse/compile/evaluation of unused startup JavaScript, not merely reducing HTTP bytes. Canvas uses a hand-built vanilla-module route coordinator, not Vue Router, so route splitting here would be its own dynamic imports, not a Vue Router configuration change.

Recommended root approach, subject to approval: separate a small library shell from editor-only modules, and replace the eager whole-library icon JSON imports with an on-demand icon provider (ideally per-library or per-document/icon subset, with caching). Keep compatibility/unknown-icon behavior identical and let the editor await the needed catalog before its first correct frame. Verify actual initial chunks and first visible frame on a production-like profile. Splitting the editor engine can reduce library startup further, but **the catalogs are the first, dominant target**. Raising the host test timeout is only a correctness adjustment to the harness contract, not a substitute for reducing work. Compressing the package or caching helps distribution and repeat opens; it does not remove first-run JavaScript parse/evaluation. Chromium code-cache warmth explains much of the warm-run improvement but cannot be assumed on new profiles.

### Transparent provisional estimate, not a benchmark of an unbuilt change

If both large icon catalogs leave the initial chunk, its raw size would be about **15,539,268 − 12,381,660 = 3,157,608 bytes (3.01 MiB)**, or **20.3%** of today's raw entry. This is a source-attribution estimate; actual chunk boundaries and shared dependencies must be measured after implementation. If the editor engine also leaves the library entry, a rough lower target is **~1.10 MB raw**, subject to dependency graph changes.

For the *library route only*, a deliberately simple proportional model uses the cold median V8 parse span of **2,231 ms × 0.203 = 453 ms** after catalog deferral, versus 2,231 ms now; warm median **908 ms × 0.203 = 184 ms**, versus 908 ms now. Applying the same proportional factor to the median evaluation window (776 ms cold, 567 ms warm) and retaining about 0.2–0.4 s other host/startup overhead yields approximately **0.8–1.2 s cold** and **0.4–0.8 s warm** to host ready. The observed cold outlier similarly models near **~2.1 s**, so a prudent expected range is **~0.8–2.5 s cold and ~0.4–1.3 s warm**, not a guaranteed SLA. The model is uncertain because V8 streaming parse overlaps resource loading, module evaluation includes asynchronous bootstrap work, JSON parse cost need not scale linearly, and the first visible paint was unmeasured. It predicts **library host-ready**, not document-editor interactive time. The latter could merely move icon cost later unless catalogs are granular/cached.

This file records findings only. No timeout, bundle, App code, release, or live design nodes were changed.

## Approved implementation follow-up (2026-09-26)

The preceding section is the **pre-change investigation**, not the current
package state. The approved implementation replaces whole-catalog loading on
document open with generated, local prefix chunks. The build resolves Material
Symbols, Phosphor, and Feather names and aliases; adaptive prefix routing caps
each render chunk at 32 KiB. The generated search index is loaded only by icon
search, not by the editor renderer. A document collects effective icon names
(including ref descendant overrides), awaits their chunks in parallel, and
only then permits the first icon-bearing frame. Session caches deduplicate
concurrent loads and subsequent uses. Editor-only engine, CanvasKit, Yjs, and
QuickJS code is behind a document-route dynamic import. No host deadline was
changed.

The packaged library entry and its three *static* imports total **162,155 B
raw, 46,360 B gzip, 40,169 B Brotli**, versus the baseline `app.js` alone at
15,539,268 B raw, 3,067,202 B gzip, 2,743,136 B Brotli. The icon package
contains 24,395 Material names in 859 files, 9,198 Phosphor names in 769 files,
and 286 Feather names in 166 files. The largest rendering chunk is 32,718 B.
The 764,706 B search index is not in the library or document render import
graph. All chunk URLs are relative to the installed `penkra-app://` origin;
the installed App returned status 200 and JSON for a Phosphor chunk.

Visible isolated-host benchmark: five cold runs used fresh profiles; five
warm runs reused their paired cold profile. The host-ready baseline above was
measured in a hidden window, so only host-ready is directly comparable.
The visible window's first paint and first-contentful paint are new measures.

| Library route (ms) | Cold 1–5 | Cold median | Warm 1–5 | Warm median |
| --- | --- | ---: | --- | ---: |
| Host ready | 119, 118, 107, 128, 150 | **119** | 134, 144, 107, 128, 160 | **134** |
| First paint | 124, 120, 116, 136, 148 | **124** | 168, 152, 112, 136, 152 | **152** |
| First contentful paint | 156, 156, 148, 168, 188 | **156** | 168, 184, 148, 164, 196 | **168** |

One warm run reached ready in 144 ms according to its host event log but its
final JSON result was not written before process exit; its visible paint
events were recorded. The baseline host-ready medians were 3,291 ms cold and
1,916 ms warm. The machine experienced large background-load swings during
testing, so these are observations, not latency guarantees.

For first document open, a visible isolated host used a local 100-Phosphor-icon
QA fixture with a 1200×1000 free-layout frame (not a WorkApp/WorkBase design).
A visible editor `capturePage` shows the complete 10×10 icon grid, matching
the export screenshot (`/tmp/canvas-icon-document-qa.png` and
`/tmp/canvas-icon-document-export.png` on the QA machine). First paint is the
loading UI, **not** the completed
document artwork. `Document interactive` is Canvas's measured duration from
document-open start to its first-frame callback; `editor visible` is elapsed
time from navigation until that callback and the next animation frame.

| Corrected 100-icon grid (ms) | Cold 1–5 | Cold median | Warm 1–5 | Warm median |
| --- | --- | ---: | --- | ---: |
| Host ready | 158, 220, 164, 164, 109 | **164** | 137, 138, 176, 130, 118 | **137** |
| First paint (loading UI) | 160, 180, 168, 164, 120 | **164** | 144, 148, 168, 132, 128 | **144** |
| Document interactive | 411, 386, 428, 430, 335 | **411** | 387, 417, 454, 373, 361 | **387** |
| Editor visible after next frame | 589, 628, 592, 621, 445 | **592** | 525, 556, 630, 518, 497 | **525** |

An earlier timing cohort used Canvas's default horizontal auto-layout by
mistake, producing a very wide row rather than a grid; those timings are
superseded here. Two corrected-fixture attempts lost foreground visibility
when another App window became active and were excluded; two additional
visible cold/warm pairs completed the five-pair set above. The original
baseline did not include a document-open timing, so there is no honest
before/after document-open number.

Tests: the full suite passed 572 tests before the final adaptive chunk-size
refinement; all 13 icon-provider and icon-chunk tests passed afterward,
including catalog-to-file coverage, picker search, a real Yjs remote update,
a script insertion, ref overrides, unknown names, offline local-file loading,
and 100-icon preparation.
All 141 affected renderer, screenshot, and icon tests passed on the final
source, and the final packaged build passed its host smoke test.
Canvas currently exposes icon selection through `icons.search`; it has no
in-editor graphical icon picker, so the picker-selection test exercises that
search API and the resulting first-frame render, not a UI click. A graphical
picker is a separate product decision.
The packaged `penkra app test` also reached a ready tab. No release was
published and no WorkApp or WorkBase design node was changed.
