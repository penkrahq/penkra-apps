import Foundation
import CoreText

enum CanvasFonts {
  private static let registered: Void = {
    let names = ["a414b48aa577ef2c62ebb135341ddeef33ee26a4f5dc9f787f93c1aab08ebb50.ttf","fbe825cbfc749317f57a1433d3905aa9d3f388732fd29b8e8a36f34845e3bc3e.ttf"]
    for name in names {
      guard let url = Bundle.main.url(forResource: name, withExtension: nil, subdirectory: "Fonts") ?? Bundle.main.url(forResource: name, withExtension: nil) else { preconditionFailure("Missing exported Canvas font: \(name)") }
      var error: Unmanaged<CFError>?
      if !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error) {
        guard let value = error?.takeRetainedValue(), CFErrorGetCode(value) == CTFontManagerError.alreadyRegistered.rawValue else { preconditionFailure("Cannot register exported Canvas font: \(name)") }
      }
    }
  }()
  static func register() { _ = registered }
}
