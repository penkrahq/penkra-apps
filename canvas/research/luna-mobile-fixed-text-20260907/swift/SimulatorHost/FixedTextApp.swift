import SwiftUI
import UIKit

enum FixedTextSelection {
  static let known: Set<String> = ["fixed-text-uniform-single-run", "fixed-text-mixed-size-rich-runs", "fixed-text-decorations", "fixed-text-wrapping"]
  static func view(for id: String) -> AnyView {
    switch id {
    case "fixed-text-uniform-single-run": return AnyView(FixedTextUniformSingleRunText())
    case "fixed-text-mixed-size-rich-runs": return AnyView(FixedTextMixedSizeRichRuns())
    case "fixed-text-decorations": return AnyView(FixedTextDecorations())
    case "fixed-text-wrapping": return AnyView(FixedTextBoundedWrapping())
    default: preconditionFailure("Unknown fixed text case: \(id)")
    }
  }
}

struct FixedTextScreen: View {
  let caseID: String
  let nonce: String
  var body: some View { FixedTextSelection.view(for: caseID)
    .frame(width: 340, height: 180, alignment: .topLeading)
    .accessibilityIdentifier("canvas-fixed-text-\(caseID)")
    .background(GeometryReader { proxy in Color.clear.onAppear {
      let window = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.windows.first(where: { $0.isKeyWindow }) }.first
      let screen = window?.screen ?? UIScreen.main
      NSLog("LUNA_FIXED_TEXT_READY case=%@ nonce=%@", caseID, nonce)
      NSLog("LUNA_FIXED_TEXT_ROOT case=%@ nonce=%@ frame=%.3f,%.3f %.3fx%.3f scale=%.3f", caseID, nonce, proxy.frame(in: .global).minX, proxy.frame(in: .global).minY, proxy.frame(in: .global).width, proxy.frame(in: .global).height, screen.scale)
    } })
  }
}

@main struct FixedTextApp: App {
  let caseID: String; let nonce: String
  init() {
    let args = ProcessInfo.processInfo.arguments
    guard let ci = args.firstIndex(of: "--canvas-case"), args.indices.contains(ci + 1), let ni = args.firstIndex(of: "--canvas-nonce"), args.indices.contains(ni + 1) else { preconditionFailure("case and nonce are required") }
    caseID = args[ci + 1]; nonce = args[ni + 1]
    guard FixedTextSelection.known.contains(caseID), !nonce.isEmpty else { preconditionFailure("invalid selection") }
  }
  var body: some Scene { WindowGroup { FixedTextScreen(caseID: caseID, nonce: nonce) } }
}
