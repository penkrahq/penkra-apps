# Canvas operating notes

Canvas stores canonical documents in the Penkra Account service. A Space enables
the App, but does not own or partition Canvas documents.

- Import `.pen` files from the Canvas library. Unsupported content is preserved
  when safe and is called out in the editor.
- Edits save automatically. **Offline** means changes are stored on this device
  and will merge after reconnection.
- **Share** adds an editor by Penkra Account email. Canvas does not send email.
- Download creates a `.pen` JSON export containing the current local document,
  including edits that have not reached the server yet.
- Use Command/Control+Z and Shift+Command/Control+Z for undo and redo.

Canvas intentionally does not promise full `.pen` rendering. When the editor
shows a compatibility warning, the source data remains present for export even
if that object cannot yet be rendered or edited faithfully.
