import Foundation
import SwiftUI

public struct FlowPaintTransformedLinear: View {
  @Environment(\.colorScheme) private var colorScheme
  public init() {}
  public var body: some View {
    GeometryReader { proxy in
      if colorScheme == .dark && proxy.size.width >= 480 {
        ZStack(alignment: .topLeading) {
          Rectangle().fill(LinearGradient(gradient: Gradient(stops: [.init(color: Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1), location: 0), .init(color: Color(red: 0.906, green: 0.435, blue: 0.318, opacity: 1), location: 0.38), .init(color: Color(red: 0.957, green: 0.635, blue: 0.38, opacity: 1), location: 1)]), startPoint: UnitPoint(x: -0.156, y: 0.698), endPoint: UnitPoint(x: 0.556, y: 0.902))).opacity(1).frame(width: 360, height: 120, alignment: .topLeading).position(x: 210, y: 90)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
      else if proxy.size.width >= 480 {
        ZStack(alignment: .topLeading) {
          Rectangle().fill(LinearGradient(gradient: Gradient(stops: [.init(color: Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1), location: 0), .init(color: Color(red: 0.906, green: 0.435, blue: 0.318, opacity: 1), location: 0.38), .init(color: Color(red: 0.957, green: 0.635, blue: 0.38, opacity: 1), location: 1)]), startPoint: UnitPoint(x: -0.156, y: 0.698), endPoint: UnitPoint(x: 0.556, y: 0.902))).opacity(1).frame(width: 360, height: 120, alignment: .topLeading).position(x: 210, y: 90)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
      else if colorScheme == .dark {
        ZStack(alignment: .topLeading) {
          Rectangle().fill(LinearGradient(gradient: Gradient(stops: [.init(color: Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1), location: 0), .init(color: Color(red: 0.906, green: 0.435, blue: 0.318, opacity: 1), location: 0.38), .init(color: Color(red: 0.957, green: 0.635, blue: 0.38, opacity: 1), location: 1)]), startPoint: UnitPoint(x: -0.156, y: 0.698), endPoint: UnitPoint(x: 0.556, y: 0.902))).opacity(1).frame(width: 360, height: 120, alignment: .topLeading).position(x: 210, y: 90)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
      else {
        ZStack(alignment: .topLeading) {
          Rectangle().fill(LinearGradient(gradient: Gradient(stops: [.init(color: Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1), location: 0), .init(color: Color(red: 0.906, green: 0.435, blue: 0.318, opacity: 1), location: 0.38), .init(color: Color(red: 0.957, green: 0.635, blue: 0.38, opacity: 1), location: 1)]), startPoint: UnitPoint(x: -0.156, y: 0.698), endPoint: UnitPoint(x: 0.556, y: 0.902))).opacity(1).frame(width: 360, height: 120, alignment: .topLeading).position(x: 210, y: 90)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
    }
  }
}
