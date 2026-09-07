import Foundation
import SwiftUI
import UIKit
import CoreText

enum TextReceiptSelection {
  static let knownCaseIDs: Set<String> = ["case-01", "case-02", "case-03", "case-04", "case-06", "case-07", "case-08", "case-10", "case-11", "case-12"]
  static func view(for caseID: String) -> AnyView {
    switch caseID {
    case "case-01": return AnyView(LunaIOSUnmarkedRegular())
    case "case-02": return AnyView(LunaIOSFullUnderline())
    case "case-03": return AnyView(LunaIOSFullStrikethrough())
    case "case-04": return AnyView(LunaIOSUnderlineAndStrikethrough())
    case "case-06": return AnyView(LunaIOSFullBold700())
    case "case-07": return AnyView(LunaIOSFirstSixUnderline())
    case "case-08": return AnyView(LunaIOSFirstSixStrikethrough())
    case "case-10": return AnyView(LunaIOSFirstSixOrangeFill())
    case "case-11": return AnyView(LunaIOSFullLetterSpacing())
    case "case-12": return AnyView(LunaIOSFirstSixLetterSpacing())
    default: preconditionFailure("Unknown text fixture case: \(caseID)")
    }
  }
}

struct TextReceiptScreen: View {
  let caseID: String
  let nonce: String

  private func emitReceipts(_ frame: CGRect) {
    let window = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.windows.first(where: { $0.isKeyWindow }) }.first
    let screen = window?.screen ?? UIScreen.main
    let wf = window?.frame ?? .zero
    let sb = screen.bounds
    let scale = screen.scale
    let regular = CTFontCreateWithName("Inter-Regular" as CFString, 24, nil)
    let bold = CTFontCreateWithName("Inter-Bold" as CFString, 24, nil)
    let regularName = CTFontCopyPostScriptName(regular) as String
    let boldName = CTFontCopyPostScriptName(bold) as String
    NSLog("LUNA_TEXT_FONT case=%@ nonce=%@ regularPostScript=%@ boldPostScript=%@", caseID, nonce, regularName, boldName)
    NSLog("LUNA_TEXT_READY case=%@ nonce=%@ regularPostScript=%@ boldPostScript=%@", caseID, nonce, regularName, boldName)
    NSLog("LUNA_TEXT_ROOT case=%@ nonce=%@ frame=%.3f,%.3f %.3fx%.3f window=%.3f,%.3f %.3fx%.3f screen=%.3f,%.3f %.3fx%.3f scale=%.3f", caseID, nonce, frame.minX, frame.minY, frame.width, frame.height, wf.minX, wf.minY, wf.width, wf.height, sb.minX, sb.minY, sb.width, sb.height, scale)
  }

  var body: some View {
    TextReceiptSelection.view(for: caseID)
      .frame(width: 340, height: 180, alignment: .topLeading)
      .accessibilityIdentifier("canvas-text-receipt-\(caseID)")
      .background(GeometryReader { proxy in Color.clear.onAppear { emitReceipts(proxy.frame(in: .global)) } })
  }
}

@main
struct CanvasTextReceiptApp: App {
  let caseID: String
  let nonce: String
  init() {
    let args = ProcessInfo.processInfo.arguments
    guard let c = args.firstIndex(of: "--canvas-case"), args.indices.contains(c + 1), let n = args.firstIndex(of: "--canvas-nonce"), args.indices.contains(n + 1) else { preconditionFailure("Text receipt requires case and nonce") }
    caseID = args[c + 1]; nonce = args[n + 1]
    guard TextReceiptSelection.knownCaseIDs.contains(caseID), !nonce.isEmpty else { preconditionFailure("Invalid text receipt selection") }
    CanvasFonts.register()
  }
  var body: some Scene { WindowGroup { TextReceiptScreen(caseID: caseID, nonce: nonce) } }
}
