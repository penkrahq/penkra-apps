# iOS resolved grid production evidence

Source preparation only; no compiler, simulator, or native capture was run in this package. The fixture is generated through buildCapabilityVerificationIR with the explicit candidate inventory in source-hashes.json and exported through exportSwiftUI. The 12-case matrix covers unequal columns, unequal rows, normal/reversed/sparse placement; the control is retained separately.

Native capture requires the exact case argument, nonce log receipt, and consecutive stable frames. Unknown case IDs fail in the generated host.
