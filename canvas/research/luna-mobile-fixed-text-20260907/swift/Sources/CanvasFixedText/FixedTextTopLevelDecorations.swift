import SwiftUI

public struct FixedTextTopLevelDecorations: View {
  public init() {}
  public var body: some View {
    ZStack(alignment: .topLeading) {
      (Text("Decorated text").font(Font.custom("Inter", fixedSize: 24).weight(.regular)).foregroundColor(Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1)).underline().strikethrough()).opacity(1).frame(width: 300, height: 64, alignment: .topLeading).position(x: 170, y: 56)
    }.frame(width: 340, height: 180, alignment: .topLeading).background(Color(red: 1, green: 1, blue: 1, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
      .accessibilityElement(children: .contain)
  }
}
