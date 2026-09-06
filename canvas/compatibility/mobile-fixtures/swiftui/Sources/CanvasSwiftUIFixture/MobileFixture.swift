import SwiftUI

public struct MobileFixture: View {
  public init() {}
  public var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      ZStack(alignment: .topLeading) {
        (Text("Canvas alignment\nShort").font(.custom("Inter", size: 24, relativeTo: .body).weight(.regular)).foregroundColor(Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1))).multilineTextAlignment(.leading).opacity(1).frame(width: 300, height: 110, alignment: .topLeading).position(x: 170, y: 75)
      }.frame(width: 340, height: 150, alignment: .topLeading).background(Color(red: 1, green: 1, blue: 1, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1).accessibilityElement(children: .contain)
      ZStack(alignment: .topLeading) {
        (Text("Canvas alignment\nShort").font(.custom("Inter", size: 24, relativeTo: .body).weight(.regular)).foregroundColor(Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1))).multilineTextAlignment(.center).opacity(1).frame(width: 300, height: 110, alignment: .top).position(x: 170, y: 75)
      }.frame(width: 340, height: 150, alignment: .topLeading).background(Color(red: 1, green: 1, blue: 1, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1).accessibilityElement(children: .contain)
      ZStack(alignment: .topLeading) {
        (Text("Canvas alignment\nShort").font(.custom("Inter", size: 24, relativeTo: .body).weight(.regular)).foregroundColor(Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1))).multilineTextAlignment(.trailing).opacity(1).frame(width: 300, height: 110, alignment: .topTrailing).position(x: 170, y: 75)
      }.frame(width: 340, height: 150, alignment: .topLeading).background(Color(red: 1, green: 1, blue: 1, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1).accessibilityElement(children: .contain)
    }.padding(EdgeInsets(top: 80, leading: 20, bottom: 20, trailing: 20)).frame(width: 393, height: 852, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
      .accessibilityElement(children: .contain).accessibilityLabel("Canvas mobile export verification screen")
  }
}
