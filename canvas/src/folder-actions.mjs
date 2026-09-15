export async function createFolderForDocument(api, { name, document }) {
  return api.moveDocumentToNewFolder(document.id, name);
}
