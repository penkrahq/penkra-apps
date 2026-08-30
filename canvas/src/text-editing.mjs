export function beginSelectedTextEditing({ editor, selection }) {
  if (
    !editor
    || selection?.effectiveNode?.type !== "text"
    || selection.runtimeNode?.type !== "TEXT"
    || selection.runtimeNode.locked
  ) return false;

  editor.startTextEditing(selection.selectedId);
  return editor.state.editingTextId === selection.selectedId;
}
