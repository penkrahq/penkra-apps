import SwiftUI

public struct GeneratedCanvasFixture: View {
  public init() {}

  public var body: some View {
    Grid(horizontalSpacing: 12, verticalSpacing: 12) {
      GridRow {
        Text("Canvas")
          .accessibilityHeading(.h1)
        RoundedRectangle(cornerRadius: 12)
          .fill(.blue.gradient)
          .frame(width: 48, height: 48)
      }
    }
    .padding(16)
  }
}
