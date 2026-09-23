(() => {
  const app = window.SitgesAgenda;
  if (!app) return;
  const $ = (selector) => document.querySelector(selector);
  const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };
  const draftKey = (uid) => `sitges-2026-draft:${uid}`;
  const guest = () => window.SitgesData.normalize(read(app.localKey) || app.initialLocal);
  let user = null, cloud = null, sync = null, status = "local", busy = false, loadTimer;
  const explainError = (error) => ({
    "auth/invalid-credential": "El correo o la contraseña no son correctos.",
    "auth/wrong-password": "El correo o la contraseña no son correctos.",
    "auth/user-not-found": "El correo o la contraseña no son correctos.",
    "auth/invalid-email": "Revisa el formato del correo electrónico.",
    "auth/email-already-in-use": "No se ha podido crear la cuenta. Prueba a entrar o recuperar la contraseña.",
    "auth/weak-password": "Utiliza una contraseña de al menos ocho caracteres.",
    "auth/too-many-requests": "Se han realizado demasiados intentos. Espera unos minutos.",
    "auth/network-request-failed": "No hay conexión. Comprueba tu acceso a Internet e inténtalo otra vez.",
    "auth/operation-not-allowed": "El acceso por correo todavía no está activado. Contacta con quien administra esta web.",
    "permission-denied": "No se ha podido acceder a tu agenda privada. Revisa la sesión o contacta con quien administra esta web.",
    "resource-exhausted": "Se ha alcanzado el límite de guardado. Tu copia local sigue disponible; inténtalo más tarde.",
  }[error?.code] || "No se ha podido completar la operación. Tu selección se conserva; vuelve a intentarlo.");
  const setStatus = (next, error) => {
    status = next;
    const labels = {
      local: "Guardada en este dispositivo",
      loading: "Cargando tu agenda privada…",
      "load-error": "No se ha podido cargar tu agenda. Reintenta para poder editarla.",
      pending: "Cambios pendientes de guardar",
      saving: "Guardando tu agenda…",
      saved: "Agenda guardada en tu cuenta",
      offline: "Cambios conservados en este navegador · pendientes de sincronizar",
      conflict: "Revisa las dos versiones de tu agenda",
    };
    $("#syncStatus").textContent = error ? explainError(error) : labels[next];
    $("#syncStatus").dataset.state = next;
    $("#accountIdentity").textContent = user?.email || "Agenda de este navegador";
    const locked = ["loading", "load-error", "conflict"].includes(next);
    app.setLocked(locked);
    $("#preferencesButton").disabled = locked;
    $("#importAgenda").disabled = locked;
    $("#copyGuestAgenda").disabled = locked;
    $("#retrySync").hidden = !["offline", "load-error"].includes(next);
    $("#syncConflict").hidden = next !== "conflict";
    if (next !== "loading") clearTimeout(loadTimer);
    if (locked && $("#preferencesDialog").open) $("#preferencesDialog").close();
    updateAccount();
  };
  const updateAccount = () => {
    $("#authForm").hidden = Boolean(user) || !window.SitgesCloud.available;
    $("#signedInActions").hidden = !user;
    const local = guest();
    $("#copyGuestAgenda").hidden = !user || !(local.selected.length || local.commitments.length || local.lodging.address);
    $("#accountExplanation").textContent = user
      ? `Has entrado como ${user.email}. Tu agenda pertenece únicamente a esta cuenta.`
      : window.SitgesCloud.available
        ? "Entra con tu correo para recuperar tu agenda en el móvil y el ordenador. Las cuentas nuevas empiezan con una agenda vacía; puedes importar tu selección después."
        : window.SitgesCloud.configured
          ? "Estás usando el archivo local. Descarga una copia de tu agenda y abre la web publicada para entrar en tu cuenta e importarla."
          : "Las cuentas todavía no están activadas en esta web. Puedes seguir usando tu agenda local y descargar una copia.";
  };
  app.setPersistence((data) => {
    if (user) sync.change(data);
    else { localStorage.setItem(app.localKey, JSON.stringify(data)); setStatus("local"); }
  });
  const download = () => {
    const blob = new Blob([JSON.stringify({ format: "sitges-agenda", version: 2, exportedAt: new Date().toISOString(), data: app.snapshot() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mi-agenda-sitges-2026.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const runAuth = async (action) => {
    if (busy) return;
    if (!window.SitgesCloud.available) return;
    const email = $("#authEmail").value.trim();
    if (!$("#authEmail").reportValidity()) return;
    if (action !== "reset" && !$("#authPassword").reportValidity()) return;
    busy = true;
    $("#authMessage").textContent = "Conectando…";
    $("#authForm").querySelectorAll("button").forEach((button) => { button.disabled = true; });
    try {
      if (!observing) await initialize();
      if (!observing) throw new Error("No se pudo conectar con las cuentas.");
      cloud ||= await window.SitgesCloud.connect();
      if (action === "reset") {
        await cloud.reset(email);
        $("#authMessage").textContent = "Si existe una cuenta con ese correo, recibirás instrucciones para restablecer la contraseña.";
      } else {
        await cloud[action](email, $("#authPassword").value);
        $("#authPassword").value = "";
        $("#authMessage").textContent = action === "signup" ? "Cuenta creada. Ya puedes organizar tu agenda personal." : "Sesión iniciada.";
      }
    } catch (error) { $("#authMessage").textContent = explainError(error); }
    finally {
      busy = false;
      $("#authForm").querySelectorAll("button").forEach((button) => { button.disabled = false; });
    }
  };
  $("#accountButton").addEventListener("click", () => { updateAccount(); $("#accountDialog").showModal(); });
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => $(`#${button.dataset.closeDialog}`).close()));
  $("#authForm").addEventListener("submit", (event) => { event.preventDefault(); void runAuth("login"); });
  $("#signupButton").addEventListener("click", () => void runAuth("signup"));
  $("#resetPassword").addEventListener("click", () => void runAuth("reset"));
  $("#logoutButton").addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    try {
      if (sync?.hasPending && !await sync.flush()) {
        $("#authMessage").textContent = "Hay cambios sin sincronizar. Reintenta el guardado o descarga una copia antes de salir.";
        return;
      }
      await cloud.logout();
      $("#authMessage").textContent = "Has cerrado sesión. Ahora ves la agenda local de este navegador.";
    } catch (error) { $("#authMessage").textContent = explainError(error); }
    finally { busy = false; }
  });
  ["#exportAgenda", "#exportConflict"].forEach((selector) => $(selector).addEventListener("click", download));
  $("#importAgenda").addEventListener("click", () => $("#backupFile").click());
  $("#backupFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const importingFor = user?.uid || null;
    try {
      if (file.size > 1000000) throw new Error("La copia es demasiado grande.");
      const data = window.SitgesData.parseBackup(await file.text());
      if ((user?.uid || null) !== importingFor) throw new Error("La cuenta ha cambiado. Vuelve a elegir la copia para importarla en la cuenta actual.");
      if (!confirm(`La copia contiene ${data.selected.length} películas y ${data.commitments.length} reservas. ¿Sustituir la agenda que estás viendo por esta copia?`)) return;
      app.replace(data);
      $("#authMessage").textContent = "Copia importada. Revisa el estado de guardado de tu agenda.";
    } catch (error) { $("#authMessage").textContent = error.message || "No se ha podido leer la copia."; }
    finally { event.target.value = ""; }
  });
  $("#copyGuestAgenda").addEventListener("click", () => {
    if (user && confirm("¿Copiar la agenda de este navegador a tu cuenta? Sustituirá la agenda que tengas guardada en esta cuenta.")) {
      app.replace(guest());
      $("#authMessage").textContent = "Agenda copiada a tu cuenta. Revisa el estado de guardado.";
    }
  });
  $("#useCloudAgenda").addEventListener("click", () => {
    if (confirm("¿Cargar la versión de la nube y descartar los cambios pendientes de este navegador? Puedes descargar una copia antes.")) sync.resolve(false);
  });
  $("#useLocalAgenda").addEventListener("click", () => {
    if (confirm("¿Sustituir la agenda de la nube por la versión de este navegador?")) sync.resolve(true);
  });
  const retry = () => {
    if (!sync || !user) { void initialize(); return; }
    if (sync.revision === null) { sync.start(user.uid); watchLoad(); }
    else void sync.flush();
  };
  $("#retrySync").addEventListener("click", retry);
  window.addEventListener("online", () => { if (user) retry(); });
  window.addEventListener("beforeunload", (event) => {
    if (sync?.hasPending) { event.preventDefault(); event.returnValue = ""; }
  });
  const renderPreferences = () => {
    const data = app.snapshot();
    $("#lodgingAddress").value = data.lodging.address;
    $("#lodgingMapLink").hidden = !data.lodging.address;
    $("#lodgingMapLink").href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.lodging.address)}`;
    $("#personalCommitments").replaceChildren();
    for (const item of data.commitments) {
      const row = document.createElement("div");
      row.className = "personal-reservation";
      const label = document.createElement("span");
      label.textContent = `${item.label} · ${item.start.slice(8, 10)} oct · ${item.start.slice(11, 16)}–${item.end.slice(11, 16)}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "text-button";
      button.textContent = "Eliminar";
      button.addEventListener("click", () => {
        const current = app.snapshot();
        current.commitments = current.commitments.filter((entry) => entry.id !== item.id);
        app.replace(current);
        renderPreferences();
      });
      row.append(label, button);
      $("#personalCommitments").append(row);
    }
  };
  $("#preferencesButton").addEventListener("click", () => { renderPreferences(); $("#preferencesDialog").showModal(); });
  $("#lodgingForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = app.snapshot();
    data.lodging = { address: $("#lodgingAddress").value.trim() };
    app.replace(data);
    renderPreferences();
    $("#preferencesMessage").textContent = "Alojamiento guardado en tu agenda.";
  });
  $("#commitmentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const day = $("#commitmentDay").value;
    const start = `${day}T${$("#commitmentStart").value}:00+02:00`;
    const end = `${day}T${$("#commitmentEnd").value}:00+02:00`;
    if (Date.parse(end) <= Date.parse(start)) { $("#preferencesMessage").textContent = "La hora de fin debe ser posterior a la de inicio."; return; }
    const data = app.snapshot();
    if (data.commitments.length >= 100) { $("#preferencesMessage").textContent = "Ya tienes 100 reservas. Elimina alguna antes de añadir otra."; return; }
    data.commitments.push({ id: crypto.randomUUID(), label: $("#commitmentLabel").value.trim(), start, end });
    app.replace(data);
    renderPreferences();
    $("#preferencesMessage").textContent = "Reserva añadida. La agenda señalará cualquier película que se solape.";
  });
  const watchLoad = () => {
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => { if (status === "loading") setStatus("load-error"); }, 15000);
  };
  let observing = false;
  const initialize = async () => {
    if (!window.SitgesCloud.available) { setStatus("local"); return; }
    setStatus("loading");
    watchLoad();
    try {
      cloud ||= await window.SitgesCloud.connect();
      if (observing) return;
      observing = true;
      sync = new window.AgendaSync({ backend: cloud, onData: (data) => app.apply(data), onStatus: setStatus,
        drafts: { read: (uid) => read(draftKey(uid)), write: (uid, data) => localStorage.setItem(draftKey(uid), JSON.stringify(data)), remove: (uid) => localStorage.removeItem(draftKey(uid)) },
      });
      cloud.observeAuth((nextUser) => {
        sync.stop();
        user = nextUser;
        $("#authPassword").value = "";
        if (user) {
          app.apply(window.SitgesData.empty());
          sync.start(user.uid);
          watchLoad();
        } else { app.apply(guest()); setStatus("local"); }
      });
    } catch (error) { setStatus("load-error", error); }
  };
  void initialize();
})();
