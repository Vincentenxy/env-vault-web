export interface ParentFolderManager {
  managerId: string
}

export function resolveCreateFolderManagerId(
  parentFolder: ParentFolderManager | null,
  selectedManagerId: string,
): string {
  return parentFolder ? parentFolder.managerId.trim() : selectedManagerId.trim()
}
