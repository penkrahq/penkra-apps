export async function createFolderForDocument(api, { name, parentId = null, document }) {
  const folder = await api.createFolder(name, parentId);
  const movedDocument = await api.moveDocument(document.id, folder.id);
  return { folder, movedDocument };
}
