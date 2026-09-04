// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "CanvasSwiftUIFixture",
  platforms: [.iOS(.v16), .macOS(.v14)],
  products: [.library(name: "CanvasSwiftUIFixture", targets: ["CanvasSwiftUIFixture"])],
  targets: [
    .target(name: "CanvasSwiftUIFixture"),
    .testTarget(name: "CanvasSwiftUIFixtureTests", dependencies: ["CanvasSwiftUIFixture"]),
  ]
)
