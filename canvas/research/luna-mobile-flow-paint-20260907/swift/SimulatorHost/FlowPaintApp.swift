import SwiftUI
import UIKit

struct FlowPaintSelection {
  static let known: Set<String> = ["wrap-horizontal-start", "wrap-horizontal-center", "wrap-horizontal-end", "wrap-vertical", "absolute-overlay", "aggregate-fill", "transformed-linear", "transformed-radial", "rounded-scalar-overflow", "rounded-corners-overflow", "runtime-appearance-viewport"]
  static func view(for id: String) -> AnyView {
    switch id {
    case "wrap-horizontal-start": return AnyView(FlowPaintWrapHorizontalStart())
    case "wrap-horizontal-center": return AnyView(FlowPaintWrapHorizontalCenter())
    case "wrap-horizontal-end": return AnyView(FlowPaintWrapHorizontalEnd())
    case "wrap-vertical": return AnyView(FlowPaintWrapVertical())
    case "absolute-overlay": return AnyView(FlowPaintAbsoluteOverlay())
    case "aggregate-fill": return AnyView(FlowPaintAggregateFill())
    case "transformed-linear": return AnyView(FlowPaintTransformedLinear())
    case "transformed-radial": return AnyView(FlowPaintTransformedRadial())
    case "rounded-scalar-overflow": return AnyView(FlowPaintRoundedScalarOverflow())
    case "rounded-corners-overflow": return AnyView(FlowPaintRoundedCornersOverflow())
    case "runtime-appearance-viewport": return AnyView(FlowPaintRuntimeAppearanceViewport())
    default: preconditionFailure("Unknown flow-paint case: \(id)")
    }
  }
}

@main
struct FlowPaintApp: App {
  private let caseID: String
  private let nonce: String
  init() {
    let args = CommandLine.arguments
    caseID = args.first(where: { $0.hasPrefix("--canvas-case=") })?.split(separator: "=", maxSplits: 1).last.map(String.init) ?? "wrap-horizontal-start"
    nonce = args.first(where: { $0.hasPrefix("--canvas-nonce=") })?.split(separator: "=", maxSplits: 1).last.map(String.init) ?? "missing"
  }
  var body: some Scene { WindowGroup { FlowPaintRoot(caseID: caseID, nonce: nonce) } }
}

struct FlowPaintRoot: View {
  let caseID: String
  let nonce: String
  var body: some View { FlowPaintSelection.view(for: caseID)
    .frame(width: 420, height: 360, alignment: .topLeading)
    .accessibilityIdentifier("canvas-flow-paint-\(caseID)")
    .background(GeometryReader { proxy in Color.clear.onAppear {
      let window = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.windows.first(where: { $0.isKeyWindow }) }.first
      let scale = window?.screen.scale ?? UIScreen.main.scale
      let frame = proxy.frame(in: .global)
      NSLog("LUNA_FLOW_PAINT_READY case=%@ nonce=%@", caseID, nonce)
      NSLog("LUNA_FLOW_PAINT_ROOT case=%@ nonce=%@ frame=%.3f,%.3f %.3fx%.3f scale=%.3f", caseID, nonce, frame.minX, frame.minY, frame.width, frame.height, scale)
    } })
  }
}
