# OOXML PresentationML capability boundary

**Research date:** 2026-09-04  
**Normative target:** ISO/IEC 29500 / ECMA-376 PresentationML (`p:`) plus DrawingML (`a:`), as represented by Microsoft's Open XML SDK schema metadata. Microsoft Office extension namespaces (`p14:`, `a14:`, etc.) are called out separately. The schema source is the [Open XML SDK repository](https://github.com/dotnet/Open-XML-SDK/tree/main/data/schemas), whose namespace table identifies the standard DrawingML and PresentationML namespaces and Office-versioned extensions ([namespace data](https://github.com/dotnet/Open-XML-SDK/blob/main/data/namespaces.json)).

## 1. Capability matrix

“Native” means the object remains a first-class PowerPoint object in the package and PowerPoint UI. “Image fallback” means the visual can be preserved only by rasterizing it (or, where suitable, embedding SVG as a picture), losing some or all editability/semantics.

| Canvas/design feature | PPTX status | Native representation and boundary |
|---|---|---|
| Rectangles, ellipses, lines, arrows, stars, callouts, connectors | **Native** | `p:sp/p:spPr/a:prstGeom prst="…"`; connectors use `p:cxnSp`. Presets are the `ST_ShapeType` vocabulary. |
| Arbitrary vector paths | **Native, with restrictions** | `a:custGeom/a:pathLst/a:path`; commands are `a:moveTo`, `a:lnTo`, `a:arcTo`, `a:quadBezTo`, `a:cubicBezTo`, `a:close`. Multiple paths are allowed. This is DrawingML path syntax, not an SVG path string; SVG filters, masks, clipping paths, boolean operations, and arbitrary paint servers do not transfer automatically. |
| Rich text / character-range marks | **Native** | A text body contains `a:p` paragraphs and `a:r` runs; each `a:r` can carry its own `a:rPr`. Runs are the native character-range styling unit. |
| Bullets and automatic numbering | **Native** | Paragraph-level bullet children of `a:pPr`: `a:buChar`, `a:buAutoNum`, or `a:buBlip`, with font/size/color controls. Nested appearance uses paragraph `lvl`, margins, and indents; there is no HTML-list object. |
| Tables | **Native** | `a:tbl` in `p:graphicFrame`, with `a:tblPr`, `a:tblGrid`, `a:tr`, `a:tc`. Supports cell text, fill, borders, margins, row height, column width, and merges. It is not a spreadsheet calculation model. |
| Charts | **Native** | A `p:graphicFrame` contains `a:graphic/a:graphicData` and `c:chart r:id`; the chart is a separate chart part, commonly with an embedded workbook/cache. Chart types and formatting are schema-defined, not arbitrary Canvas drawings. |
| Bitmap pictures | **Native** | `p:pic` plus `p:blipFill/a:blip r:embed`; crop via `a:srcRect`, scaling via `a:stretch/a:fillRect`, repeat via `a:tile`. |
| SVG picture | **Native in modern Office extension; compatibility fallback normally included** | Office 2016-era SVG uses an extension relationship (for example `asvg:svgBlip`) associated with a normal `a:blip`; producers generally include a PNG fallback. SVG is still a single picture, not editable DrawingML shapes. |
| Solid, pattern, image fills | **Native** | `a:solidFill`, `a:pattFill`, `a:blipFill`; `a:noFill` and `a:grpFill` are also native. |
| Multi-stop linear gradient | **Native** | `a:gradFill/a:gsLst/a:gs` plus `a:lin ang="…" scaled="…"`. |
| Radial/rectangular/path gradient | **Native as a path gradient** | `a:gradFill/a:path`, whose `path` is `circle`, `rect`, or `shape`, optionally with `a:fillToRect`. “Radial” maps to `path="circle"`; DrawingML does not use a separate radial-gradient element. |
| Mesh/freeform gradient | **Absent** | No mesh-gradient element exists in standard DrawingML `CT_GradientFillProperties`; preserve only as an embedded picture/SVG whose renderer supports it. |
| Outer/inner shadow, glow, blur, soft edge | **Native** | `a:effectLst` or an effect graph `a:effectDag`; exact parameters are in §6. |
| CSS/compositor-style blend modes | **Limited native effect-graph facility, not a general shape property** | `a:blend` combines an effect container inside `a:effectDag`; `blend` is one of `over`, `mult`, `screen`, `darken`, or `lighten`. There is no general per-object `mix-blend-mode` attribute and no full Porter–Duff/CSS blend vocabulary. Unsupported composition must be flattened. |
| Groups and affine placement | **Native** | `p:grpSp` with `p:grpSpPr/a:xfrm`; child coordinate system uses `a:chOff/a:chExt`. Shape transform uses `a:xfrm` (`rot`, `flipH`, `flipV`) with `a:off/a:ext`. No arbitrary 3×3 matrix/skew transform exists at the ordinary shape-transform level. |
| Masters/layouts/placeholders | **Native** | `p:sldMaster` → `p:sldLayout` → `p:sld`; placeholders match through `p:ph` type/index. This is inheritance for slide chrome and placeholders, not arbitrary reusable component instances. |
| Theme colors and font schemes | **Native** | Theme part `a:theme/a:themeElements`: `a:clrScheme`, `a:fontScheme`, `a:fmtScheme`. Theme color references use `a:schemeClr`; fonts may use `+mj-lt`, `+mn-lt`, etc. |
| Speaker notes | **Native** | A slide relationship targets a notes-slide part whose root is `p:notes`; notes text is stored in its shape tree. Notes masters are separate. |
| Slide transitions | **Native** | `p:transition` with a transition child and timing/click attributes. Office adds later transition types in `p14:`/`p15:`. |
| Object animations | **Native** | `p:timing/p:tnLst` and `p:bldLst`; time nodes include `p:par`, `p:seq`, `p:anim`, `p:animClr`, `p:animEffect`, `p:animMotion`, `p:animRot`, `p:animScale`, `p:set`, `p:cmd`, `p:audio`, and `p:video`. Authoring is complex and weakly supported by open-source generators. |
| Embedded or linked audio/video | **Native** | Media parts/relationships plus picture/poster-frame markup and media timing nodes. Standard DrawingML includes `a:audioFile r:link`, `a:videoFile r:link`, and embedded WAV `a:wavAudioFile r:embed`; newer PowerPoint uses Office media extensions for embedded modern codecs. |
| Hyperlinks | **Native** | `a:hlinkClick` / `a:hlinkMouseOver` on run properties and non-visual drawing properties, backed by relationships; internal-slide actions use `action="ppaction://hlinksldjump"`. |
| Alternative text and object naming | **Native** | Non-visual properties `p:cNvPr`/`pic:cNvPr` carry `name`, `title`, and `descr`; newer Office uses a decorative-object extension. Reading order is primarily shape-tree order. |
| Semantic constraints, auto-layout, flex/grid, responsive layout | **Absent** | PPTX stores resolved coordinates/sizes in EMUs. It has no Yoga/Flexbox/Grid constraint model. Export must compute layout first. |
| Masks, SVG filters, mesh gradients, arbitrary blend stack, live design-system component instances | **Absent as equivalent editable objects** | Rasterize or embed SVG/picture; semantics and direct PowerPoint editability are lost. |

