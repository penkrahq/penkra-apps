import SwiftUI

public struct FixedTextTextGrowthFixedWidthHeight: View {
  public init() {}
  public var body: some View {
    ZStack(alignment: .topLeading) {
      (Text("Fixed width and height text").font(Font.custom("Inter", fixedSize: 24).weight(.regular)).foregroundColor(Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1))).opacity(1).frame(width: 160, height: 80, alignment: .topLeading).position(x: 100, y: 64)
    }.frame(width: 340, height: 180, alignment: .topLeading).background(Color(red: 1, green: 1, blue: 1, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
      .accessibilityElement(children: .contain)
  }
}
