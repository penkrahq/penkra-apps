# Offline text receipt diagnostic

Source evidence: 3967d70. All 30 retained comparisons were recomputed without registration, masking, or tolerance changes.

- Overall: 280817 mismatched pixels across 30 measured entries; statuses: {"mismatch":30}.
- Case01 iPhone Large: 162 mismatches; bounds {"minX":81,"minY":165,"maxX":454,"maxY":213,"width":374,"height":49,"count":162}; classification {"glyphEdge":94,"decoration":0,"colorInterior":0,"interior":0,"topology":68}.
- Registration metadata: all 30 retained results say `center-cropped-authored-frame`; this is stale metadata. The actual crops are receipt-derived byte-preserving CanvasKit crop. Old results were not rewritten.
- Foreground bounds/bands are reported in physical pixels and points per entry. A bounds/band difference is geometry evidence; antialias-count differences alone are not a layout diagnosis.
- XXL is reported separately under `iphone-accessibility-extra-extra-large`; it is not merged with Large baseline conclusions.
- Build executable hash and size, full-frame hashes, initial/final device states, and restoration receipts all verified offline.

## State summary

| State | Entries | Compared | Mismatched | Classification |
| --- | ---: | ---: | ---: | --- |
| iphone-large | 10 | 5191212 | 3893 | {"glyphEdge":1155,"decoration":2091,"colorInterior":0,"interior":0,"topology":647} |
| iphone-accessibility-extra-extra-large | 10 | 5191212 | 276266 | {"glyphEdge":1191,"decoration":148845,"colorInterior":195,"interior":0,"topology":138313} |
| ipad-large | 10 | 2257705 | 658 | {"glyphEdge":9,"decoration":563,"colorInterior":0,"interior":0,"topology":86} |

## Case/state details

