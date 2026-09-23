(() => {
  const empty = () => ({ schemaVersion: 2, selected: [], agenda: {}, commitments: [], lodging: { address: "" } });
  const validId = (id) => typeof id === "string" && /^\d+-film$/.test(id);
  const normalize = (input) => {
    const result = empty();
    if (!input || typeof input !== "object") return result;
    result.selected = [...new Set((Array.isArray(input.selected) ? input.selected : []).filter(validId))].slice(0, 600);
    result.agenda = Object.fromEntries(Object.entries(input.agenda || {}).filter(([id, session]) => result.selected.includes(id) && typeof session === "string" && /^\d+-film_session$/.test(session)));
    result.commitments = (Array.isArray(input.commitments) ? input.commitments : []).filter((item) => item && typeof item.start === "string" && typeof item.end === "string" && /^2026-10-(0[8-9]|1[0-8])T/.test(item.start) && Number.isFinite(Date.parse(item.start)) && Date.parse(item.end) > Date.parse(item.start)).slice(0, 100).map((item, index) => ({ id: String(item.id || `reserva-${index}`).slice(0, 100), label: String(item.label || "Reserva personal").slice(0, 120), start: item.start.slice(0, 25), end: item.end.slice(0, 25) }));
    result.lodging.address = String(input.lodging?.address || "").slice(0, 240);
    return result;
  };
  const migrateLegacy = (input) => {
    const result = normalize(input);
    // Existing personal agendas retain the old reservation. New visitors start empty.
    if (input && input.schemaVersion !== 2 && result.selected.length) {
      result.commitments = [{ id: "comida-sabado", label: "Comida", start: "2026-10-10T14:15:00+02:00", end: "2026-10-10T16:15:00+02:00" }];
      result.lodging.address = "Carrer de la Devesa, 22, Sitges";
    }
    return result;
  };
  const parseBackup = (text) => {
    const value = JSON.parse(text);
    const data = value.format === "sitges-agenda" ? value.data : value;
    if (!data || !Array.isArray(data.selected) || !data.agenda || typeof data.agenda !== "object" || Array.isArray(data.agenda)) throw new Error("El archivo no es una copia de una agenda de Sitges.");
    return migrateLegacy(data);
  };
  const api = { empty, normalize, migrateLegacy, parseBackup };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.SitgesData = api;
})();
