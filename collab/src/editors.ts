/** The most users that one store names as editors of a document; the backend keeps as many per version. */
export const MAX_EDITORS = 100;

/**
 * Who changed each open document since its last store: the ids of the users whose connections changed it, each once, in
 * the order of their first change. A store takes them together with the state, so the backend learns whose changes the
 * state has; a store that fails gives them back for the next one.
 */
export function createDocumentEditors(limit = MAX_EDITORS) {
  const editors = new Map<string, Set<string>>();
  const addAll = (documentName: string, userIds: Iterable<string>) => {
    let changedBy = editors.get(documentName);
    for (const userId of userIds) {
      if (!changedBy) editors.set(documentName, (changedBy = new Set()));
      if (changedBy.size >= limit) return;
      changedBy.add(userId);
    }
  };
  return {
    /** The user `userId` changed the document. */
    add(documentName: string, userId: string) {
      addAll(documentName, [userId]);
    },
    /** Who changed the document since the previous take; the document starts with nobody again. */
    take(documentName: string): string[] {
      const changedBy = [...(editors.get(documentName) ?? [])];
      editors.delete(documentName);
      return changedBy;
    },
    /** Gives back those taken for a store that failed: they changed the document before anybody who did since. */
    giveBack(documentName: string, userIds: readonly string[]) {
      const since = editors.get(documentName) ?? [];
      editors.delete(documentName);
      addAll(documentName, [...userIds, ...since]);
    },
    forget(documentName: string) {
      editors.delete(documentName);
    },
  };
}

export type DocumentEditors = ReturnType<typeof createDocumentEditors>;