| Identity | Compared | Mismatched | Mismatch bounds | Components | Foreground delta (x/y/w/h) | Classification |
| --- | ---: | ---: | --- | ---: | --- | --- |
| ipad-large/case-01 | 227348 | 16 | 81,134..295,134 | 2 | 0/1/-1/1 | {"glyphEdge":0,"decoration":0,"colorInterior":0,"interior":0,"topology":16} |
| ipad-large/case-02 | 222470 | 16 | 81,134..295,134 | 2 | 0/1/0/0 | {"glyphEdge":0,"decoration":16,"colorInterior":0,"interior":0,"topology":0} |
| ipad-large/case-03 | 226005 | 239 | 40,75..307,134 | 29 | 0/1/0/1 | {"glyphEdge":0,"decoration":239,"colorInterior":0,"interior":0,"topology":0} |
| ipad-large/case-04 | 221127 | 239 | 40,75..307,134 | 29 | 0/1/0/0 | {"glyphEdge":0,"decoration":239,"colorInterior":0,"interior":0,"topology":0} |
| ipad-large/case-06 | 225984 | 25 | 63,110..261,146 | 7 | 0/1/0/1 | {"glyphEdge":9,"decoration":0,"colorInterior":0,"interior":0,"topology":16} |
| ipad-large/case-07 | 225791 | 16 | 81,134..295,134 | 2 | 0/1/-1/1 | {"glyphEdge":0,"decoration":16,"colorInterior":0,"interior":0,"topology":0} |
| ipad-large/case-08 | 226957 | 53 | 40,75..295,134 | 10 | 0/1/-1/1 | {"glyphEdge":0,"decoration":53,"colorInterior":0,"interior":0,"topology":0} |
| ipad-large/case-10 | 227348 | 16 | 81,134..295,134 | 2 | 0/1/-1/1 | {"glyphEdge":0,"decoration":0,"colorInterior":0,"interior":0,"topology":16} |
| ipad-large/case-11 | 227328 | 22 | 58,115..316,134 | 7 | -1/1/-1/1 | {"glyphEdge":0,"decoration":0,"colorInterior":0,"interior":0,"topology":22} |
| ipad-large/case-12 | 227347 | 16 | 81,134..295,134 | 2 | 0/1/-2/1 | {"glyphEdge":0,"decoration":0,"colorInterior":0,"interior":0,"topology":16} |
| iphone-accessibility-extra-extra-large/case-01 | 521734 | 23361 | 67,78..846,239 | 84 | 6/27/381/-4 | {"glyphEdge":125,"decoration":0,"colorInterior":0,"interior":0,"topology":24035} |
| iphone-accessibility-extra-extra-large/case-02 | 513654 | 30273 | 60,78..861,274 | 94 | 0/27/401/16 | {"glyphEdge":125,"decoration":30061,"colorInterior":0,"interior":0,"topology":988} |
| iphone-accessibility-extra-extra-large/case-03 | 518587 | 26906 | 60,78..861,239 | 105 | 0/27/401/-4 | {"glyphEdge":92,"decoration":27804,"colorInterior":0,"interior":0,"topology":987} |
| iphone-accessibility-extra-extra-large/case-04 | 510507 | 33818 | 60,78..861,274 | 115 | 0/27/401/16 | {"glyphEdge":92,"decoration":34591,"colorInterior":0,"interior":0,"topology":968} |
| iphone-accessibility-extra-extra-large/case-06 | 521606 | 35614 | 66,78..897,238 | 53 | 5/27/417/-5 | {"glyphEdge":246,"decoration":0,"colorInterior":0,"interior":0,"topology":37199} |
| iphone-accessibility-extra-extra-large/case-07 | 519154 | 30841 | 60,78..846,274 | 87 | 0/27/387/31 | {"glyphEdge":125,"decoration":30527,"colorInterior":0,"interior":0,"topology":988} |
| iphone-accessibility-extra-extra-large/case-08 | 520731 | 25996 | 60,78..846,239 | 95 | 0/27/387/-4 | {"glyphEdge":96,"decoration":25862,"colorInterior":0,"interior":0,"topology":948} |
| iphone-accessibility-extra-extra-large/case-10 | 521734 | 23512 | 67,78..846,239 | 91 | 6/27/381/-4 | {"glyphEdge":216,"decoration":0,"colorInterior":195,"interior":0,"topology":24047} |
| iphone-accessibility-extra-extra-large/case-11 | 521752 | 22256 | 68,78..864,239 | 90 | 5/27/369/-4 | {"glyphEdge":40,"decoration":0,"colorInterior":0,"interior":0,"topology":23287} |
| iphone-accessibility-extra-extra-large/case-12 | 521753 | 23689 | 68,78..864,239 | 86 | 6/27/380/-4 | {"glyphEdge":34,"decoration":0,"colorInterior":0,"interior":0,"topology":24866} |
| iphone-large/case-01 | 521734 | 162 | 81,165..454,213 | 35 | 0/1/0/1 | {"glyphEdge":94,"decoration":0,"colorInterior":0,"interior":0,"topology":68} |
| iphone-large/case-02 | 513654 | 162 | 81,165..454,213 | 35 | 0/1/0/0 | {"glyphEdge":94,"decoration":68,"colorInterior":0,"interior":0,"topology":0} |
| iphone-large/case-03 | 518587 | 1153 | 60,106..460,213 | 66 | 0/1/0/1 | {"glyphEdge":162,"decoration":863,"colorInterior":0,"interior":0,"topology":128} |
| iphone-large/case-04 | 510507 | 1153 | 60,106..460,213 | 66 | 0/1/0/0 | {"glyphEdge":162,"decoration":863,"colorInterior":0,"interior":0,"topology":128} |
| iphone-large/case-06 | 521606 | 149 | 81,165..467,210 | 32 | 0/1/0/1 | {"glyphEdge":98,"decoration":0,"colorInterior":0,"interior":0,"topology":51} |
| iphone-large/case-07 | 519154 | 162 | 81,165..454,213 | 35 | 0/1/0/1 | {"glyphEdge":94,"decoration":68,"colorInterior":0,"interior":0,"topology":0} |
| iphone-large/case-08 | 520731 | 386 | 60,106..454,213 | 47 | 0/1/0/1 | {"glyphEdge":129,"decoration":229,"colorInterior":0,"interior":0,"topology":28} |
| iphone-large/case-10 | 521734 | 161 | 81,165..454,213 | 35 | 0/1/0/1 | {"glyphEdge":93,"decoration":0,"colorInterior":0,"interior":0,"topology":68} |
| iphone-large/case-11 | 521752 | 243 | 69,165..484,218 | 62 | -1/1/0/1 | {"glyphEdge":135,"decoration":0,"colorInterior":0,"interior":0,"topology":108} |
| iphone-large/case-12 | 521753 | 162 | 81,165..454,213 | 35 | 0/1/-1/1 | {"glyphEdge":94,"decoration":0,"colorInterior":0,"interior":0,"topology":68} |

Contact sheets use rows in case order and columns reference/native; see `contact-sheets.json`.
