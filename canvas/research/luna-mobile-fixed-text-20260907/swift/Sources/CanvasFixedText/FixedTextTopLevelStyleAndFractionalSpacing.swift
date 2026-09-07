import SwiftUI

public struct FixedTextTopLevelStyleAndFractionalSpacing: View {
  public init() {}
  public var body: some View {
    ZStack(alignment: .topLeading) {
      (Text("Italic spaced text").font(Font.custom("Inter", fixedSize: 24).weight(.regular)).foregroundColor(Color(red: 0.8, green: 0.333, blue: 0, opacity: 1)).tracking(-0.25).italic()).opacity(1).frame(width: 300, height: 64, alignment: .topLeading).position(x: 170, y: 56)
    }.frame(width: 340, height: 180, alignment: .topLeading).background(Color(red: 1, green: 1, blue: 1, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
      .accessibilityElement(children: .contain)
  }
}
