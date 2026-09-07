import SwiftUI

public struct FixedTextTextGrowthAuto: View {
  public init() {}
  public var body: some View {
    ZStack(alignment: .topLeading) {
      (Text("Auto growth text").font(Font.custom("Inter", fixedSize: 24).weight(.regular)).foregroundColor(Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1))).opacity(1).fixedSize(horizontal: true, vertical: true).offset(x: 20, y: 24)
    }.frame(width: 340, height: 180, alignment: .topLeading).background(Color(red: 1, green: 1, blue: 1, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
      .accessibilityElement(children: .contain)
  }
}
