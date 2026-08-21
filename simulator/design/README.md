# Simulator design brief

`simulator.pen` is the authoritative UI/UX source for the Simulator App. It follows Penkra’s public `simulator-session` contract and contains no project picker.

## Intent

Simulator manages saved iPhone, iPad, and Android devices and opens one complete, interactive OS surface per App tab. Build tools consume the ready iOS UDID or Android ADB serial outside this App.

## Primary flow

1. Choose a saved device or create one from an available platform runtime and device type.
2. Follow the explicit Preparing → Booting → Ready lifecycle.
3. In Ready, interact with the full iOS, iPadOS, or Android display; use hardware controls, rotate, capture, and read the target identifier.
4. Stop without deleting the saved device. Erase and Delete remain deliberate device-library actions and are unavailable while the device is leased.

## Designed states

- Saved iPhone, iPad, and Android device selections
- New-device dialog with no project association
- Android runtime setup required
- Booting progress
- Live full iPhone OS, iPad OS, and Android OS
- Session failure and recovery
- Rotation between portrait and landscape without changing the live target
- Busy-device handling when another tab owns the live lease
- Stop and reopen with saved OS data retained
- Separate erase and delete confirmations
- Crash recovery after an unexpected native-session exit
- Unsupported-platform availability
- Empty device library
- Interaction and trust-boundary contract

## Action coverage

- **Create:** choose platform, runtime, device type, and optional name; save without a project association.
- **Start:** Open enters Preparing and Booting before the full OS becomes Ready.
- **Input:** tap, swipe, and type in the hosted OS; use Home, Back, app switcher, power, volume, rotate, and capture controls where the platform supports them.
- **Stop / reopen:** stop releases the tab-owned lease and target; reopen keeps the saved device and OS data.
- **Erase / delete:** erase resets OS data but retains the device; delete removes both after explicit confirmation.
- **Recovery:** busy, setup-required, unsupported, failed-start, and post-crash states preserve clear next actions.

## Visual and accessibility direction

Neutral utility surfaces keep the live OS dominant. Blue communicates active work, green Ready, amber setup requirements, and red failure. Platform colors identify iOS/Android without replacing state semantics. Status always includes text, controls retain labels, focus order follows App Bar → saved devices → viewer → controls, and reduced motion uses static phase copy.

The App Bar is a configured reference to Penkra’s public App Bar. Trusted prerequisite prompts, native tooling, ports, credentials, and process lifecycle remain host-owned.
