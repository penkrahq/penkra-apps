# Simulator agent guidance

Use Simulator to create, start, inspect, and control saved iPhone, iPad, and Android devices.

- Creating a device requires a platform runtime and device type; it never requires a project.
- Opening a saved device progresses through Preparing and Booting before Ready.
- A Ready iOS/iPadOS device exposes a UDID. A Ready Android device exposes an ADB serial.
- One App tab owns a live device lease. If another tab owns it, ask the user to open that tab or stop it there.
- Stop releases the lease but preserves the saved device and OS data.
- Erase resets OS data while keeping the saved device. Delete removes the saved device. Both require confirmation and are unavailable while leased.
- Runtime installation and trusted prerequisite prompts are owned by Penkra.
