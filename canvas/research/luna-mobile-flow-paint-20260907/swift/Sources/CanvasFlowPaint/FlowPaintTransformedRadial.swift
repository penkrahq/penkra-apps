import Foundation
import SwiftUI

public struct FlowPaintTransformedRadial: View {
  @Environment(\.colorScheme) private var colorScheme
  public init() {}
  public var body: some View {
    GeometryReader { proxy in
      if colorScheme == .dark && proxy.size.width >= 480 {
        ZStack(alignment: .topLeading) {
          Canvas { context, size in let center = CGPoint(x: 0.27 * size.width, y: 0.68 * size.height); let path = Path(CGRect(origin: .zero, size: size)).applying(CGAffineTransform(translationX: center.x, y: center.y).rotated(by: -0.541).scaledBy(x: 2.273, y: 1.389).translatedBy(x: -center.x, y: -center.y)); context.translateBy(x: center.x, y: center.y); context.rotate(by: .degrees(31)); context.scaleBy(x: 0.44, y: 0.72); context.translateBy(x: -center.x, y: -center.y); context.fill(path, with: .radialGradient(Gradient(stops: [.init(color: Color(red: 0.957, green: 0.635, blue: 0.38, opacity: 1), location: 0), .init(color: Color(red: 0.165, green: 0.616, blue: 0.561, opacity: 1), location: 0.45), .init(color: Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1), location: 1)]), center: center, startRadius: 0, endRadius: 79.2)) }.opacity(1).frame(width: 360, height: 140, alignment: .topLeading).position(x: 210, y: 94)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
      else if proxy.size.width >= 480 {
        ZStack(alignment: .topLeading) {
          Canvas { context, size in let center = CGPoint(x: 0.27 * size.width, y: 0.68 * size.height); let path = Path(CGRect(origin: .zero, size: size)).applying(CGAffineTransform(translationX: center.x, y: center.y).rotated(by: -0.541).scaledBy(x: 2.273, y: 1.389).translatedBy(x: -center.x, y: -center.y)); context.translateBy(x: center.x, y: center.y); context.rotate(by: .degrees(31)); context.scaleBy(x: 0.44, y: 0.72); context.translateBy(x: -center.x, y: -center.y); context.fill(path, with: .radialGradient(Gradient(stops: [.init(color: Color(red: 0.957, green: 0.635, blue: 0.38, opacity: 1), location: 0), .init(color: Color(red: 0.165, green: 0.616, blue: 0.561, opacity: 1), location: 0.45), .init(color: Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1), location: 1)]), center: center, startRadius: 0, endRadius: 79.2)) }.opacity(1).frame(width: 360, height: 140, alignment: .topLeading).position(x: 210, y: 94)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
      else if colorScheme == .dark {
        ZStack(alignment: .topLeading) {
          Canvas { context, size in let center = CGPoint(x: 0.27 * size.width, y: 0.68 * size.height); let path = Path(CGRect(origin: .zero, size: size)).applying(CGAffineTransform(translationX: center.x, y: center.y).rotated(by: -0.541).scaledBy(x: 2.273, y: 1.389).translatedBy(x: -center.x, y: -center.y)); context.translateBy(x: center.x, y: center.y); context.rotate(by: .degrees(31)); context.scaleBy(x: 0.44, y: 0.72); context.translateBy(x: -center.x, y: -center.y); context.fill(path, with: .radialGradient(Gradient(stops: [.init(color: Color(red: 0.957, green: 0.635, blue: 0.38, opacity: 1), location: 0), .init(color: Color(red: 0.165, green: 0.616, blue: 0.561, opacity: 1), location: 0.45), .init(color: Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1), location: 1)]), center: center, startRadius: 0, endRadius: 79.2)) }.opacity(1).frame(width: 360, height: 140, alignment: .topLeading).position(x: 210, y: 94)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
      else {
        ZStack(alignment: .topLeading) {
          Canvas { context, size in let center = CGPoint(x: 0.27 * size.width, y: 0.68 * size.height); let path = Path(CGRect(origin: .zero, size: size)).applying(CGAffineTransform(translationX: center.x, y: center.y).rotated(by: -0.541).scaledBy(x: 2.273, y: 1.389).translatedBy(x: -center.x, y: -center.y)); context.translateBy(x: center.x, y: center.y); context.rotate(by: .degrees(31)); context.scaleBy(x: 0.44, y: 0.72); context.translateBy(x: -center.x, y: -center.y); context.fill(path, with: .radialGradient(Gradient(stops: [.init(color: Color(red: 0.957, green: 0.635, blue: 0.38, opacity: 1), location: 0), .init(color: Color(red: 0.165, green: 0.616, blue: 0.561, opacity: 1), location: 0.45), .init(color: Color(red: 0.071, green: 0.204, blue: 0.337, opacity: 1), location: 1)]), center: center, startRadius: 0, endRadius: 79.2)) }.opacity(1).frame(width: 360, height: 140, alignment: .topLeading).position(x: 210, y: 94)
        }.frame(width: 420, height: 360, alignment: .topLeading).background(Color(red: 0.965, green: 0.949, blue: 0.918, opacity: 1), ignoresSafeAreaEdges: []).compositingGroup().opacity(1)
        .accessibilityElement(children: .contain).environment(\.locale, Locale(identifier: "en"))
      }
    }
  }
}
