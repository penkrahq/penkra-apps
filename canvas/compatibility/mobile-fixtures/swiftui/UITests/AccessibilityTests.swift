import XCTest

final class AccessibilityTests: XCTestCase {
  @MainActor
  func testNestedDecorationsAndVisibleGroupLabels() throws {
    let app = XCUIApplication()
    app.launch()
    XCTAssertTrue(app.staticTexts["Visible nested description"].waitForExistence(timeout: 15))
    let tree = XCTAttachment(string: app.debugDescription)
    tree.name = "Nested accessibility tree"
    tree.lifetime = .keepAlways
    add(tree)
    let screenshot = XCTAttachment(screenshot: app.screenshot())
    screenshot.name = "Nested accessibility appearance"
    screenshot.lifetime = .keepAlways
    add(screenshot)
    for label in ["Visible group description", "Visible nested description"] {
      XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch.exists)
    }
    for label in ["Hidden direct description", "Hidden group description", "Hidden nested description", "Nested decorative content", "Decorative watermark"] {
      XCTAssertFalse(app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch.exists)
    }
  }

  @MainActor
  func testExportedDescriptionsAndDecorativeText() throws {
    let app = XCUIApplication()
    app.launchArguments = ["--canvas-font-probe"]
    app.launch()
    XCTAssertTrue(app.staticTexts["Native Canvas heading"].waitForExistence(timeout: 15))
    let tree = XCTAttachment(string: app.debugDescription)
    tree.name = "Native accessibility tree"
    tree.lifetime = .keepAlways
    add(tree)
    let screenshot = XCTAttachment(screenshot: app.screenshot())
    screenshot.name = "Native fixture appearance"
    screenshot.lifetime = .keepAlways
    add(screenshot)
    XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Canvas mobile export verification screen")).firstMatch.exists)
    XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Orange circle")).firstMatch.exists)
    XCTAssertTrue(app.staticTexts["Responsive type and layout"].exists)
    XCTAssertFalse(app.staticTexts["Decorative watermark"].exists)
  }
}
