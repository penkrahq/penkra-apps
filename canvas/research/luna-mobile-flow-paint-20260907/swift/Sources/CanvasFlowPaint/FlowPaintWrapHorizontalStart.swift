import Foundation
import SwiftUI

public struct FlowPaintWrapHorizontalStart: View {
  @Environment(\.colorScheme) private var colorScheme
  public init() {}
  public var body: some View {
    GeometryReader { proxy in
      if colorScheme == .dark && proxy.size.width >= 480 {
        ZStack(alignment: .topLeading) {
          ZStack(alignment: .topLeading) {
            Rectangle().fill(Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1)).opacity(1).frame(width: 100, height: 42, alignment: .topLeading).position(x: 50, y: 21)
            Rectangle().fill(Color(red: 0.906, green: 0.435, blue: 0.318, opacity: 1)).opacity(1).frame(width: 100, height: 54, alignment: .topLeading).position(x: 150, y: 27)
            Rectangle().fill(Color(red: 0.165, green: 0.616, blue: 0.561, opacity: 1)).opacity(1).frame(width: 64, height: 75, alignment: .topLeading).position(x: 61, y: 146.5)
            Rectangle().fill(Color(red: 0.416, green: 0.298, blue: 0.576, opacity: 1)).opacity(1).frame(width: 58, height: 55, alignment: .topLeading).position(x: 58, y: 211.5)
          }.frame(width: 220, height: 270, alignment: .topLeading).background(Color(red: 1, green: 1, blue: 1, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1).position(x: 130, y: 163).accessibilityElement(children: .contain)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
      else if proxy.size.width >= 480 {
        ZStack(alignment: .topLeading) {
          ZStack(alignment: .topLeading) {
            Rectangle().fill(Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1)).opacity(1).frame(width: 100, height: 42, alignment: .topLeading).position(x: 50, y: 21)
            Rectangle().fill(Color(red: 0.906, green: 0.435, blue: 0.318, opacity: 1)).opacity(1).frame(width: 100, height: 54, alignment: .topLeading).position(x: 150, y: 27)
            Rectangle().fill(Color(red: 0.165, green: 0.616, blue: 0.561, opacity: 1)).opacity(1).frame(width: 64, height: 75, alignment: .topLeading).position(x: 61, y: 146.5)
            Rectangle().fill(Color(red: 0.416, green: 0.298, blue: 0.576, opacity: 1)).opacity(1).frame(width: 58, height: 55, alignment: .topLeading).position(x: 58, y: 211.5)
          }.frame(width: 220, height: 270, alignment: .topLeading).background(Color(red: 1, green: 1, blue: 1, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1).position(x: 130, y: 163).accessibilityElement(children: .contain)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
      else if colorScheme == .dark {
        ZStack(alignment: .topLeading) {
          ZStack(alignment: .topLeading) {
            Rectangle().fill(Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1)).opacity(1).frame(width: 100, height: 42, alignment: .topLeading).position(x: 50, y: 21)
            Rectangle().fill(Color(red: 0.906, green: 0.435, blue: 0.318, opacity: 1)).opacity(1).frame(width: 100, height: 54, alignment: .topLeading).position(x: 150, y: 27)
            Rectangle().fill(Color(red: 0.165, green: 0.616, blue: 0.561, opacity: 1)).opacity(1).frame(width: 64, height: 75, alignment: .topLeading).position(x: 61, y: 146.5)
            Rectangle().fill(Color(red: 0.416, green: 0.298, blue: 0.576, opacity: 1)).opacity(1).frame(width: 58, height: 55, alignment: .topLeading).position(x: 58, y: 211.5)
          }.frame(width: 220, height: 270, alignment: .topLeading).background(Color(red: 1, green: 1, blue: 1, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1).position(x: 130, y: 163).accessibilityElement(children: .contain)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
      else {
        ZStack(alignment: .topLeading) {
          ZStack(alignment: .topLeading) {
            Rectangle().fill(Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1)).opacity(1).frame(width: 100, height: 42, alignment: .topLeading).position(x: 50, y: 21)
            Rectangle().fill(Color(red: 0.906, green: 0.435, blue: 0.318, opacity: 1)).opacity(1).frame(width: 100, height: 54, alignment: .topLeading).position(x: 150, y: 27)
            Rectangle().fill(Color(red: 0.165, green: 0.616, blue: 0.561, opacity: 1)).opacity(1).frame(width: 64, height: 75, alignment: .topLeading).position(x: 61, y: 146.5)
            Rectangle().fill(Color(red: 0.416, green: 0.298, blue: 0.576, opacity: 1)).opacity(1).frame(width: 58, height: 55, alignment: .topLeading).position(x: 58, y: 211.5)
          }.frame(width: 220, height: 270, alignment: .topLeading).background(Color(red: 1, green: 1, blue: 1, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1).position(x: 130, y: 163).accessibilityElement(children: .contain)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
    }
  }
}
