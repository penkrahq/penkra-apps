import SwiftUI

public struct IOSGridGridC180100R60100Normal: View {
  public init() {}
  public var body: some View {
    ZStack(alignment: .topLeading) {
      ZStack(alignment: .topLeading) {
        Rectangle().fill(Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1)).opacity(1).frame(width: 40, height: 30, alignment: .topLeading).position(x: 34, y: 26)
        Rectangle().fill(Color(red: 0.8, green: 0.333, blue: 0, opacity: 1)).opacity(1).frame(width: 40, height: 30, alignment: .topLeading).position(x: 144, y: 26)
        Rectangle().fill(Color(red: 0.133, green: 0.533, blue: 0.2, opacity: 1)).opacity(1).frame(width: 40, height: 30, alignment: .topLeading).position(x: 34, y: 101)
        Rectangle().fill(Color(red: 0.4, green: 0.2, blue: 0.6, opacity: 1)).opacity(1).frame(width: 40, height: 30, alignment: .topLeading).position(x: 144, y: 101)
      }.frame(width: 300, height: 280, alignment: .topLeading).background(Color(red: 1, green: 1, blue: 1, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1).position(x: 170, y: 200).accessibilityElement(children: .contain)
    }.frame(width: 340, height: 400, alignment: .topLeading).background(Color(red: 1, green: 1, blue: 1, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
      .accessibilityElement(children: .contain)
  }
}
