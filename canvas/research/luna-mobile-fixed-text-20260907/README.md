# Fixed-layout mobile text capture harness

This package is source-only. It prepares the same four deterministic text cases for SwiftUI and Compose: uniform single-run, mixed-size rich runs, decorations, and bounded wrapping. It does not start a simulator/emulator or compiler.

Each native matrix entry must retain generated source hashes, executable/APK hashes, device settings before/after, a unique selection nonce, exact readiness and root receipts, two consecutive equal full-frame SHA-256 hashes, and the comparison row. Native results are unmeasured until all of those receipts exist. The comparator uses a 2-physical-pixel boundary exclusion and channel tolerance 2; no tolerance or registration loosening is permitted.

Run `node scripts/luna-mobile-fixed-text-capture.mjs --prepare` first. The exact compiler and device commands are in capture-plan.json.
