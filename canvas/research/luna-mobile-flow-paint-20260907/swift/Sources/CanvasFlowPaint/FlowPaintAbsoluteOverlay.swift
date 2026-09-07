import Foundation
import SwiftUI

public struct FlowPaintAbsoluteOverlay: View {
  @Environment(\.colorScheme) private var colorScheme
  public init() {}
  public var body: some View {
    GeometryReader { proxy in
      if colorScheme == .dark && proxy.size.width >= 480 {
        ZStack(alignment: .topLeading) {
          HStack(alignment: .top, spacing: 12) {
            Rectangle().fill(Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1)).opacity(1).frame(width: 100, height: 42, alignment: .topLeading)
            Rectangle().fill(Color(red: 0.906, green: 0.435, blue: 0.318, opacity: 1)).opacity(1).frame(width: 100, height: 54, alignment: .topLeading)
            Rectangle().fill(Color(red: 0.165, green: 0.616, blue: 0.561, opacity: 1)).opacity(1).frame(width: 120, height: 48, alignment: .topLeading)
          }.frame(width: 360, height: 130, alignment: .topLeading).background(Color(red: 1, green: 1, blue: 1, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1).position(x: 200, y: 93).accessibilityElement(children: .contain)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
      else if proxy.size.width >= 480 {
        ZStack(alignment: .topLeading) {
          HStack(alignment: .top, spacing: 12) {
            Rectangle().fill(Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1)).opacity(1).frame(width: 100, height: 42, alignment: .topLeading)
            Rectangle().fill(Color(red: 0.906, green: 0.435, blue: 0.318, opacity: 1)).opacity(1).frame(width: 100, height: 54, alignment: .topLeading)
            Rectangle().fill(Color(red: 0.165, green: 0.616, blue: 0.561, opacity: 1)).opacity(1).frame(width: 120, height: 48, alignment: .topLeading)
          }.frame(width: 360, height: 130, alignment: .topLeading).background(Color(red: 1, green: 1, blue: 1, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1).position(x: 200, y: 93).accessibilityElement(children: .contain)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
      else if colorScheme == .dark {
        ZStack(alignment: .topLeading) {
          HStack(alignment: .top, spacing: 12) {
            Rectangle().fill(Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1)).opacity(1).frame(width: 100, height: 42, alignment: .topLeading)
            Rectangle().fill(Color(red: 0.906, green: 0.435, blue: 0.318, opacity: 1)).opacity(1).frame(width: 100, height: 54, alignment: .topLeading)
            Rectangle().fill(Color(red: 0.165, green: 0.616, blue: 0.561, opacity: 1)).opacity(1).frame(width: 120, height: 48, alignment: .topLeading)
          }.frame(width: 360, height: 130, alignment: .topLeading).background(Color(red: 1, green: 1, blue: 1, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1).position(x: 200, y: 93).accessibilityElement(children: .contain)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
      else {
        ZStack(alignment: .topLeading) {
          HStack(alignment: .top, spacing: 12) {
            Rectangle().fill(Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1)).opacity(1).frame(width: 100, height: 42, alignment: .topLeading)
            Rectangle().fill(Color(red: 0.906, green: 0.435, blue: 0.318, opacity: 1)).opacity(1).frame(width: 100, height: 54, alignment: .topLeading)
            Rectangle().fill(Color(red: 0.165, green: 0.616, blue: 0.561, opacity: 1)).opacity(1).frame(width: 120, height: 48, alignment: .topLeading)
          }.frame(width: 360, height: 130, alignment: .topLeading).background(Color(red: 1, green: 1, blue: 1, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1).position(x: 200, y: 93).accessibilityElement(children: .contain)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
    }
  }
}
