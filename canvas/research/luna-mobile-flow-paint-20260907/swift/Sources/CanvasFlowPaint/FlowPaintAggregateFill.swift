import Foundation
import SwiftUI

public struct FlowPaintAggregateFill: View {
  @Environment(\.colorScheme) private var colorScheme
  public init() {}
  public var body: some View {
    GeometryReader { proxy in
      if colorScheme == .dark && proxy.size.width >= 480 {
        ZStack(alignment: .topLeading) {
          Rectangle().fill(Color(red: 0.149, green: 0.275, blue: 0.325, opacity: 1)).opacity(1).frame(width: 360, height: 110, alignment: .topLeading).position(x: 210, y: 85)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
      else if proxy.size.width >= 480 {
        ZStack(alignment: .topLeading) {
          Rectangle().fill(Color(red: 0.149, green: 0.275, blue: 0.325, opacity: 1)).opacity(1).frame(width: 360, height: 110, alignment: .topLeading).position(x: 210, y: 85)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
      else if colorScheme == .dark {
        ZStack(alignment: .topLeading) {
          Rectangle().fill(Color(red: 0.149, green: 0.275, blue: 0.325, opacity: 1)).opacity(1).frame(width: 360, height: 110, alignment: .topLeading).position(x: 210, y: 85)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
      else {
        ZStack(alignment: .topLeading) {
          Rectangle().fill(Color(red: 0.149, green: 0.275, blue: 0.325, opacity: 1)).opacity(1).frame(width: 360, height: 110, alignment: .topLeading).position(x: 210, y: 85)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
    }
  }
}
