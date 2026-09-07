import Foundation
import SwiftUI
import UIKit
import CoreText

enum RuntimeMetrics {
  private static let strings = ["Canvas text", "Second line"]

  static func write() {
    do {
      let regular = try exactFont(name: "Inter-Regular")
      let bold = try exactFont(name: "Inter-Bold")
      let payload: [String: Any] = [
        "deviceId": argument("--device-id") ?? "unknown",
        "contentSizeArgument": argument("--content-size") ?? "unknown",
        "contentSizeCategory": UIApplication.shared.preferredContentSizeCategory.rawValue,
        "apiProvenance": "UIFont and CTFont runtime facts; not a claim about SwiftUI layout",
        "fonts": ["regular": metrics(for: regular), "bold": metrics(for: bold)],
        "scaledBody": ["regular": scaledMetrics(for: regular), "bold": scaledMetrics(for: bold)],
      ]
      let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
      let url = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("runtime-metrics.json")
      try data.write(to: url, options: .atomic)
    } catch {
      fatalError("Runtime metrics failed: \(error)")
    }
  }

  private static func argument(_ name: String) -> String? {
    let args = ProcessInfo.processInfo.arguments
    guard let index = args.firstIndex(of: name), args.indices.contains(index + 1) else { return nil }
    return args[index + 1]
  }

  private static func exactFont(name: String) throws -> UIFont {
    guard let font = UIFont(name: name, size: 24) else { throw NSError(domain: "RuntimeMetrics", code: 1, userInfo: [NSLocalizedDescriptionKey: "Missing registered font \(name)"]) }
    return font
  }

  private static func scaledMetrics(for font: UIFont) -> [String: Any] {
    let scaled = UIFontMetrics(forTextStyle: .body).scaledFont(for: font)
    var output = metrics(for: scaled)
    output["sourcePointSize"] = Double(font.pointSize)
    output["scalingAPI"] = "UIFontMetrics(forTextStyle: .body).scaledFont(for:)"
    return output
  }

  private static func metrics(for font: UIFont) -> [String: Any] {
    let ctFont = CTFontCreateWithName(font.fontName as CFString, font.pointSize, nil)
    return [
      "uiFontName": font.fontName,
      "postScriptName": CTFontCopyPostScriptName(ctFont) as String,
      "pointSize": Double(font.pointSize),
      "ascender": Double(font.ascender),
      "descender": Double(font.descender),
      "leading": Double(font.leading),
      "capHeight": Double(font.capHeight),
      "xHeight": Double(font.xHeight),
      "lineHeight": Double(font.lineHeight),
      "ctLineHeight": Double(CTFontGetAscent(ctFont) + CTFontGetDescent(ctFont) + CTFontGetLeading(ctFont)),
      "glyphAdvances": strings.map { glyphAdvances(for: ctFont, text: $0) },
    ]
  }

  private static func glyphAdvances(for font: CTFont, text: String) -> [String: Any] {
    var units = Array(text.utf16)
    var glyphs = Array(repeating: CGGlyph(), count: units.count)
    guard CTFontGetGlyphsForCharacters(font, &units, &glyphs, units.count) else { return ["text": text, "available": false] }
    var advances = Array(repeating: CGSize.zero, count: glyphs.count)
    let total = CTFontGetAdvancesForGlyphs(font, .default, glyphs, &advances, glyphs.count)
    return [
      "text": text,
      "available": true,
      "glyphs": glyphs.map { Int($0) },
      "advances": advances.map { ["x": Double($0.width), "y": Double($0.height)] },
      "totalAdvance": total,
    ]
  }
}

@main
struct CanvasTextMetricsApp: App {
  init() {
    CanvasFonts.register()
    RuntimeMetrics.write()
  }

  var body: some Scene { WindowGroup { Color.white.ignoresSafeArea() } }
}
