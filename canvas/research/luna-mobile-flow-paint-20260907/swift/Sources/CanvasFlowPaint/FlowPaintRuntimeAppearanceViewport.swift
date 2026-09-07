import Foundation
import SwiftUI

public struct FlowPaintRuntimeAppearanceViewport: View {
  @Environment(\.colorScheme) private var colorScheme
  public init() {}
  public var body: some View {
    GeometryReader { proxy in
      if colorScheme == .dark && proxy.size.width >= 480 {
        ZStack(alignment: .topLeading) {
          HStack(alignment: .top, spacing: 0) {
            Rectangle().fill(Color(red: 0.957, green: 0.635, blue: 0.38, opacity: 1)).opacity(1).frame(width: 70, height: 54, alignment: .topLeading)
          }.padding(EdgeInsets(top: 30, leading: 20, bottom: 10, trailing: 10)).frame(width: 260, height: 150, alignment: .topLeading).background(Color(red: 0.906, green: 0.435, blue: 0.318, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1).position(x: 280, y: 115).accessibilityElement(children: .contain)
        }.frame(width: 700, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
      else if proxy.size.width >= 480 {
        ZStack(alignment: .topLeading) {
          HStack(alignment: .top, spacing: 0) {
            Rectangle().fill(Color(red: 0.957, green: 0.635, blue: 0.38, opacity: 1)).opacity(1).frame(width: 70, height: 54, alignment: .topLeading)
          }.padding(EdgeInsets(top: 30, leading: 20, bottom: 10, trailing: 10)).frame(width: 260, height: 150, alignment: .topLeading).background(Color(red: 0.149, green: 0.275, blue: 0.325, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1).position(x: 280, y: 115).accessibilityElement(children: .contain)
        }.frame(width: 700, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
      else if colorScheme == .dark {
        ZStack(alignment: .topLeading) {
          HStack(alignment: .top, spacing: 0) {
            Rectangle().fill(Color(red: 0.957, green: 0.635, blue: 0.38, opacity: 1)).opacity(1).frame(width: 70, height: 54, alignment: .topLeading)
          }.padding(EdgeInsets(top: 10, leading: 10, bottom: 10, trailing: 10)).frame(width: 190, height: 150, alignment: .topLeading).background(Color(red: 0.906, green: 0.435, blue: 0.318, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1).position(x: 119, y: 115).accessibilityElement(children: .contain)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
      else {
        ZStack(alignment: .topLeading) {
          HStack(alignment: .top, spacing: 0) {
            Rectangle().fill(Color(red: 0.957, green: 0.635, blue: 0.38, opacity: 1)).opacity(1).frame(width: 70, height: 54, alignment: .topLeading)
          }.padding(EdgeInsets(top: 10, leading: 10, bottom: 10, trailing: 10)).frame(width: 190, height: 150, alignment: .topLeading).background(Color(red: 0.149, green: 0.275, blue: 0.325, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1).position(x: 119, y: 115).accessibilityElement(children: .contain)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
    }
  }
}
