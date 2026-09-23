(() => {
  // A revision check prevents a stale browser from replacing newer cloud data.
  class AgendaSync {
    constructor({ backend, onData, onStatus, drafts }) {
      Object.assign(this, { backend, onData, onStatus, drafts });
      this.epoch = 0;
      this.stop();
    }
    stop() {
      this.epoch += 1;
      clearTimeout(this.timer);
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.uid = null;
      this.pending = null;
      this.revision = null;
      this.remote = null;
      this.conflict = false;
      this.saving = null;
    }
    start(uid) {
      this.stop();
      this.uid = uid;
      const epoch = this.epoch;
      const draft = this.drafts.read(uid);
      this.onStatus("loading");
      this.unsubscribe = this.backend.watch(uid, (remote) => {
        if (epoch !== this.epoch) return;
        this.remote = remote;
        if (this.revision === null) {
          this.revision = draft ? draft.revision : remote.revision;
          this.pending = draft?.data || null;
          this.onData(this.pending || remote.data);
        }
        this.receive();
      }, (error) => {
        if (epoch === this.epoch) this.onStatus(this.revision === null ? "load-error" : "offline", error);
      });
    }
    receive() {
      if (!this.remote || this.saving || this.conflict) return;
      if (this.pending) {
        if (this.remote.revision !== this.revision) {
          this.conflict = true;
          this.onStatus("conflict");
        } else {
          this.onStatus("pending");
          this.schedule();
        }
      } else {
        this.revision = this.remote.revision;
        this.onData(this.remote.data);
        this.onStatus("saved");
      }
    }
    change(data) {
      if (!this.uid || this.revision === null || this.conflict) throw new Error("La agenda todavía no está lista para guardar.");
      this.pending = data;
      this.drafts.write(this.uid, { revision: this.revision, data });
      this.onStatus("pending");
      this.schedule();
    }
    schedule() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => { void this.flush(); }, 700);
    }
    async flush() {
      clearTimeout(this.timer);
      if (this.saving) {
        const ok = await this.saving;
        return ok ? this.flush() : false;
      }
      if (this.conflict || this.revision === null) return false;
      if (!this.pending) return true;
      const uid = this.uid, epoch = this.epoch, data = this.pending, revision = this.revision;
      this.onStatus("saving");
      this.saving = (async () => {
        try {
          await Promise.resolve();
          if (epoch !== this.epoch) return false;
          const savedRevision = await this.backend.save(uid, revision, data);
          if (epoch !== this.epoch) return false;
          this.revision = savedRevision;
          if (!this.remote || this.remote.revision <= savedRevision) this.remote = { revision: savedRevision, data };
          if (this.pending === data) {
            this.pending = null;
            this.drafts.remove(uid);
          } else this.drafts.write(uid, { revision: savedRevision, data: this.pending });
          return true;
        } catch (error) {
          if (epoch !== this.epoch) return false;
          if (error.code === "agenda/conflict") {
            this.remote = error.remote;
            this.conflict = true;
            this.onStatus("conflict");
          } else this.onStatus("offline", error);
          return false;
        }
      })();
      const ok = await this.saving;
      if (epoch !== this.epoch) return false;
      this.saving = null;
      if (ok) { this.receive(); return this.pending && !this.conflict ? this.flush() : !this.conflict; }
      return false;
    }
    resolve(useLocal) {
      if (!this.conflict || !this.remote) return;
      this.conflict = false;
      this.revision = this.remote.revision;
      if (useLocal) {
        this.drafts.write(this.uid, { revision: this.revision, data: this.pending });
      } else {
        this.pending = null;
        this.drafts.remove(this.uid);
      }
      this.receive();
    }
    get hasPending() { return Boolean(this.pending || this.saving); }
  }
  if (typeof module !== "undefined" && module.exports) module.exports = AgendaSync;
  else window.AgendaSync = AgendaSync;
})();
