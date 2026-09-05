# Export constants and flow-lowering prior art

Date: 2026-09-04

This is the evidence record for effect outsets, raster density, and PDF page boxes. Flow research is
prior art only; no Canvas flow vocabulary is chosen here.

## 1. Effect outset

CSS Backgrounds and Borders Level 3 §6.1.2 leaves the exact blur algorithm unspecified but requires
`box-shadow` to approximate a Gaussian with standard deviation equal to half the blur radius. Its
visible transition is approximately twice the blur radius, centred on the unblurred edge. §6.1.1
applies spread before blur and clips inset-shadow ink inside the padding edge. [W3C CSS Backgrounds
§6.1](https://www.w3.org/TR/css-backgrounds-3/#shadow-blur).

Filter Effects Level 1 §13.1.9 maps `blur(radius)` to `feGaussianBlur stdDeviation="radius radius"`;
§13.1.10 applies the same primitive to `drop-shadow()`, and §13.2 requires a UA-defined shorthand
filter region large enough for the expanded visible area. [W3C Filter Effects
§13.1–13.2](https://www.w3.org/TR/filter-effects-1/#FilterCSSImageValue). The SVG filter element's
historical lacuna region (`x=-10%`, `y=-10%`, `width=120%`, `height=120%`) is a hard clip and can clip
large blurs; it is not an extent formula. [2014 Filter Effects WD
§8](https://www.w3.org/TR/2014/WD-filter-effects-1-20141125/#FilterEffectsRegion).

Skia defines mask-filter sigma as Gaussian standard deviation and its blur engine uses
`ceil(3*sigma)` as the finite kernel radius, with sigma at or below 0.03 producing radius zero.
[SkMaskFilter](https://github.com/google/skia/blob/main/include/core/SkMaskFilter.h),
[SkBlurEngine.h](https://skia.googlesource.com/skia/+/2f538e329a7d/src/core/SkBlurEngine.h).
The shipped renderer passes `effect.radius / 2` as sigma for drop-shadow masks and layer/foreground
blur (`canvas/vendor/open-pencil/engine.source.mjs`, `drawShapeDropShadow` and `renderNode`).

Therefore, with non-negative Canvas radius `r`, `k = ceil(3r/2)` (or zero when `r/2 <= 0.03`):

- layer/foreground blur: `{left:k, top:k, right:k, bottom:k}`;
- outer shadow with spread `s` and offset `(dx,dy)`:
  `{left:max(0,k+s-dx), right:max(0,k+s+dx), top:max(0,k+s-dy), bottom:max(0,k+s+dy)}`;
- inner shadow: zero external outset because its ink is clipped inside;
- background blur: zero external ink outset, while its backdrop dependency still widens the
  compositing scope to the nearest isolation boundary;
- multiple effects: per-side maximum.

Glow and soft edge have no Canvas schema or renderer mapping, so they have no Canvas formula.

## 2. Raster density constants

PDF/X specifies no minimum image resolution; a 50-PPI image can conform. PDF/A likewise does not
regulate image resolution. [PDF/X in a
Nutshell](https://pdfa.org/wp-content/uploads/2017/05/PDFX-in-a-Nutshell.pdf), [PDF/X-Plus
requirements](https://pdfa.org/further-quality-requirements-pdfx-plus/), [PDF/A in a
Nutshell](https://pdfa.org/wp-content/uploads/2011/08/PDFA-in-a-Nutshell_1b.pdf). Accordingly, 300 PPI
below is a Canvas commercial-print policy, not a PDF/X or PDF/A conformance rule.

PowerPoint's documented default slide-image export is 96 DPI (1280×720 for its widescreen preset).
[Microsoft](https://learn.microsoft.com/pt-pt/office/troubleshoot/powerpoint/change-export-slide-resolution).
Apple defines iOS assets as `@2x` and `@3x`, two or three pixels per point, rather than prescribing
one physical PPI. [Apple HIG: Images](https://developer.apple.com/design/human-interface-guidelines/images).
Android defines `ldpi` 120/0.75×, `mdpi` 160/1×, `hdpi` 240/1.5×, `xhdpi` 320/2×, `xxhdpi`
480/3× and `xxxhdpi` 640/4×. [Android density
buckets](https://developer.android.com/training/multiscreen/screendensities). The HTML Living Standard
defines the `srcset` density descriptor, requires a floating-point value greater than zero, and
supplies an implicit `1x` candidate when `src` is present and no `1x` candidate is declared.
[WHATWG responsive images](https://html.spec.whatwg.org/multipage/images.html#srcset-attribute).

Canvas keeps one canonical coordinate unit (one CSS px at 96 PPI) and declares these sampling
policies:

| role | outputs |
| --- | --- |
| slide | 96 PPI / 1× |
| page | 300 PPI / 3.125× (Canvas print policy) |
| route | 96/192/288 effective PPI at 1×/2×/3× |
| ios | 192/288 effective Canvas PPI at @2x/@3x |
| android | 120/.75×, 160/1×, 240/1.5×, 320/2×, 480/3×, 640/4× |

`pixelDimension = ceil((logicalDimension + both effect outsets) * scale)`. Render allocation failure
is fatal; output is never silently downscaled.

## 3. Bleed and PDF page boxes

ISO 32000-1:2008 §14.11.2 defines `MediaBox` as the physical medium, `CropBox` as display/print
clipping (defaulting to `MediaBox`), `BleedBox` as production clipping including extra bleed,
`TrimBox` as the intended finished size, and `ArtBox` as meaningful content. Boxes outside
`MediaBox` are effectively intersected with it. [ISO 32000-1
§14.11.2](https://developer.adobe.com/document-services/docs/assets/35e4369068f86065372c18787171a17e/PDF_ISO_32000-1.pdf).
PDF/X-4 requires `MediaBox` and either `TrimBox` or `ArtBox`, not both; when bleed is declared,
`BleedBox` must be outside `TrimBox`. PDF/X does not prescribe the bleed amount. [PDF Association:
PDF/X key facts](https://pdfa.org/pdfx-the-key-facts/). Adobe calls 0.125 inch (9 pt, approximately
3 mm) typical and tells authors to confirm with their print provider. [Adobe InDesign bleed
guidance](https://helpx.adobe.com/indesign/desktop/print/page-set-up-and-printer-marks/print-bleed-and-slug-areas.html).

Canvas `physical` is the declared trim size; `bleed` is already points. With uniform bleed `b`, trim
width `w`, and trim height `h`:

```text
MediaBox = CropBox = BleedBox = [0, 0, w + 2b, h + 2b]
TrimBox = [b, b, b + w, b + h]
ArtBox = absent
```

Authored trim origin `(0,0)` maps to `(b,b)`, allowing negative Canvas coordinates to paint into
bleed. `safeMargin` is an authoring guide, not `ArtBox`. Fold marks are production marks drawn only
in the top and bottom bleed bands; folds with zero bleed fail.

## 4. Flow prior art — deferred

Figma models a `Reaction` as a trigger plus actions. Its triggers include click, hover, press, drag,
timeout, mouse, key and media events; node actions distinguish navigate, swap, overlay, scroll-to and
change-to, with separate back and close actions. [Figma
Trigger](https://developers.figma.com/docs/plugins/api/Trigger/), [Figma
Action](https://developers.figma.com/docs/plugins/api/Action/). Sketch attaches a `Flow` to a layer
with a target artboard or `Flow.BackTarget` and an animation type; its published enum includes `none`
and `slideFromLeft`. [Sketch Flow](https://developer.sketch.com/reference/api/#flow). Adobe XD exposes
Tap, Drag, Hover, Time, Keys & Gamepad, Voice, and End of Playback triggers, with Transition,
Auto-Animate, Overlay, Scroll To, Previous Artboard and playback actions. [Adobe XD
prototyping](https://helpx.adobe.com/xd/desktop/prototype/create-prototypes.html).

ECMA-376 PresentationML `p:transition` carries `spd`, `advClick`, and `advTm`; its standard children
include blinds, checker, circle, dissolve, comb, cover, cut, diamond, fade, newsflash, plus, pull,
push, random, randomBar, split, strips, wedge, wheel, wipe and zoom (ECMA-376 Part 1, PresentationML;
see `research/pptx-capabilities.md` §“Transitions and animations”). HTML anchor activation follows
`href`; SwiftUI `NavigationLink` presents a destination within a navigation stack/split view; Compose
registers destinations in `NavHost` and navigates with `NavController.navigate()`.
[HTML §4.6](https://html.spec.whatwg.org/multipage/links.html), [SwiftUI
NavigationLink](https://developer.apple.com/documentation/swiftui/navigationlink), [Android
Navigation](https://developer.android.com/guide/navigation/design).

There is no published shared algebra among these systems. On 2026-09-04 the product decision was to
export static designs only: exporter IR emits `flows: []`, all 36 flow capability rows are `ignore`,
and no target flow lowering is implemented. This is a product verdict, not an unmeasured capability.
