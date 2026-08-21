# Simulator

Simulator is Penkra's first-party App for creating and using saved iPhone, iPad, and Android simulated devices.

Each App tab may lease one live device. Closing or stopping a tab releases the lease without deleting the saved device or its OS data. Ready Apple devices expose their UDID; Ready Android devices expose their ADB serial so normal build tools can target them outside this App.

Simulator intentionally has no project picker. Native tooling, runtime downloads, ports, credentials, prerequisite prompts, and process lifecycle remain host-owned through the public `simulator-session` permission.
