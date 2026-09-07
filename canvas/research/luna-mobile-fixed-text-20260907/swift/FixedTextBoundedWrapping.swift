import SwiftUI

public struct FixedTextBoundedWrapping: View {
  public init() {}
  public var body: some View {
    ZStack(alignment: .topLeading) {
      (Text("Canvas fixed text wraps at an authored width").font(.custom("Inter", size: 24, relativeTo: .body).weight(.regular)).foregroundColor(Color(red: 0.8, green: 0.333, blue: 0, opacity: 1))).opacity(1).frame(width: 160, height: 120, alignment: .topLeading).position(x: 100, y: 84)
    }.frame(width: 340, height: 180, alignment: .topLeading).background(Color(red: 1, green: 1, blue: 1, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
      .accessibilityElement(children: .contain)
  }
}