## 2. Shapes and geometry

A normal autoshape is `p:sp`. Its geometry is mutually exclusive:

```xml
<p:sp>
  <p:spPr>
    <a:xfrm rot="2700000" flipH="0" flipV="0">
      <a:off x="914400" y="914400"/>
      <a:ext cx="3657600" cy="1828800"/>
    </a:xfrm>
    <a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom>
    <a:solidFill><a:schemeClr val="accent1"/></a:solidFill>
  </p:spPr>
</p:sp>
```

`a:prstGeom` selects a named preset and optional adjustment guides in `a:avLst/a:gd`. `a:custGeom` supplies guide lists (`a:avLst`, `a:gdLst`), handles (`a:ahLst`), connection sites (`a:cxnLst`), a text rectangle (`a:rect`), and one or more paths (`a:pathLst`). The Open XML SDK schema exposes both geometry types and their path commands in the [DrawingML schema metadata](https://github.com/dotnet/Open-XML-SDK/blob/main/data/schemas/schemas_openxmlformats_org_drawingml_2006_main.json).

Coordinates are integer EMUs (914,400 per inch) for placement. Path coordinates are in the local `a:path w/h` coordinate space and are mapped into the shape extent. A custom path can remain editable as a PowerPoint freeform, but source-level constructs such as an SVG mask, clip path, filter graph, stroke alignment, or boolean operation are not preserved as such.

## 3. Text bodies and exact run-level properties

A PowerPoint shape text body is `p:txBody`; table/chart text uses the same DrawingML text vocabulary under other parents. Structure:

```xml
<p:txBody>
  <a:bodyPr wrap="square" lIns="0" rIns="0" tIns="0" bIns="0"/>
  <a:lstStyle/>
  <a:p>
    <a:pPr algn="l"/>
    <a:r>
      <a:rPr lang="en-US" sz="3200" b="1">
        <a:solidFill><a:srgbClr val="0B4778"/></a:solidFill>
        <a:latin typeface="Aptos Display"/>
      </a:rPr>
      <a:t>Rich </a:t>
    </a:r>
    <a:r><a:rPr i="1"/><a:t>text</a:t></a:r>
    <a:endParaRPr lang="en-US"/>
  </a:p>
</p:txBody>
```

`a:bodyPr` controls the box, not a character range. Important attributes include `rot`, `spcFirstLastPara`, `vertOverflow`, `horzOverflow`, `vert`, `wrap`, `lIns/tIns/rIns/bIns`, `numCol`, `spcCol`, `rtlCol`, `fromWordArt`, `anchor`, `anchorCtr`, `forceAA`, `upright`, and `compatLnSpc`; children select autofit (`a:noAutofit`, `a:normAutofit`, `a:spAutoFit`), preset text warp, scene/3D, and extensions.

Each `a:r` consists of optional `a:rPr` plus `a:t`. The exact standard attributes inherited by `a:rPr` from `CT_TextCharacterProperties` are:

| XML attribute | Meaning / units |
|---|---|
| `kumimoji` | Kumimoji compression flag. |
| `lang`, `altLang` | BCP-47-like language tags for proofing/font selection. |
| `sz` | Font size in hundredths of a point (`3200` = 32 pt). |
| `b`, `i` | Bold, italic booleans. |
| `u` | Underline enum (single, double, heavy, dotted, dashed, wavy variants, words, none). |
| `strike` | `noStrike`, `sngStrike`, or `dblStrike`. |
| `kern` | Minimum size at which kerning applies, hundredths of a point. |
| `cap` | `none`, `small`, or `all`. |
| `spc` | Character spacing in hundredths of a point. |
| `normalizeH` | Normalize text height. |
| `baseline` | Baseline shift in thousandths of a percent; positive superscript, negative subscript. |
| `noProof`, `dirty`, `err` | Proofing/spell-check state. |
| `smtClean`, `smtId` | Smart-tag state/id. |
| `bmk` | Bookmark name. |

The exact optional children are: `a:ln` (glyph outline); one character fill from `a:noFill`, `a:solidFill`, `a:gradFill`, `a:blipFill`, `a:pattFill`, `a:grpFill`; either `a:effectLst` or `a:effectDag`; `a:highlight`; underline line (`a:uLnTx` or `a:uLn`) and underline fill (`a:uFillTx` or `a:uFill`); typefaces `a:latin`, `a:ea`, `a:cs`, `a:sym`; `a:hlinkClick`; `a:hlinkMouseOver`; `a:rtl`; and `a:extLst`. This complete attribute/child contract is generated in Microsoft's [DrawingML Open XML SDK source](https://github.com/dotnet/Open-XML-SDK/blob/main/generated/DocumentFormat.OpenXml/DocumentFormat.OpenXml.Generator/DocumentFormat.OpenXml.Generator.OpenXmlGenerator/schemas_openxmlformats_org_drawingml_2006_main.g.cs). Thus bold, typeface, size, color/fill, outline, highlight, hyperlink, capitalization, baseline, language, and effects can differ on every run. Paragraphs and runs are first-class; Microsoft's `Paragraph` class lists `a:pPr`, `a:r`, `a:br`, `a:fld`, and `a:endParaRPr` as its children ([API](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.paragraph?view=openxml-3.0.1)).

## 4. Paragraphs, bullets, and numbering

`a:pPr` attributes are `marL`, `marR`, `lvl`, `indent`, `algn`, `defTabSz`, `rtl`, `eaLnBrk`, `fontAlgn`, `latinLnBrk`, and `hangingPunct`. Its children include line spacing `a:lnSpc`, space-before `a:spcBef`, space-after `a:spcAft`, bullet controls, `a:tabLst`, `a:defRPr`, and `a:extLst`. Microsoft's API documentation confirms that paragraph properties override conflicting inherited properties ([`ParagraphProperties`](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.paragraphproperties?view=openxml-3.0.1)).

Bullet selection is one of:

```xml
<a:pPr marL="457200" indent="-228600" lvl="0">
  <a:buClr><a:schemeClr val="tx1"/></a:buClr>
  <a:buSzPct val="100000"/>
  <a:buFont typeface="Arial"/>
  <a:buChar char="•"/>
</a:pPr>
```

* `a:buNone` — no bullet.
* `a:buChar char="…"` — character bullet.
* `a:buAutoNum type="arabicPeriod" startAt="1"` — automatic numbering. `ST_TextAutonumberScheme` includes alphabetic, Arabic, Roman, Hebrew, Hindi, Thai, East Asian and related presentation schemes.
* `a:buBlip` — picture bullet.

Color is `a:buClrTx` or `a:buClr`; size is `a:buSzTx`, `a:buSzPct`, or `a:buSzPts`; typeface is `a:buFontTx` or `a:buFont`. `lvl` (0–8), `marL`, and `indent` implement visual nesting. Numbering is paragraph presentation metadata, not a reusable semantic list object with CSS counters.

## 5. Tables, charts, and pictures

### Tables

`a:tbl` contains `a:tblPr`, `a:tblGrid/a:gridCol w`, and `a:tr h/a:tc`. Each cell has `a:txBody` and `a:tcPr`; cell properties include margins, anchoring, fill, borders (`a:lnL`, `a:lnR`, `a:lnT`, `a:lnB`, diagonals), and merge/span metadata such as `gridSpan`, `rowSpan`, `hMerge`, and `vMerge`. Table styles can be referenced by `a:tableStyleId`. Native tables do not contain formulas, worksheets, filters, or pivot behavior.

### Charts

PresentationML places a chart reference in `p:graphicFrame`; the chart vocabulary is DrawingML Charts (`c:`), with series, axes, labels, legends, plot area, and chart-type elements. Data may be cached in the chart XML and/or backed by an embedded `.xlsx` package part. A chart is editable in PowerPoint but only within chart-schema capabilities. A bespoke Skia visualization has no automatic mapping and must either be reconstructed as a supported chart, decomposed to shapes, or embedded as a picture.

### Pictures and crop/fill modes

`p:pic/p:blipFill` uses `a:blip` to identify image data. `a:srcRect l/t/r/b` crops each edge; values are percentages in thousandths of a percent (100000 = 100%). The source then uses either:

* `a:stretch/a:fillRect` — stretch the cropped source to the destination rectangle; or
* `a:tile` — repeat it, with `tx`, `ty`, `sx`, `sy`, `flip`, and `algn` controls.

`p:blipFill` itself has `dpi` and `rotWithShape`. The full schema shape is visible in Microsoft's [DrawingML schema metadata](https://github.com/dotnet/Open-XML-SDK/blob/main/data/schemas/schemas_openxmlformats_org_drawingml_2006_main.json). “Contain” is produced by calculating the destination rectangle; “cover” is produced by calculating `a:srcRect` crop percentages. PowerPoint does not store those CSS object-fit keywords.

## 6. Gradients, effects, and blending

### Gradients

`a:gradFill` contains a gradient stop list and either `a:lin` or `a:path`, plus optional `a:tileRect`; attributes are `flip` and `rotWithShape`.

```xml
<a:gradFill rotWithShape="1">
  <a:gsLst>
    <a:gs pos="0"><a:srgbClr val="003B5C"/></a:gs>
    <a:gs pos="100000"><a:srgbClr val="00A6A6"/></a:gs>
  </a:gsLst>
  <a:lin ang="5400000" scaled="1"/>
</a:gradFill>
```

Angles use 60,000 units per degree. A path gradient uses `a:path path="circle|rect|shape"` and optional `a:fillToRect l/t/r/b`. There is no mesh-gradient node, no arbitrary set of 2-D control vertices, and no standard conic-gradient element.

### Exact `a:effectLst` effects

`a:effectLst` is an unordered fixed list that can contain these five effects. The exact standard parameters are:

| Element | Attributes | Child |
|---|---|---|
| `a:outerShdw` | `blurRad` (EMU), `dist` (EMU), `dir` (1/60000°), `sx`, `sy` (percent), `kx`, `ky` (1/60000°), `algn`, `rotWithShape` | Exactly one color choice: `a:scrgbClr`, `a:srgbClr`, `a:hslClr`, `a:sysClr`, `a:schemeClr`, or `a:prstClr`, with color transforms such as alpha. |
| `a:innerShdw` | `blurRad`, `dist`, `dir` | One color choice. |
| `a:blur` | `rad` (EMU), `grow` (boolean) | None. |
| `a:glow` | `rad` (EMU) | One color choice. |
| `a:softEdge` | `rad` (EMU) | None. |

These contracts are directly represented by `CT_OuterShadowEffect`, `CT_InnerShadowEffect`, `CT_BlurEffect`, `CT_GlowEffect`, and `CT_SoftEdgesEffect` in the [official schema metadata](https://github.com/dotnet/Open-XML-SDK/blob/main/data/schemas/schemas_openxmlformats_org_drawingml_2006_main.json). Effects can also be composed as a directed effect graph in `a:effectDag/a:cont`; this admits additional primitives such as alpha transforms, color transforms, fill/line references, reflection, relative offset/transform, and `a:blend`.

`a:blend` has one `blend` attribute and a child effect container. Standard `ST_BlendMode` values are exactly `over`, `mult`, `screen`, `darken`, and `lighten`. This is materially narrower than Canvas/Skia or CSS blending and is not attached to every shape as a simple blend-mode property. If a visual relies on another blend operator or a specific compositing stack, image fallback is the faithful representation.

## 7. Groups, transforms, reusable slide structure, and themes

For ordinary shapes, `a:xfrm` attributes are exactly `rot`, `flipH`, and `flipV`; children are `a:off x/y` and `a:ext cx/cy`. Rotation is in 1/60000 degree. A group transform adds `a:chOff` and `a:chExt`, establishing the child coordinate space. Nested `p:grpSp` is native.

The reusable presentation hierarchy is package-level:

```text
p:sldMaster  --relationship-->  p:sldLayout  --relationship-->  p:sld
      |                              |                           |
  theme part                    placeholder defaults       slide instances
```

The master provides global shapes, text styles, color mapping, and relationships. A layout adds layout-specific shapes/placeholders. A slide inherits the layout and can override placeholder content/properties; matching relies primarily on `p:ph idx` and placeholder type. It is not a general component system: there is no native “instance of arbitrary frame with property overrides” object. Repeated non-placeholder components must be duplicated, placed on a master/layout, represented as a linked/embedded object, or flattened.

Theme `a:clrScheme` defines `dk1`, `lt1`, `dk2`, `lt2`, `accent1`–`accent6`, `hlink`, and `folHlink`. `a:fontScheme` has major/minor font collections (`a:majorFont`, `a:minorFont`) with Latin, East Asian, complex-script, and script-specific faces. `a:fmtScheme` supplies fill, line, effect, and background-fill style lists. A `a:schemeClr` may carry tint, shade, alpha, luminance, saturation, hue, and channel transforms. Microsoft's presentation root API shows the package-level master, notes-master, slide, embedded-font, and default-text-style lists ([`Presentation`](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.presentation?view=openxml-3.0.1)).

## 8. Notes, transitions, animations, media, links, accessibility

### Speaker notes

The notes-slide root is `p:notes`, normally containing `p:cSld/p:spTree`, `p:clrMapOvr`, and extensions. It relates back to its slide and to a `p:notesMaster`. Notes are native, searchable text when written into notes placeholders; a screenshot placed on the notes slide is merely an image.

### Transitions

`p:transition` has standard attributes `spd`, `advClick`, and `advTm`; Microsoft Office 2010 adds `p14:dur`. Standard child choices include `p:blinds`, `p:checker`, `p:circle`, `p:dissolve`, `p:comb`, `p:cover`, `p:cut`, `p:diamond`, `p:fade`, `p:newsflash`, `p:plus`, `p:pull`, `p:push`, `p:random`, `p:randomBar`, `p:split`, `p:strips`, `p:wedge`, `p:wheel`, `p:wipe`, and `p:zoom`, followed optionally by sound action and extensions. Office 2010+ extension types include flash, vortex, switch, flip, ripple, glitter, honeycomb, prism, doors, window, shred, ferris, fly-through, warp, gallery, conveyor, pan, reveal, and reverse wheel. The complete generated choice appears in Microsoft's [PresentationML schema metadata](https://github.com/dotnet/Open-XML-SDK/blob/main/data/schemas/schemas_openxmlformats_org_presentationml_2006_main.json).

### Animations

`p:timing` contains `p:tnLst`, `p:bldLst`, and extensions. Common time-node data (`p:cTn`) carries duration, restart/fill behavior, repeat, acceleration/deceleration, auto-reverse, display, node type, and child/sequence lists. Behaviors target a shape through `p:tgtEl/p:spTgt spid="…"`; property animation uses attribute-name lists. The format is native and expressive, but it is a timing graph, not a CSS keyframe block.

### Video and audio

OOXML separates the visual poster frame from media identity/timing. Standard DrawingML has `a:videoFile r:link`, `a:audioFile r:link`, and embedded WAV `a:wavAudioFile r:embed`; PresentationML timing nodes `p:video` and `p:audio` wrap common media data (`p:cMediaNode`) with `vol`, `mute`, `numSld`, and `showWhenStopped`. Modern PowerPoint writes `p14:media r:embed`/relationships for embedded non-WAV media and preserves a compatibility link element. Codec playback is an application/platform capability, not guaranteed by OOXML syntax alone.

### Hyperlinks

Run-level links live under `a:rPr`; shape/picture links live under non-visual properties. `a:hlinkClick`/`a:hlinkMouseOver` carry `r:id`, `action`, `tgtFrame`, `tooltip`, `history`, `highlightClick`, and `endSnd`; external URLs use hyperlink relationships with `TargetMode="External"`. Internal slide links point to slide relationships and use a PowerPoint action URI.

### Accessibility

`cNvPr` provides stable object `id`, `name`, optional `title`, optional `descr` (the conventional alt-text description), `hidden`, and hyperlinks. Current Office also writes an extension to mark decorative objects. Native text remains machine-readable; text converted to outlines or a slide rendered to a bitmap does not. Table structure and chart objects carry more semantics than visually equivalent collections of shapes. OOXML does not guarantee good reading order automatically; shape-tree order and placeholder semantics must be authored deliberately.

## 9. Open-source writer coverage (as of 2026-09-03)

### Version baseline

* **PptxGenJS 4.0.1** (Node/browser, TypeScript/JavaScript; MIT). The release source declares 4.0.1 and implements generation in TypeScript ([repository](https://github.com/gitbrent/PptxGenJS), [4.0.1 package](https://www.npmjs.com/package/pptxgenjs/v/4.0.1)).
* **python-pptx 1.0.2** (Python; MIT). Its public release is 1.0.2 ([PyPI](https://pypi.org/project/python-pptx/1.0.2/), [repository](https://github.com/scanny/python-pptx)).
* **Open XML SDK 3.x** (.NET; MIT) and **Apache POI XSLF** (Java; Apache-2.0) are broader low-level alternatives, not Node/Python libraries. They expose package/schema objects but require substantially more OOXML authoring ([Open XML SDK](https://github.com/dotnet/Open-XML-SDK), [Apache POI XSLF](https://poi.apache.org/components/slideshow/)).

### Public-API coverage

| Capability | PptxGenJS 4.0.1 | python-pptx 1.0.2 |
|---|---|---|
| Preset shapes | Yes: `slide.addShape(pptx.ShapeType.…, options)` | Yes: `slide.shapes.add_shape(MSO_SHAPE.…, left, top, width, height)` |
| Custom freeform paths | Yes: `ShapeType.customGeometry`/`CUSTOM_GEOMETRY` plus `points` supporting line, arc, quadratic and cubic segments ([source](https://github.com/gitbrent/PptxGenJS/blob/master/src/core-interfaces.ts)) | Yes: `slide.shapes.build_freeform()` and `FreeformBuilder` line/curve operations ([source](https://github.com/scanny/python-pptx/blob/master/src/pptx/shapes/freeform.py)) |
| Rich text runs | Yes: `slide.addText([{text, options}, …], options)` | Yes: `paragraph.add_run()` and `run.font` |
| Paragraph bullets/numbering | Bullets are public; character and numbered bullets supported | Bullet XML can be read/inherited, but high-level bullet creation/numbering API is incomplete; custom XML is often required |
| Tables | Yes: `addTable`, cell spans, cell runs; auto-pagination is generator-side | Yes: `add_table`, cell merges, cell text formatting |
| Charts | Yes: major chart families, combo and secondary axes ([chart API](https://gitbrent.github.io/PptxGenJS/docs/api-charts/)) | Yes: major chart families through `add_chart`; not every OOXML chart feature |
| Pictures/crop | Yes: `addImage`, with sizing type `contain`, `cover`, or `crop`, plus rotation/flips/transparency | Yes: `add_picture`, `crop_left/right/top/bottom`, rotation |
| Native gradients | No general native-gradient public API in 4.0.1; SVG/PNG picture fallback is available | Yes for linear gradients/stops through `fill.gradient()`, `gradient_stops`, `gradient_angle`; creation of arbitrary path gradients is not exposed at the same level |
| Effects | Outer/inner shadow subset through `shadow`; no public blur/glow/soft-edge/effect-DAG API | `shape.shadow` is limited; no complete public authoring API for the five-effect set/effect DAG |
| Groups | Generation does not expose a general nested editable group API | Yes: `add_group_shape()` and child shapes |
| Masters/layouts | Yes: `defineSlideMaster`; generated layouts are first-class and editable in Slide Master ([master docs](https://gitbrent.github.io/PptxGenJS/docs/masters.html)) | Reads/uses template masters and layouts; no high-level API to create a new slide master/layout hierarchy from scratch |
| Theme fonts/colors | Presentation theme faces and scheme colors are exposed; full arbitrary theme-part authoring is limited | Uses template theme and supports theme-color references; full theme creation is not a high-level API |
| Speaker notes | Yes: `slide.addNotes(string)` ([speaker-notes source](https://github.com/gitbrent/PptxGenJS/blob/master/src/slide.ts)) | Notes slides are accessible; editing notes content is possible through the notes shape tree but is less direct than ordinary slide text |
| Transitions | No public transition authoring API | No public transition authoring API |
| Animations | No public timing/animation authoring API | No public timing/animation authoring API |
| Audio/video | Yes: `slide.addMedia`, with type `audio`, `video`, or `online` | `add_movie()` exists and is explicitly experimental; no symmetric high-level audio API |
| Hyperlinks | Yes on text runs, shapes, images; URL and internal slide targets | Yes on text runs and shape click actions; URL and internal slide targets |
| Alt text | Public `altText` on images/charts; object names are exposed | No complete, consistent high-level alt-text API across all shapes; underlying XML is accessible |
| Blend modes/effect DAG | No | No |
| Mesh gradient | Cannot emit because standard OOXML has none; image/SVG fallback | Same |

Factual boundary: **PptxGenJS 4.0.1 has the broadest ready-made generation surface in Node** among the compared projects: editable shapes/custom paths, run text, tables, charts, masters, notes, media, links, and image alt text. **python-pptx 1.0.2 is the corresponding mature Python writer**, with stronger group-shape and linear-gradient APIs but weaker master creation, media, and accessibility coverage. Neither exposes transitions, timing animations, full DrawingML effects, effect-graph blends, or every theme/master detail. Those require direct OOXML/package manipulation (or a lower-level Open XML SDK/POI implementation).

### Minimal native-rich-text example (PptxGenJS)

```ts
import pptxgen from "pptxgenjs";

const pptx = new pptxgen();
const slide = pptx.addSlide();
slide.addText([
  { text: "YOU RUN ", options: { fontFace: "Aptos Display", bold: true, color: "101010" } },
  { text: "THE SCHOOL", options: { fontFace: "Aptos Display", italic: true, color: "E34B2F" } },
], { x: 0.7, y: 0.7, w: 7.5, h: 0.6, fontSize: 30, margin: 0, breakLine: false });
await pptx.writeFile({ fileName: "native-rich-text.pptx" });
```

This produces multiple `a:r` elements in one editable text body. It does not reproduce Skia shaping identically: line breaking, font substitution, OpenType support, and text metrics are performed by PowerPoint at open/render time. Exact pixel identity therefore requires either embedded/available fonts plus careful metric testing, or flattening the affected text to an image/vector picture.

## 10. Export implications stated as format facts

1. Canvas layout (`horizontal`/`vertical`, gap, fill/fit sizing) has no PresentationML analogue; resolved `x/y/cx/cy` must be serialized.
2. Canvas rich-text marks map naturally to contiguous `a:r` ranges inside `a:p`; paragraph/list data must be modeled separately because bullets live on `a:pPr`, not `a:rPr`.
3. Native PPTX can preserve common vectors, text runs, tables, charts, pictures, standard gradients, common effects, media, links, and notes as editable objects.
4. Canvas-only rendering features outside DrawingML—especially mesh gradients, unsupported blends, filters/masks, arbitrary transform matrices, and exact Skia typography—have no equivalent editable representation. A picture is the interoperable fidelity boundary.
5. Masters/layouts are reusable presentation infrastructure, but not a replacement for an arbitrary component/reference node model.

## Primary sources

* Microsoft, [Open XML SDK schema data](https://github.com/dotnet/Open-XML-SDK/tree/main/data/schemas) and [generated DrawingML classes](https://github.com/dotnet/Open-XML-SDK/blob/main/generated/DocumentFormat.OpenXml/DocumentFormat.OpenXml.Generator/DocumentFormat.OpenXml.Generator.OpenXmlGenerator/schemas_openxmlformats_org_drawingml_2006_main.g.cs).
* Microsoft Learn, [`Paragraph`](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.paragraph?view=openxml-3.0.1), [`ParagraphProperties`](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.paragraphproperties?view=openxml-3.0.1), [`EffectStyleList`](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.effectstylelist?view=openxml-3.0.1), and [`Presentation`](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.presentation?view=openxml-3.0.1).
* PptxGenJS, [source](https://github.com/gitbrent/PptxGenJS), [API documentation](https://gitbrent.github.io/PptxGenJS/), [charts](https://gitbrent.github.io/PptxGenJS/docs/api-charts/), [tables](https://gitbrent.github.io/PptxGenJS/docs/api-tables.html), and [masters](https://gitbrent.github.io/PptxGenJS/docs/masters.html).
* python-pptx, [source](https://github.com/scanny/python-pptx) and [official documentation](https://python-pptx.readthedocs.io/en/latest/).
* Apache POI, [XSLF component documentation](https://poi.apache.org/components/slideshow/).
