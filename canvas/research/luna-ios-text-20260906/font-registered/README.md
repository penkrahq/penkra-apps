# iOS rich-text decoration evidence

This directory is retained evidence for the twelve Canvas-authored text cases in `fixture.json`. Each case is a separate 340x180 frame selected by source ID through the temporary Swift host.

- Generated Swift is under `swift/`; the source was produced by `exportSwiftUI(buildCapabilityVerificationIR(...))`.
- Canvas references are under `references/`, and cropped settled native captures are under `captures/`.
- The pre-font-registration 36-case baseline is preserved at `../baseline-pre-font-registration/` and is not used by these tests.
- `measurements.json` contains all 36 case/device/content-size entries. Evidence paths are relative to this directory; `pass` and `mismatch` are distinct measured statuses, while `unmeasured` records a missing capture/reference limitation.
- Comparison uses the existing 2-physical-pixel boundary exclusion and 2-channel-step tolerance. Registration is reported separately as the explicit center crop of the authored frame.
- `identityChecks` records SHA-256, byte size, and decoded-pixel identity for cases 01, 05, 06, and 09 at every device/content-size state. Any identical output is explicitly `missing-styling-evidence`, not visibly rendered style evidence.
- Observed content sizes were {"iphone":"accessibility-extra-extra-large","ipad":"large"} and are restored in the capture cleanup finally block.
- Installed bundle font facts: UIAppFonts declared=true, values=["Inter-Regular.ttf","Inter-Bold.ttf"], bundled font files=["Inter-Bold.ttf","Inter-Regular.ttf"], all declared fonts present=true.
- Identity results: A3D92728-7F7B-44D1-BE51-155B891905D9/large=missing-styling-evidence; groups=case-01/case-05/case-09 (pixel+byte); A3D92728-7F7B-44D1-BE51-155B891905D9/accessibility-extra-extra-large=missing-styling-evidence; groups=case-01/case-05/case-09 (pixel+byte); 8F053C2C-958D-4CC5-AB38-E838CFAC9442/large=missing-styling-evidence; groups=case-01/case-05/case-09 (pixel+byte)
- The temporary build project is retained at `/var/folders/vb/g066rwxj3mj405k01t_vjkf80000gn/T/canvas-luna-ios-text-nyki5Z`; `xcodebuild-command.txt` and `xcodebuild.log` preserve the exact compiler command and result.

This is decoration/style evidence only. No capability table or verdict was changed.
