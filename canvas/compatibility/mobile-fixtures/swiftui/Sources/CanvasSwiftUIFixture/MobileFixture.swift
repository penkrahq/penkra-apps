import SwiftUI

public struct MobileFixture: View {
  public init() {}
  public var body: some View {
    ZStack(alignment: .topLeading) {
      Rectangle().fill(Color(red: 0.894, green: 0, blue: 1, opacity: 1)).opacity(1).frame(width: 10, height: 10, alignment: .topLeading).position(x: 25, y: 65)
      Rectangle().fill(Color(red: 0.2, green: 0.4, blue: 0.6, opacity: 0.533)).opacity(1).frame(width: 300, height: 70, alignment: .topLeading).position(x: 170, y: 135)
      Rectangle().fill(Color(red: 0.2, green: 0.4, blue: 0.6, opacity: 0.533)).opacity(1).frame(width: 300, height: 70, alignment: .topLeading).position(x: 170, y: 225)
      Rectangle().fill(Color(red: 0.2, green: 0.4, blue: 0.6, opacity: 0.533)).opacity(1).frame(width: 300, height: 70, alignment: .topLeading).position(x: 170, y: 315)
      Rectangle().fill(Color(red: 0.2, green: 0.4, blue: 0.6, opacity: 0.533)).opacity(1).frame(width: 300, height: 70, alignment: .topLeading).position(x: 170, y: 405)
      Rectangle().fill(Color(red: 0.2, green: 0.4, blue: 0.6, opacity: 0.267)).opacity(1).frame(width: 300, height: 70, alignment: .topLeading).position(x: 170, y: 495)
      Rectangle().fill(Color(red: 0, green: 0, blue: 0, opacity: 0)).opacity(1).frame(width: 300, height: 70, alignment: .topLeading).position(x: 170, y: 585)
    }.frame(width: 393, height: 852, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
      .accessibilityElement(children: .contain)
  }
}
