(() => {
  "use strict";
  const text = value => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, 32767);
  const joined = value => text(Array.isArray(value) ? value.join(" · ") : value);
  const eventNotes = s => [s?.shared ? "Pase compartido: se reserva el bloque completo." : "", s?.qa ? "Presentación / coloquio." : "", s?.talent === true ? "Con presencia de invitados." : s?.talent ? joined(s.talent) : "", s?.unconfirmedDuration ? "Duración sin confirmar." : ""].filter(Boolean).join(" ");
  // Excel stores wall-clock dates without a timezone. These dates are already in
  // Sitges time; do not shift them according to the exporting device's timezone.
  const date = value => value && /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value.slice(0, 19) + "Z") : null;
  const day = value => value ? new Date(value.slice(0, 10) + "T00:00:00Z") : null;
  const clock = value => value ? (Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16))) / 1440 : null;
  const duration = session => session && !session.unconfirmedDuration ? Math.round((Date.parse(session.end) - Date.parse(session.start)) / 60000) : null;
  const safeUrl = value => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && ["sitgesfilmfestival.com", "www.sitgesfilmfestival.com", "www.google.com"].includes(url.hostname) ? url.href : "";
    } catch { return ""; }
  };
  const routeUrl = (from, to) => from && to && [from.lat, from.lng, to.lat, to.lng].every(Number.isFinite)
    ? `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=walking` : "";
  const source = "Fuente: https://sitgesfilmfestival.com/es/edicion/peliculas · Horas de Sitges (CEST). Comprueba cambios en la web oficial.";

  function sheet(workbook, name, title, note, columns) {
    const ws = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 5, xSplit: name === "Agenda" ? 2 : 1, showGridLines: false }] });
    ws.columns = columns.map(([header, width, format]) => ({ width, style: { font: { name: "Arial", size: 11 }, alignment: { vertical: "top", wrapText: true }, ...(format ? { numFmt: format } : {}) } }));
    ws.getCell("A1").value = title;
    ws.getCell("A1").font = { name: "Arial", size: 18, bold: true, color: { argb: "FF15263F" } };
    ws.getRow(1).height = 30;
    ws.getCell("A2").value = note;
    ws.getCell("A3").value = source;
    for (const number of [2, 3]) ws.getCell(number, 1).font = { name: "Arial", size: 11, italic: true, color: { argb: "FF536274" } };
    for (const number of [1, 2, 3]) for (let col = 1; col <= columns.length; col++) ws.getCell(number, col).alignment = { wrapText: false, vertical: "middle" };
    ws.getRow(5).values = columns.map(([header]) => header);
    ws.getRow(5).height = 34;
    ws.getRow(5).eachCell(cell => {
      cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF15263F" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = { right: { style: "thin", color: { argb: "FFFFFFFF" } } };
    });
    ws.properties.defaultRowHeight = 38;
    ws.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:5" };
    return ws;
  }
  function row(ws, values, height = 48) {
    const r = ws.addRow(values.map(value => value === '' ? null : value));
    r.height = height;
    if (r.number % 2 === 0) r.eachCell({ includeEmpty: true }, cell => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F6F9" } }; });
    r.eachCell(cell => {
      if (typeof cell.value === "number" || cell.value instanceof Date || cell.value?.formula) cell.alignment = { vertical: "top", horizontal: "right", wrapText: true };
    });
    return r;
  }
  function finish(ws, columns) {
    ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, ws.rowCount), column: columns } };
  }
  function flag(cell, danger) {
    cell.font = { name: "Arial", size: 11, bold: true, color: { argb: danger ? "FFA02128" : "FF916400" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: danger ? "FFFFE5E5" : "FFFFF1CC" } };
  }

  async function buildWorkbook(ExcelJS, selection, { posterFor = async () => null, walking } = {}) {
    if (!selection.movies?.length) throw new Error("Selecciona al menos una película para exportar.");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Agenda Sitges 2026";
    workbook.created = new Date(selection.generatedAt);
    workbook.calcProperties.fullCalcOnLoad = true;
    const movies = selection.movies;
    const agenda = sheet(workbook, "Agenda", "Mi agenda · Sitges 2026", "Selección completa del 8 al 18 de octubre. Los conflictos y películas sin pase se conservan; no se cambian tus horarios.", [
      ["Póster", 13], ["Película", 38], ["Día", 13, "dd/mm/yyyy"], ["Hora", 10, "hh:mm"], ["Fin del pase", 21, "dd/mm/yyyy hh:mm"], ["Cine / sala", 30], ["Película (min)", 14, "0"], ["Pase (min)", 13, "0"], ["Estado", 19], ["Nombre del pase", 36], ["Observaciones", 44], ["Conflictos", 55],
    ]);
    let missingPosters = 0;
    for (const movie of movies) {
      const s = movie.session;
      const conflicts = movie.conflicts || [];
      const state = !s ? "Sin pase" : conflicts.length ? "CONFLICTO" : "Agendada";
      const n = agenda.rowCount + 1;
      const minutes = duration(s);
      const r = row(agenda, [null, text(movie.title), day(s?.start), clock(s?.start), s && !s.unconfirmedDuration ? date(s.end) : null, text(s?.location), movie.duration || null,
        minutes === null ? null : { formula: `ROUND((E${n}-C${n}-D${n})*1440,0)`, result: minutes }, state, text(s?.name),
        text(eventNotes(s)), joined(conflicts)], 80);
      if (state !== "Agendada") flag(r.getCell(9), conflicts.length > 0);
      let image;
      try { image = await posterFor(movie.id); } catch { image = null; }
      if (image) {
        const id = workbook.addImage({ base64: image, extension: "jpeg" });
        agenda.addImage(id, { tl: { col: 0, row: r.number - 1 }, ext: { width: 60, height: 90 }, editAs: "oneCell" });
      } else { r.getCell(1).value = "Póster no disponible"; missingPosters++; }
    }
    finish(agenda, 12);

    const films = sheet(workbook, "Películas", "Fichas de las películas elegidas", "Incluye películas sin pase. Celdas vacías = dato no publicado. Los enlaces son referencias a las fichas e imágenes originales.", [
      ["Película", 38], ["Título original", 38], ["Año", 10, "0"], ["Duración (min)", 15, "0"], ["Dirección", 32], ["Secciones", 36], ["Países", 24], ["Idiomas", 24], ["Ficha oficial", 55], ["Póster original", 55], ["Pases disponibles", 19, "0"], ["Sinopsis oficial", 90],
    ]);
    for (const movie of movies) row(films, [text(movie.title), text(movie.originalTitle), movie.year ? Number(movie.year) || text(movie.year) : null, movie.duration || null, joined(movie.directors), joined(movie.sections), joined(movie.countries), joined(movie.languages), safeUrl(movie.officialUrl), safeUrl(movie.posterUrl), movie.sessions.length, text(movie.synopsis || 'Sinopsis no publicada.')], Math.min(200, Math.max(60, Math.ceil((movie.synopsis?.length || 0) / 90) * 15)));
    finish(films, 12);

    const transfers = sheet(workbook, "Traslados", "A pie entre las salas de tu agenda", "Estimaciones OSM / FOSSGIS guardadas el 23/09/2026. Solo entre pases consecutivos del mismo día; no incluye alojamiento ni colas.", [
      ["Día", 13, "dd/mm/yyyy"], ["Desde película(s)", 35], ["Hasta película(s)", 35], ["Sala de salida", 26], ["Sala de llegada", 26], ["Fin anterior", 21, "dd/mm/yyyy hh:mm"], ["Inicio siguiente", 21, "dd/mm/yyyy hh:mm"], ["Distancia (km)", 16, "0.00"], ["A pie (min)", 14, "0"], ["Tiempo disponible (min)", 21, "0"], ["Margen (min)", 15, "0"], ["Estado", 23], ["Ruta Google Maps", 55], ["Observaciones / fuente", 65],
    ]);
    const unique = new Map();
    for (const movie of movies) if (movie.session) {
      const key = movie.session.id;
      if (unique.has(key)) unique.get(key).titles.push(movie.title);
      else unique.set(key, { ...movie, titles: [movie.title] });
    }
    const sessions = [...unique.values()].sort((a, b) => Date.parse(a.session.start) - Date.parse(b.session.start));
    let transferCount = 0;
    for (let i = 1; i < sessions.length; i++) {
      const previous = sessions[i - 1], next = sessions[i];
      if (previous.session.start.slice(0, 10) !== next.session.start.slice(0, 10)) continue;
      const end = previous.session.unconfirmedDuration ? null : previous.session.end;
      const estimate = end && walking?.transfer(previous.venue?.id, next.venue?.id, end, next.session.start);
      const gap = end ? Math.round((Date.parse(next.session.start) - Date.parse(end)) / 60000) : null;
      const n = transfers.rowCount + 1;
      const status = !estimate ? "Sin estimación" : estimate.marginMinutes < 0 ? "NO DA TIEMPO" : estimate.marginMinutes === 0 ? "Sin margen" : "Con margen";
      const note = !estimate ? "No hay una ruta o una duración confirmada: compruébala manualmente." : estimate.withinMelia ? "Cambio dentro del Meliá: reserva orientativa de 5 min; distancia interior no medida." : estimate.hotelAllowance ? "Ruta hasta la entrada del hotel + 5 min interiores. Los km no incluyen recorrido interior." : previous.venue.id === next.venue.id ? "Misma sala. No incluye posibles colas ni salida / reentrada." : "Distancia y duración estimadas; no incluyen colas. Fuente: https://routing.openstreetmap.de/";
      const r = row(transfers, [day(next.session.start), joined(previous.titles), joined(next.titles), text(previous.session.location), text(next.session.location), date(end), date(next.session.start), estimate?.distanceMeters == null ? null : estimate.distanceMeters / 1000, estimate?.minutes ?? null,
        gap === null ? null : { formula: `ROUND((G${n}-F${n})*1440,0)`, result: gap },
        estimate ? { formula: `J${n}-I${n}`, result: estimate.marginMinutes } : null, status, routeUrl(previous.venue, next.venue), note], 66);
      if (!estimate || estimate.marginMinutes <= 0) flag(r.getCell(12), Boolean(estimate && estimate.marginMinutes < 0));
      transferCount++;
    }
    if (!transferCount) row(transfers, ["No hay traslados entre pases del mismo día en esta selección."]);
    finish(transfers, 14);

    const others = sheet(workbook, "Otros pases", "Todos los pases de las películas elegidas", "Referencia para cambiar de pase manualmente. «Elegido» identifica el pase de tu agenda; no implica compra de entrada.", [
      ["Película", 38], ["Día", 13, "dd/mm/yyyy"], ["Hora", 10, "hh:mm"], ["Fin del pase", 21, "dd/mm/yyyy hh:mm"], ["Pase (min)", 14, "0"], ["Cine / sala", 30], ["Elegido", 12], ["Nombre del pase", 40], ["Observaciones", 50], ["Ficha oficial", 55],
    ]);
    for (const movie of movies) {
      if (!movie.sessions.length) row(others, [text(movie.title), null, null, null, null, "Sin pases publicados", "No", null, null, safeUrl(movie.officialUrl)]);
      for (const s of movie.sessions) row(others, [text(movie.title), day(s.start), clock(s.start), s.unconfirmedDuration ? null : date(s.end), duration(s), text(s.location), s.id === movie.session?.id ? "Sí" : "No", text(s.name), text(eventNotes(s)), safeUrl(movie.officialUrl)]);
    }
    finish(others, 10);
    return { workbook, missingPosters };
  }

  const api = { buildWorkbook, text, safeUrl, date, day, clock };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
  window.SitgesExcel = api;
  let libraryPromise;
  function library() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    return libraryPromise ||= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "vendor/exceljs-4.4.0.min.js";
      script.integrity = "sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz";
      script.crossOrigin = "anonymous";
      script.onload = () => window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error("No se ha cargado el generador de Excel."));
      script.onerror = () => { script.remove(); libraryPromise = null; reject(new Error("No se ha podido cargar el generador. Comprueba la conexión y reintenta.")); };
      document.head.append(script);
    });
  }
  async function posters() {
    const index = window.SITGES_POSTERS;
    if (!index) return () => null;
    const atlas = new Image();
    atlas.src = index.file;
    try { await atlas.decode(); } catch { return () => null; }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    return id => {
      const box = index.positions[id];
      if (!box || !context) return null;
      canvas.width = box.width; canvas.height = box.height;
      context.drawImage(atlas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
      return canvas.toDataURL("image/jpeg", 0.9);
    };
  }
  const button = document.querySelector("#exportExcelButton");
  button.addEventListener("click", async () => {
    const app = window.SitgesAgenda;
    let href;
    try {
      const selection = app.exportSelection();
      if (!selection.movies.length) { app.notice("Selecciona al menos una película para exportar."); return; }
      button.disabled = true;
      button.textContent = "Preparando Excel…";
      app.notice("Preparando el Excel con tu selección completa y los pósters…");
      const [ExcelJS, posterFor] = await Promise.all([library(), posters()]);
      const { workbook, missingPosters } = await buildWorkbook(ExcelJS, selection, { posterFor, walking: window.SitgesWalking });
      const buffer = await workbook.xlsx.writeBuffer();
      if (app.getExportIdentity() !== selection.owner) throw new Error("La sesión ha cambiado. Vuelve a exportar desde tu cuenta.");
      href = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = href;
      link.download = `mi-agenda-sitges-2026-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.append(link); link.click(); link.remove();
      app.notice(`Excel descargado: ${selection.movies.length} ${selection.movies.length === 1 ? 'película' : 'películas'}.${missingPosters ? ` ${missingPosters} sin póster disponible.` : ""}`);
    } catch (error) { app.notice(error.message || "No se ha podido generar el Excel. Reinténtalo."); }
    finally {
      button.disabled = false; button.textContent = "Exportar a Excel";
      if (href) setTimeout(() => URL.revokeObjectURL(href), 60000);
    }
  });
})();
