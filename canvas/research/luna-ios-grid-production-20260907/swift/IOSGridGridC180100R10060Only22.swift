import SwiftUI

public struct IOSGridGridC180100R10060Only22: View {
  public init() {}
  public var body: some View {
    ZStack(alignment: .topLeading) {
      ZStack(alignment: .topLeading) {
        Rectangle().fill(Color(red: 0.4, green: 0.2, blue: 0.6, opacity: 1)).opacity(1).frame(width: 40, height: 30, alignment: .topLeading).position(x: 144, y: 101)
      }.frame(width: 300, height: 280, alignment: .topLeading).background(Color(red: 1, green: 1, blue: 1, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1).position(x: 170, y: 200).accessibilityElement(children: .contain)
    }.frame(width: 340, height: 400, alignment: .topLeading).background(Color(red: 1, green: 1, blue: 1, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
      .accessibilityElement(children: .contain)
  }
}
