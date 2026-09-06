import SwiftUI

public struct LunaIOSFullLetterSpacing: View {
  public init() { CanvasFonts.register() }
  public var body: some View {
    ZStack(alignment: .topLeading) {
      (Text("Canvas text\nSecond line").font(.custom("Inter-Regular", size: 24, relativeTo: .body)).foregroundColor(Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1)).tracking(1)).opacity(1).frame(width: 300, height: 140, alignment: .topLeading).position(x: 170, y: 90)
    }.frame(width: 340, height: 180, alignment: .topLeading).background(Color(red: 1, green: 1, blue: 1, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
      .accessibilityElement(children: .contain)
  }
}
