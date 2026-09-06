import SwiftUI
import UIKit

@main
struct CanvasQAApp: App {
  var body: some Scene {
    WindowGroup { MobileFixture().task {
      guard ProcessInfo.processInfo.arguments.contains("--canvas-font-probe") else { return }
      let names = ["Inter", "Inter-Regular", "Inter-Bold", "Inter-SemiBold", "Inter-Medium"]
      let fonts = names.map { name -> [String: Any] in
        let font = UIFont(name: name, size: 30)
        return ["requested": name, "available": font != nil, "resolved": font?.fontName ?? ""]
      }
      let report: [String: Any] = [
        "fonts": fonts,
        "interFamilyFaces": UIFont.fontNames(forFamilyName: "Inter"),
        "contentSizeCategory": UIApplication.shared.preferredContentSizeCategory.rawValue,
        "bundledFonts": Bundle.main.object(forInfoDictionaryKey: "UIAppFonts") ?? []
      ]
      do {
        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("font-probe.json")
        try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]).write(to: url)
      } catch { assertionFailure("Font QA report failed: \(error)") }
    } }
  }
}
