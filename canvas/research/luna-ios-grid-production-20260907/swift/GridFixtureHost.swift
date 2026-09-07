import SwiftUI

enum GridFixtureSelection {
  static let knownCaseIDs: Set<String> = ["grid-c100-180-r60-100-normal", "grid-c100-180-r60-100-reversed", "grid-c100-180-r60-100-only-2-2", "grid-c100-180-r100-60-normal", "grid-c100-180-r100-60-reversed", "grid-c100-180-r100-60-only-2-2", "grid-c180-100-r60-100-normal", "grid-c180-100-r60-100-reversed", "grid-c180-100-r60-100-only-2-2", "grid-c180-100-r100-60-normal", "grid-c180-100-r100-60-reversed", "grid-c180-100-r100-60-only-2-2", "grid-control-padding-overlay"]

  static func view(for caseID: String) -> AnyView {
    switch caseID {
    case "grid-c100-180-r60-100-normal": return AnyView(IOSGridGridC100180R60100Normal())
    case "grid-c100-180-r60-100-reversed": return AnyView(IOSGridGridC100180R60100Reversed())
    case "grid-c100-180-r60-100-only-2-2": return AnyView(IOSGridGridC100180R60100Only22())
    case "grid-c100-180-r100-60-normal": return AnyView(IOSGridGridC100180R10060Normal())
    case "grid-c100-180-r100-60-reversed": return AnyView(IOSGridGridC100180R10060Reversed())
    case "grid-c100-180-r100-60-only-2-2": return AnyView(IOSGridGridC100180R10060Only22())
    case "grid-c180-100-r60-100-normal": return AnyView(IOSGridGridC180100R60100Normal())
    case "grid-c180-100-r60-100-reversed": return AnyView(IOSGridGridC180100R60100Reversed())
    case "grid-c180-100-r60-100-only-2-2": return AnyView(IOSGridGridC180100R60100Only22())
    case "grid-c180-100-r100-60-normal": return AnyView(IOSGridGridC180100R10060Normal())
    case "grid-c180-100-r100-60-reversed": return AnyView(IOSGridGridC180100R10060Reversed())
    case "grid-c180-100-r100-60-only-2-2": return AnyView(IOSGridGridC180100R10060Only22())
    case "grid-control-padding-overlay": return AnyView(IOSGridPaddingOverlayControl())
    default: preconditionFailure("Unknown grid fixture case: \(caseID)")
    }
  }
}

struct GridFixtureScreen: View {
  let caseID: String
  let nonce: String

  var body: some View {
    GridFixtureSelection.view(for: caseID)
      .accessibilityIdentifier("luna-grid-fixture-\(caseID)")
      .onAppear { NSLog("LUNA_GRID_READY case=%@ nonce=%@", caseID, nonce) }
  }
}

@main
struct GridFixtureApp: App {
  let caseID: String
  let nonce: String

  init() {
    let arguments = ProcessInfo.processInfo.arguments
    guard let caseIndex = arguments.firstIndex(of: "--grid-case"), arguments.indices.contains(caseIndex + 1),
          let nonceIndex = arguments.firstIndex(of: "--grid-nonce"), arguments.indices.contains(nonceIndex + 1) else {
      preconditionFailure("Grid fixture requires --grid-case and --grid-nonce")
    }
    caseID = arguments[caseIndex + 1]
    nonce = arguments[nonceIndex + 1]
    guard GridFixtureSelection.knownCaseIDs.contains(caseID) else { preconditionFailure("Unknown grid fixture case: \(caseID)") }
    guard !nonce.isEmpty else { preconditionFailure("Grid fixture nonce must not be empty") }
  }

  var body: some Scene { WindowGroup { GridFixtureScreen(caseID: caseID, nonce: nonce) } }
}
