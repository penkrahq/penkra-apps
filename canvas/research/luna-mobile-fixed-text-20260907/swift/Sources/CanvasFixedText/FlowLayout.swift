import SwiftUI
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif
public struct CanvasRasterImage: View { let base64: String; public init(base64: String) { self.base64 = base64 }; @ViewBuilder public var body: some View {
#if canImport(UIKit)
 if let data = Data(base64Encoded: base64), let image = UIImage(data: data) { Image(uiImage: image).resizable() }
#elseif canImport(AppKit)
 if let data = Data(base64Encoded: base64), let image = NSImage(data: data) { Image(nsImage: image).resizable() }
#endif
} }
public struct FlowLayout: Layout {
 public let spacing: CGFloat
 public let rowSpacing: CGFloat
 public init(spacing: CGFloat = 0, rowSpacing: CGFloat? = nil) { self.spacing = spacing; self.rowSpacing = rowSpacing ?? spacing }
 private func arrange(width: CGFloat, subviews: Subviews) -> (positions: [CGPoint], sizes: [CGSize], height: CGFloat) {
  var positions: [CGPoint] = []; var sizes: [CGSize] = []
  var x: CGFloat = 0; var y: CGFloat = 0; var row: CGFloat = 0
  for view in subviews {
   let size = view.sizeThatFits(.unspecified)
   if x > 0 && x + size.width > width { x = 0; y += row + rowSpacing; row = 0 }
   positions.append(CGPoint(x: x, y: y)); sizes.append(size)
   x += size.width + spacing; row = max(row, size.height)
  }
  return (positions, sizes, y + row)
 }
 public func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
  let width = proposal.width ?? subviews.reduce(CGFloat(0)) { $0 + $1.sizeThatFits(.unspecified).width } + CGFloat(max(0, subviews.count - 1)) * spacing
  return CGSize(width: width, height: arrange(width: width, subviews: subviews).height)
 }
 public func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
  let layout = arrange(width: bounds.width, subviews: subviews)
  for index in subviews.indices { subviews[index].place(at: CGPoint(x: bounds.minX + layout.positions[index].x, y: bounds.minY + layout.positions[index].y), proposal: ProposedViewSize(layout.sizes[index])) }
 }
}
