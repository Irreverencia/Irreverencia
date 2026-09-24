(() => {
  // Application-level separation by authenticated Firebase UID, not encryption.
  // Only agenda data is stored here: never passwords, emails or authentication tokens.
  class AgendaStorage {
    constructor(storage, normalize) { this.storage = storage; this.normalize = normalize; }
    key(uid, draft = false) {
      if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error("Cuenta no válida para el guardado local.");
      return `${draft ? "sitges-2026-draft" : "sitges-2026-browser-v1"}:${uid}`;
    }
    read(uid, draft = false) {
      const raw = this.storage.getItem(this.key(uid, draft));
      if (!raw) return null;
      // A damaged copy must not prevent login or replace the cloud agenda.
      let record;
      try { record = JSON.parse(raw); } catch { return null; }
      if (!record || (record.uid !== uid && !(draft && record.uid === undefined))
        || !Number.isSafeInteger(record.revision) || record.revision < 0
        || !record.data || !Array.isArray(record.data.selected)
        || !record.data.agenda || typeof record.data.agenda !== "object" || Array.isArray(record.data.agenda)) return null;
      return { revision: record.revision, data: this.normalize(record.data) };
    }
    write(uid, record, draft = false) {
      if (!Number.isSafeInteger(record.revision) || record.revision < 0) throw new Error("Versión de agenda no válida.");
      this.storage.setItem(this.key(uid, draft), JSON.stringify({ uid, revision: record.revision, data: this.normalize(record.data), savedAt: new Date().toISOString() }));
    }
    removeDraft(uid) { this.storage.removeItem(this.key(uid, true)); }
  }
  if (typeof module !== "undefined" && module.exports) module.exports = AgendaStorage;
  else window.AgendaStorage = AgendaStorage;
})();
