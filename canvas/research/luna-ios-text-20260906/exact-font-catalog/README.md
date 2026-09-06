# iOS exact mobile font-catalog evidence

This subtree uses the production mobile font catalog path for ten cases. Cases 05 and 09 are intentionally excluded from native capture because the catalog correctly rejects their missing exact italic face.

- `catalog.json` records full-fixture, independent italic, mislabeled-face, and correct regular/bold catalog results.
- Generated Swift and the generated `CanvasFonts.swift` registration helper are under `swift/`; emitted font bytes are under `Fonts/`.
- `font-registration-facts.json` verifies built-app font filenames and SHA-256 bytes against the catalog. The host intentionally has no UIAppFonts bypass; generated initializers call `CanvasFonts.register()`.
- `measurements.json` contains 30 case/device/content-size entries with evidence-relative paths, strict existing comparison tolerance, and baseline comparisons against `../font-registered/`.
- Cases 01/05/06/09 identity was not treated as italic fidelity. This run captures no italic cases; any missing-face rejection remains explicit and no capability verdict was changed.
- Observed content sizes were {"iphone":"accessibility-extra-extra-large","ipad":"large"} and are restored in the capture cleanup finally block. 6 identity-participating captures are retained per state.
- The temporary build project is retained at `/var/folders/vb/g066rwxj3mj405k01t_vjkf80000gn/T/canvas-luna-ios-text-font-catalog-Z7L74m`; `xcodebuild-command.txt` and `xcodebuild.log` preserve the exact compiler command/result.

This is evidence only. No mobile emitter, capability table, vendor font, or font asset was edited.
