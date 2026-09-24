(() => {
  const program = window.SITGES_PROGRAM;
  if (!program?.movies?.length) return;

  const $ = (selector) => document.querySelector(selector);
  const storageKey = "sitges-2026-agenda-local-v2";
  const travelDays = Array.from({ length: 11 }, (_, i) => `2026-10-${String(i + 8).padStart(2, "0")}`);
  const allDaysKey = "all";
  let commitments = [];
  let lodging = { address: "" };
  let locked = false;
  let exportIdentity = null;
  const subscribers = new Set();
  const isTravelSession = (session) => travelDays.includes(session.start.slice(0, 10));
  const festivalTime = (value) => /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}+02:00`;
  const movies = program.movies
    .map((movie) => ({ ...movie, sessions: movie.sessions.filter(isTravelSession).map((session) => ({ ...session, start: festivalTime(session.start), end: festivalTime(session.end) })) }));
  if (!movies.length) return;
  const movieById = new Map(movies.map((movie) => [movie.id, movie]));
  const venues = [
    { id: "auditori", name: "Sala Auditori Meliá", address: "Hotel Meliá Sitges · Joan Salvat Papasseit, 38", googleQuery: "Hotel Meliá Sitges, Carrer de Joan Salvat Papasseit 38, 08870 Sitges, Barcelona", lat: 41.2367, lng: 1.82392, mapX: 1707, mapY: 450, mapGroup: "melia" },
    { id: "tramuntana", name: "Sala Tramuntana Meliá", address: "Hotel Meliá Sitges · Joan Salvat Papasseit, 38", googleQuery: "Sala Tramuntana, Hotel Meliá Sitges, 08870 Sitges, Barcelona", lat: 41.23664, lng: 1.82436, mapX: 1707, mapY: 450, mapGroup: "melia" },
    { id: "prado", name: "Cinema Casino Prado", address: "Carrer de Francesc Gumà, 6-14 · Sitges", googleQuery: "Casino Prado Suburense, Carrer de Francesc Gumà 6-14, 08870 Sitges, Barcelona", lat: 41.23794, lng: 1.81062, mapX: 116, mapY: 275 },
    { id: "escorxador", name: "Cinema Escorxador", address: "Carrer de Joan Maragall, 36 · Sitges", googleQuery: "Carrer de Joan Maragall 36, 08870 Sitges, Barcelona", lat: 41.2371, lng: 1.81581, mapX: 768, mapY: 420 },
    { id: "mercat", name: "Mercat Vell", address: "Plaça de l'Ajuntament, 11 · Sitges", googleQuery: "Mercat Vell de Sitges, Plaça de l'Ajuntament 11, 08870 Sitges, Barcelona", lat: 41.23522, lng: 1.81166, mapX: null, mapY: null },
    { id: "llevant", name: "Sala Llevant · Brigadoon", address: "Hotel Meliá Sitges · planta −1 · marcador del hotel", googleQuery: "Hotel Meliá Sitges, Carrer de Joan Salvat Papasseit 38, Sitges", lat: 41.2367, lng: 1.82392, mapX: 1707, mapY: 450, mapGroup: "melia" },
  ];
  // Version the user's replacement image so browsers cannot reuse the old map.
  const mapImage = "assets/mapa-sitges-openstreetmap.png?v=96d3449bb03a";
  const persisted = (() => {
    try { return window.SitgesData.migrateLegacy(JSON.parse(localStorage.getItem(storageKey) || localStorage.getItem("sitges-2026-agenda-v1") || "{}")); } catch { return window.SitgesData.empty(); }
  })();
  // Keep the old device copy available for explicit import, never as the public default.
  const initial = window.SitgesData.empty();
  const state = {
    selected: new Set(initial.selected),
    agenda: new Map(),
    priorities: {},
    query: "",
    section: "all",
    venue: "all",
    activeDay: allDaysKey,
    focusedMovieId: null,
    showUnassigned: false,
  };

  const list = $("#movieList");
  const count = $("#selectionCount");
  const results = $("#movieResults");
  const content = $("#agendaContent");
  const toast = $("#toast");
  let toastTimer;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);

  const dateOf = (value) => value.slice(0, 10);
  const timeOf = (value) => value.slice(11, 16);
  const timeValue = (value) => new Date(value).getTime();
  const shortDay = (value) => new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "long" }).format(new Date(`${dateOf(value)}T12:00:00`));
  const duration = (session) => Math.round((timeValue(session.end) - timeValue(session.start)) / 60000);
  const overlaps = (a, b) => timeValue(a.start) < timeValue(b.end) && timeValue(b.start) < timeValue(a.end);
  const schedulable = (session) => !session.unconfirmedDuration && timeValue(session.end) > timeValue(session.start);
  const getSession = (movieId, sessionId) => movieById.get(movieId)?.sessions.find((session) => session.id === sessionId && schedulable(session));
  const conflictingCommitment = (session) => commitments.find((commitment) => overlaps(session, commitment));
  const snapshot = () => window.SitgesData.normalize({ selected: [...state.selected], agenda: Object.fromEntries(state.agenda), priorities: state.priorities, commitments, lodging });
  let persistHandler = (data) => localStorage.setItem(storageKey, JSON.stringify(data));
  const persist = () => {
    if (locked) return;
    try { persistHandler(snapshot()); } catch { say("No se ha podido guardar. Descarga una copia de tu agenda desde Mi cuenta."); }
  };
  const say = (message) => {
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 3200);
  };

  const keepPosition = (render) => {
    const x = window.scrollX || 0, y = window.scrollY || 0;
    const panelPositions = [$(".workspace"), $("#moviePanel"), $("#agendaPanel"), $("#festivalPanel"), $("#prioritiesPanel")].filter(Boolean)
      .map((panel) => ({ panel, top: panel.scrollTop || 0, left: panel.scrollLeft || 0 }));
    const focusedMovie = document.activeElement?.dataset?.movieId;
    render();
    const restore = () => {
      if (focusedMovie) list.querySelector?.(`[data-movie-id="${focusedMovie}"]`)?.focus({ preventScroll: true });
      panelPositions.forEach(({ panel, top, left }) => { panel.scrollTop = top; panel.scrollLeft = left; });
      window.scrollTo?.({ left: x, top: y, behavior: "instant" });
    };
    restore(); requestAnimationFrame(restore);
  };
  const plannedItems = () => [...state.agenda.entries()]
    .map(([movieId, sessionId]) => ({ movie: movieById.get(movieId), session: getSession(movieId, sessionId) }))
    .filter((item) => item.movie && item.session)
    .sort((a, b) => timeValue(a.session.start) - timeValue(b.session.start));

  const defaultSessionFor = (movie) => {
    const sessionsForDay = movie.sessions.filter((session) => (state.activeDay === allDaysKey || dateOf(session.start) === state.activeDay) && (state.venue === "all" || session.location === state.venue));
    return [...sessionsForDay].filter(schedulable).sort((a, b) => timeValue(a.start) - timeValue(b.start))[0];
  };
  const ensureSessionsForSelectedMovies = () => {
    state.selected.forEach((movieId) => {
      if (state.agenda.has(movieId)) return;
      const session = defaultSessionFor(movieById.get(movieId));
      if (session) state.agenda.set(movieId, session.id);
    });
  };
  const conflictsByMovie = (items = plannedItems()) => {
    const conflicts = new Map();
    const add = (movieId, message) => conflicts.set(movieId, [...(conflicts.get(movieId) || []), message]);
    items.forEach(({ movie, session }, index) => {
      const commitment = conflictingCommitment(session);
      if (commitment) add(movie.id, `Se solapa con ${commitment.label.toLocaleLowerCase("es")} (${timeOf(commitment.start)}–${timeOf(commitment.end)}).`);
      items.slice(index + 1).forEach((other) => {
        if (session.id === other.session.id || !overlaps(session, other.session)) return;
        add(movie.id, `Se solapa con ${other.movie.title} (${timeOf(other.session.start)}–${timeOf(other.session.end)}).`);
        add(other.movie.id, `Se solapa con ${movie.title} (${timeOf(session.start)}–${timeOf(session.end)}).`);
      });
    });
    return conflicts;
  };
  const conflictMessagesForSession = (movieId, candidate) => {
    const messages = [];
    const commitment = conflictingCommitment(candidate);
    if (commitment) messages.push(`${commitment.label} (${timeOf(commitment.start)}–${timeOf(commitment.end)})`);
    plannedItems().filter((item) => item.movie.id !== movieId && item.session.id !== candidate.id && overlaps(candidate, item.session)).forEach((item) => {
      messages.push(`${item.movie.title} (${timeOf(item.session.start)}–${timeOf(item.session.end)})`);
    });
    return messages;
  };
  const compatibleSessionsFor = (movie) => movie.sessions.filter((session) => schedulable(session) && !conflictMessagesForSession(movie.id, session).length);
  const checkAgenda = (announce = true) => {
    const conflicts = conflictsByMovie();
    renderAgenda();
    if (!announce) return conflicts;
    if (!state.selected.size) say("Marca al menos una película para revisar la agenda.");
    else if (conflicts.size) say(`⚠️ Hay conflictos en ${conflicts.size} ${conflicts.size === 1 ? "película" : "películas"}. Elige otro pase en la agenda.`);
    else say("Agenda revisada: no hay solapes.");
    return conflicts;
  };

  const renderMovieList = () => {
    const query = state.query.trim().toLocaleLowerCase("es");
    const visible = movies.filter((movie) => {
      const inText = [movie.title, movie.originalTitle, ...movie.directors].join(" ").toLocaleLowerCase("es").includes(query);
      const inSection = state.section === "all" || movie.sections.includes(state.section) || movie.inclusion.includes(state.section);
      const inScope = state.activeDay === allDaysKey && state.venue === "all" || movie.sessions.some((session) => (state.activeDay === allDaysKey || dateOf(session.start) === state.activeDay) && (state.venue === "all" || session.location === state.venue));
      return inText && inSection && inScope;
    });
    const scope = state.activeDay === allDaysKey ? "del catálogo del 8 al 18 de octubre" : `para ${shortDay(`${state.activeDay}T12:00:00`)}`;
    results.textContent = `${visible.length} películas ${scope} · marca las que quieres ver`;
    count.textContent = state.selected.size;
    const sessionsText = (movie) => {
      const sessions = movie.sessions.filter((session) => (state.activeDay === allDaysKey || dateOf(session.start) === state.activeDay) && (state.venue === "all" || session.location === state.venue));
      if (!sessions.length) return movie.archived ? "No figura en el catálogo actual · sin pase confirmado" : "Pases pendientes de publicación";
      return sessions.map((session) => `${state.activeDay === allDaysKey ? `${shortDay(session.start)} · ` : ""}${timeOf(session.start)}${session.unconfirmedDuration ? " (fin pendiente de confirmar; aún no agendable)" : ""}`).join(" · ");
    };
    list.innerHTML = visible.map((movie) => `
      <article class="movie-entry"><label class="movie-card">
        <input type="checkbox" data-movie-id="${movie.id}" ${state.selected.has(movie.id) ? "checked" : ""} />
        <span class="poster-wrap" tabindex="0" data-poster-id="${movie.id}" aria-label="Ver póster y sinopsis de ${escapeHtml(movie.title)}">${movie.posterUrl ? `<img class="movie-poster" loading="lazy" src="${escapeHtml(movie.posterUrl)}" alt="Póster de ${escapeHtml(movie.title)}" />` : `<span class="poster-fallback">SIN<br>PÓSTER</span>`}</span>
        <span>
          <span class="movie-title">${escapeHtml(movie.title)}</span>
          <span class="movie-meta">${movie.duration || "—"} min · ${movie.sessions.length} ${movie.sessions.length === 1 ? "pase" : "pases"}${movie.directors.length ? ` · ${escapeHtml(movie.directors.join(" · "))}` : ""}</span>
          <span class="movie-screenings"><strong>${state.activeDay === allDaysKey ? "Pases:" : "Hoy:"}</strong> ${escapeHtml(sessionsText(movie))}</span>
          <span class="movie-section">${escapeHtml(movie.inclusion || movie.sections.join(" · ") || "Programación Sitges")}</span>
        </span>
      </label><div class="priority-slot" data-priority-slot="${movie.id}"></div></article>`).join("");
    subscribers.forEach(callback => callback());
  };

  const renderAgenda = () => {
    const planned = plannedItems();
    const selectedMovies = [...state.selected].map((id) => movieById.get(id));
    const unassigned = selectedMovies.filter((movie) => !state.agenda.has(movie.id));
    const conflictMap = conflictsByMovie(planned);
    const groups = planned.reduce((result, item) => {
      const key = dateOf(item.session.start);
      (result.get(key) || result.set(key, []).get(key)).push(item);
      return result;
    }, new Map());
    $("#scheduledCount").textContent = planned.length;
    $("#unassignedCount").textContent = unassigned.length;
    $("#conflictCount").textContent = conflictMap.size;
    $("#daysCount").textContent = groups.size;
    if ($("#mobileDayFilter")) $("#mobileDayFilter").value = state.activeDay;
    if ($("#mobileSelectionCount")) $("#mobileSelectionCount").textContent = state.selected.size;
    const itemsForDay = (day) => groups.get(day) || [];
    const walkingRoutesFor = (items) => items.map((item, index) => {
      if (!index) return null;
      const previous = items[index - 1];
      const from = venueById(venueForLocation(previous.session.location));
      const to = venueById(venueForLocation(item.session.location));
      if (!from || !to || from.id === to.id) return null;
      const timing = window.SitgesWalking?.transfer(from.id, to.id, previous.session.end, item.session.start);
      return { from, to, previous, item, timing };
    }).filter(Boolean);
    const cardsHtml = (items) => items.length ? items.map(({ movie, session }) => {
      const conflicts = conflictMap.get(movie.id) || [];
      return `
      <article class="agenda-card${conflicts.length ? " has-conflict" : ""}">
        <div class="agenda-time">${timeOf(session.start)}<small>hasta ${timeOf(session.end)}</small></div>
        <div class="agenda-main"><h4 class="agenda-title">${escapeHtml(movie.title)}</h4><p class="agenda-venue"><span>●</span>${escapeHtml(session.location)} · ${duration(session)} min</p>${session.shared ? `<p class="shared-session">Sesión conjunta: ${escapeHtml(session.name)}. Se reserva el bloque completo; el festival no publica una hora individual para cada película.</p>` : ""}<div class="agenda-card-actions"><button class="map-for-movie" type="button" data-map-for="${movie.id}">Ver sala en el mapa</button><button class="unassign-movie" type="button" data-unassign-movie="${movie.id}">Quitar de este día</button></div></div>
        <label class="agenda-choice"><span class="sr-only">Cambiar pase de ${escapeHtml(movie.title)}</span><select data-session-for="${movie.id}">${movie.sessions.map((option) => `<option value="${option.id}" ${option.id === session.id ? "selected" : ""} ${schedulable(option) ? "" : "disabled"}>${escapeHtml(shortDay(option.start))} · ${timeOf(option.start)} · ${escapeHtml(option.location)}${schedulable(option) ? "" : " · fin pendiente"}</option>`).join("")}</select></label>
        ${conflicts.length ? `<aside class="conflict-notice" role="alert"><strong>⚠️ Conflicto</strong><span>${escapeHtml(conflicts.join(" "))}</span><small>Elige otro pase en el selector o quita esta película de este día.</small><button class="conflict-unassign" type="button" data-unassign-movie="${movie.id}">Quitar esta película del día</button></aside>` : ""}
      </article>`;
    }).join("") : `<p class="day-empty">No hay películas agendadas este día.</p>`;
    const commitmentsHtml = (day) => commitments.filter((commitment) => dateOf(commitment.start) === day).map((commitment) => `<aside class="commitment-card" aria-label="Reserva personal"><span>RESERVA PERSONAL</span><strong>${escapeHtml(commitment.label)} · ${timeOf(commitment.start)} — ${timeOf(commitment.end)}</strong></aside>`).join("");
    const routesHtml = (items) => {
      const routes = walkingRoutesFor(items);
      if (!items.length) return "";
      const routeCards = routes.map(({ from, to, previous, item, timing }) => {
        const distance = timing?.distanceMeters == null ? "" : ` · ${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(timing.distanceMeters / 1000)} km`;
        const gap = timing && (timing.gapMinutes < 0 ? `Las películas se solapan ${Math.abs(timing.gapMinutes)} min.` : `${timing.gapMinutes} min entre películas.`);
        const margin = timing && (timing.status === "conflict"
          ? `⚠ No da tiempo al traslado: faltan ${Math.abs(timing.marginMinutes)} min. Cambia un pase manualmente.`
          : timing.status === "tight" ? "⚠ Llegarías justo al inicio, sin margen."
          : `Te quedarían ${timing.marginMinutes} min de margen tras caminar.`);
        return `<div class="walking-route${timing ? ` route-${timing.status}` : ""}">
          <span><strong>${escapeHtml(from.name)}</strong><small>Tras ${escapeHtml(previous.movie.title)} · ${timeOf(previous.session.end)}</small></span>
          <span class="route-arrow" aria-hidden="true">→</span>
          <span><strong>${escapeHtml(to.name)}</strong><small>Para ${escapeHtml(item.movie.title)} · ${timeOf(item.session.start)}</small></span>
          <a href="${googleWalkingRouteUrl(from, to)}" target="_blank" rel="noreferrer">Ver ruta a pie ↗</a>
          <div class="route-timing">${timing ? `<strong class="route-duration">≈ ${timing.minutes} min ${timing.withinMelia ? "para cambiar de sala en el Meliá" : `a pie${distance}`}</strong><span>${gap}</span><span class="route-margin">${margin}</span>` : `<span>Tiempo a pie no disponible. Consulta la ruta en Google Maps.</span>`}</div>
        </div>`;
      }).join("");
      return `<section class="walking-routes" aria-label="Rutas a pie entre cines"><h4>Rutas a pie entre cines</h4>${routes.length ? `<div class="walking-route-list">${routeCards}</div><p class="walking-estimate-note">Tiempos aproximados, sin colas ni acceso a la sala. Entre salas del Meliá se reservan 5 min orientativos. Para Llevant se usa la entrada del hotel y se añaden 5 min de circulación interior al trayecto exterior. Los demás recorridos usan rutas peatonales guardadas el 23/09/2026 de <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noreferrer">OSRM/FOSSGIS</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">Corregir el mapa</a>. No se cambian tus pases automáticamente.</p>` : `<p>Hoy no necesitas desplazarte entre cines para las películas agendadas.</p>`}</section>`;
    };
    const unassignedPanelHtml = state.showUnassigned && unassigned.length ? `<section id="unassignedPanel" class="unassigned-panel" aria-labelledby="unassignedTitle"><div class="unassigned-heading"><div><p class="eyebrow">PELÍCULAS SIN HUECO</p><h3 id="unassignedTitle">Elige un nuevo día y pase</h3><p>Estas películas siguen seleccionadas, pero no están en ningún día de tu agenda.</p></div><button class="close-unassigned" type="button" data-close-unassigned>Cerrar</button></div><div class="unassigned-list">${unassigned.map((movie) => {
      const options = compatibleSessionsFor(movie);
      const byDay = options.reduce((days, session) => { const day = dateOf(session.start); (days.get(day) || days.set(day, []).get(day)).push(session); return days; }, new Map());
      const daysHtml = options.length ? [...byDay.entries()].map(([day, sessions]) => `<div class="move-day"><strong>${escapeHtml(shortDay(`${day}T12:00:00`))}</strong><div>${sessions.map((session) => `<button class="move-session" type="button" data-assign-movie="${movie.id}" data-assign-session="${escapeHtml(session.id)}">${timeOf(session.start)} · ${escapeHtml(session.location)}</button>`).join("")}</div></div>`).join("") : `<p class="no-available-session">${movie.sessions.some(schedulable) ? "No quedan pases libres con la agenda actual. Puedes eliminarla de la selección o mover primero una película que se cruce." : "El festival aún no publica un pase con horario completo para esta película. Puedes mantenerla en tu selección como pendiente o eliminarla."}</p>`;
      return `<article class="unassigned-card"><div><h4>${escapeHtml(movie.title)}</h4><p>${movie.duration || "—"} min · ${movie.sessions.length} ${movie.sessions.length === 1 ? "pase" : "pases"} posibles</p></div><div class="move-options"><span>Opciones sin solape</span>${daysHtml}</div><button class="remove-movie" type="button" data-remove-movie="${movie.id}">Eliminar de mi selección</button></article>`;
    }).join("")}</div></section>` : "";
    const tabsHtml = `<div class="day-tabs" role="tablist" aria-label="Días de tu agenda"><button class="day-tab day-tab-all" type="button" role="tab" aria-selected="${state.activeDay === allDaysKey}" data-day-tab="${allDaysKey}"><span class="day-tab-date">Días del festival</span><span class="day-tab-count">8 — 18 octubre</span></button>${travelDays.map((day) => {
      const items = itemsForDay(day);
      const hasConflict = items.some((item) => conflictMap.has(item.movie.id));
      return `<button class="day-tab${hasConflict ? " has-conflict" : ""}" type="button" role="tab" aria-selected="${day === state.activeDay}" data-day-tab="${day}"><span class="day-tab-date">${shortDay(`${day}T12:00:00`)}</span><span class="day-tab-count">${items.length} ${items.length === 1 ? "película" : "películas"}</span>${hasConflict ? `<span class="day-tab-conflict">⚠ Conflicto</span>` : ""}</button>`;
    }).join("")}</div>`;
    const mapPanelHtml = `<section class="map-panel day-map-panel" aria-labelledby="mapTitle"><div class="map-heading"><div><p class="eyebrow">MAPA DE LA AGENDA</p><h3 id="mapTitle">Salas de tu agenda</h3><p id="mapStatus" class="map-status">Cargando las salas de este día.</p></div><a id="openMap" class="map-link" href="https://www.google.com/maps/search/?api=1&query=Sitges" target="_blank" rel="noreferrer">Abrir en Google Maps ↗</a></div><div class="map-layout"><section class="saved-map saved-map-large" aria-labelledby="savedMapTitle"><div><strong id="savedMapTitle">Mapa de Sitges con tus salas</strong><span>Base aportada · referencia OpenStreetMap</span></div><div id="savedMap" class="saved-map-canvas"></div></section><div id="venueList" class="venue-list" aria-label="Salas de proyección del día"></div></div></section>`;
    const activeItems = state.activeDay === allDaysKey ? planned : itemsForDay(state.activeDay);
    const dayContentHtml = state.activeDay === allDaysKey
      ? `<section class="all-days-panel" role="tabpanel"><div class="day-heading"><h3>Todos los días del festival</h3><span>${planned.length} ${planned.length === 1 ? "película" : "películas"}</span></div>${travelDays.map((day) => { const items = itemsForDay(day); return `<section class="festival-day"><div class="day-heading"><h3>${shortDay(`${day}T12:00:00`)}</h3><span>${items.length} ${items.length === 1 ? "película" : "películas"}</span></div>${commitmentsHtml(day)}${cardsHtml(items)}${routesHtml(items)}</section>`; }).join("")}</section>`
      : `<section class="day-group" role="tabpanel"><div class="day-heading"><h3>${shortDay(`${state.activeDay}T12:00:00`)}</h3><span>${activeItems.length} ${activeItems.length === 1 ? "película" : "películas"}</span></div>${commitmentsHtml(state.activeDay)}${cardsHtml(activeItems)}${routesHtml(activeItems)}</section>`;
    content.innerHTML = `${tabsHtml}${mapPanelHtml}${unassignedPanelHtml}${dayContentHtml}`;
    renderMapForActiveDay();
    subscribers.forEach(callback => callback());
    if (state.showUnassigned && unassigned.length) requestAnimationFrame(() => $("#unassignedPanel")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const setManualSession = (movieId, sessionId) => {
    const candidate = getSession(movieId, sessionId);
    if (!candidate) return;
    state.agenda.set(movieId, sessionId);
    persist();
    state.activeDay = dateOf(candidate.start);
    state.focusedMovieId = movieId;
    renderAgenda();
    renderMovieList();
    const conflicts = conflictsByMovie();
    if (conflicts.has(movieId)) say("⚠️ Pase cambiado: hay un conflicto marcado para que lo resuelvas manualmente.");
    else say("Pase cambiado. No hay conflicto para esta película.");
  };
  const unassignMovie = (movieId) => {
    const movie = movieById.get(movieId);
    if (!movie) return;
    state.agenda.delete(movieId);
    state.focusedMovieId = null;
    state.activeDay = allDaysKey;
    state.showUnassigned = true;
    persist();
    renderMovieList();
    renderAgenda();
    say(`${movie.title} se ha quitado de ese día. Elige un pase alternativo.`);
  };
  const assignPendingSession = (movieId, sessionId) => {
    const movie = movieById.get(movieId);
    const session = getSession(movieId, sessionId);
    if (!movie || !session) return;
    const conflicts = conflictMessagesForSession(movieId, session);
    if (conflicts.length) {
      say("Ese pase ya no está libre. Revisa las opciones actualizadas.");
      renderAgenda();
      return;
    }
    state.agenda.set(movieId, sessionId);
    state.activeDay = dateOf(session.start);
    state.focusedMovieId = movieId;
    state.showUnassigned = false;
    persist();
    renderMovieList();
    renderAgenda();
    say(`${movie.title} se ha trasladado al ${shortDay(session.start)} a las ${timeOf(session.start)}.`);
  };
  const removeMovieFromSelection = (movieId) => {
    const movie = movieById.get(movieId);
    if (!movie) return;
    state.selected.delete(movieId);
    delete state.priorities[movieId];
    state.agenda.delete(movieId);
    state.focusedMovieId = null;
    if (![...state.selected].some((id) => !state.agenda.has(id))) state.showUnassigned = false;
    persist();
    renderMovieList();
    renderAgenda();
    say(`${movie.title} se ha eliminado de tu selección.`);
  };

  const setupSections = () => {
    const options = [...new Set(movies.flatMap((movie) => movie.sections).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    $("#sectionFilter").innerHTML = `<option value="all">Todas las secciones</option>${options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}`;
    const locations = [...new Set(movies.flatMap((movie) => movie.sessions.map(s => s.location)))].sort((a, b) => a.localeCompare(b, "es"));
    $("#venueFilter").innerHTML = `<option value="all">Todas las salas</option>${locations.map(location => `<option value="${escapeHtml(location)}">${escapeHtml(location)}</option>`).join("")}`;
  };
  const venueForLocation = (location) => {
    if (location.includes("Llevant")) return "llevant";
    if (location.includes("Sala Tramuntana Meliá")) return "tramuntana";
    if (location.includes("Sala Auditori Meliá")) return "auditori";
    if (location.includes("Casino Prado")) return "prado";
    if (location.includes("Escorxador")) return "escorxador";
    if (location.includes("Mercat Vell")) return "mercat";
    return null;
  };
  const venueById = (id) => venues.find((venue) => venue.id === id);
  const googleMapsUrl = (venue) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue?.googleQuery || "Sitges, Barcelona")}`;
  const googleWalkingRouteUrl = (from, to) => `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${from.lat},${from.lng}`)}&destination=${encodeURIComponent(`${to.lat},${to.lng}`)}&travelmode=walking`;
  const mapItemsForDay = () => state.activeDay === allDaysKey ? plannedItems() : plannedItems().filter((item) => dateOf(item.session.start) === state.activeDay);
  const renderSavedMap = (items, mapVenues, focusedVenue) => {
    const target = $("#savedMap");
    if (!target) return;
    const onMap = (venue) => venue && Number.isFinite(venue.mapX) && Number.isFinite(venue.mapY);
    const route = items.map((item, i) => {
      if (!i || dateOf(items[i - 1].session.start) !== dateOf(item.session.start)) return "";
      const from = venueById(venueForLocation(items[i - 1].session.location));
      const to = venueById(venueForLocation(item.session.location));
      return onMap(from) && onMap(to) ? `<polyline class="saved-map-route" points="${from.mapX},${from.mapY} ${to.mapX},${to.mapY}" />` : "";
    }).join("");
    const labels = {
      auditori: "Auditori Meliá",
      tramuntana: "Tramuntana",
      prado: "Casino Prado",
      escorxador: "Escorxador",
      mercat: "Mercat Vell",
      llevant: "Llevant · hotel, planta −1",
    };
    const markers = venues.filter((venue) => onMap(venue) && (!venue.mapGroup || venue.id === "auditori")).map((venue) => {
      const sameMarker = (item) => item?.id === venue.id || (venue.mapGroup && item?.mapGroup === venue.mapGroup);
      const active = sameMarker(focusedVenue) || (!focusedVenue && mapVenues.some(sameMarker));
      const scheduled = mapVenues.some(sameMarker);
      const isRightEdge = venue.mapGroup === "melia";
      const textX = isRightEdge ? -20 : 20;
      const textAnchor = isRightEdge ? "end" : "start";
      const label = venue.mapGroup === "melia" ? "Meliá · Auditori, Tramuntana y Llevant" : labels[venue.id] || venue.name;
      return `<g class="saved-map-marker${scheduled ? " scheduled" : ""}${active ? " active" : ""}" transform="translate(${venue.mapX} ${venue.mapY})"><circle r="15"/><circle class="saved-map-marker-core" r="5"/><text x="${textX}" y="6" text-anchor="${textAnchor}">${escapeHtml(label)}</text></g>`;
    }).join("");
    target.innerHTML = `<div class="saved-map-image-wrap"><img class="saved-map-image" src="${mapImage}" width="1725" height="608" alt="Mapa de Sitges con las salas de proyección, sin alojamientos personales" /><svg class="saved-map-overlay" viewBox="0 0 1725 608" aria-hidden="true" focusable="false">${route}${markers}</svg><span class="saved-map-attribution">Mapa base aportado · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></span></div><p class="saved-map-note">Marcadores orientativos. Meliá agrupa sus tres salas; Mercat Vell queda fuera del encuadre. Las líneas unen salas, no son rutas por calles. Consulta los enlaces para caminar.</p>`;
  };
  const renderMapForActiveDay = () => {
    if (!$("#savedMap")) return;
    const items = mapItemsForDay();
    const venueIds = [...new Set(items.map((item) => venueForLocation(item.session.location)).filter(Boolean))];
    const focusedItem = items.find((item) => item.movie.id === state.focusedMovieId);
    const focusedVenue = focusedItem && venueById(venueForLocation(focusedItem.session.location));
    const mapVenues = venueIds.map(venueById).filter(Boolean);
    $("#mapTitle").textContent = state.activeDay === allDaysKey ? "Salas de todos los días" : `Salas del ${shortDay(`${state.activeDay}T12:00:00`)}`;
    $("#mapStatus").textContent = focusedItem
      ? `${focusedItem.movie.title} · ${focusedItem.session.location} · ${timeOf(focusedItem.session.start)}`
      : items.length
        ? `${items.length} ${items.length === 1 ? "película agendada" : "películas agendadas"} en ${venueIds.length} ${venueIds.length === 1 ? "sala" : "salas"}.`
        : "No tienes películas agendadas este día.";
    const displayVenue = focusedVenue || mapVenues[0];
    $("#openMap").href = googleMapsUrl(displayVenue);
    $("#openMap").textContent = "Abrir en Google Maps ↗";
    renderSavedMap(items, mapVenues, displayVenue);
    $("#venueList").innerHTML = venueIds.length
      ? venueIds.map((id) => {
          const venue = venueById(id);
          const active = displayVenue?.id === id;
          const atVenue = items.filter((item) => venueForLocation(item.session.location) === id);
          return `<button class="venue-button ${active ? "active" : ""}" type="button" data-venue="${id}"><span class="venue-marker"></span><span><span class="venue-name">${escapeHtml(venue.name)}</span><span class="venue-address">${escapeHtml(venue.address)} · ${atVenue.length} ${atVenue.length === 1 ? "película" : "películas"}${venue.mapX === null ? " · Fuera del encuadre: abrir en Google Maps" : ""}</span></span></button>`;
        }).join("")
      : `<p class="day-empty">Aquí aparecerán las salas de tus películas para este día.</p>`;
  };
  const focusMapForMovie = (movieId) => {
    const movie = movieById.get(movieId);
    const session = getSession(movieId, state.agenda.get(movieId));
    if (movie && session) {
      state.activeDay = dateOf(session.start);
      state.focusedMovieId = movieId;
      renderAgenda();
      renderMovieList();
      return;
    }
    state.focusedMovieId = null;
    renderMapForActiveDay();
    if (movie) $("#mapStatus").textContent = `${movie.title} no tiene un pase asignado en la agenda actual.`;
  };
  const focusFirstPlannedMovie = () => {
    const first = plannedItems()[0];
    if (first) focusMapForMovie(first.movie.id);
    else { state.focusedMovieId = null; renderMapForActiveDay(); }
  };

  $("#searchMovies").addEventListener("input", (event) => { state.query = event.target.value; renderMovieList(); });
  $("#sectionFilter").addEventListener("change", (event) => { state.section = event.target.value; renderMovieList(); });
  $("#venueFilter").addEventListener("change", (event) => { state.venue = event.target.value; renderMovieList(); });
  const chooseDay = (day) => {
    if (day !== allDaysKey && !travelDays.includes(day)) return;
    state.activeDay = day; state.focusedMovieId = null;
    renderAgenda(); renderMovieList();
    if ($("#moviePanel")) $("#moviePanel").scrollTop = 0;
    if ($("#agendaPanel")) $("#agendaPanel").scrollTop = 0;
  };
  if ($("#mobileDayFilter")) {
    $("#mobileDayFilter").innerHTML = `<option value="all">Todos · 8 — 18 octubre</option>${travelDays.map((day) => `<option value="${day}">${shortDay(`${day}T12:00:00`)}</option>`).join("")}`;
    $("#mobileDayFilter").addEventListener("change", (event) => chooseDay(event.target.value));
  }
  list.addEventListener("load", (event) => {
    if (!event.target.matches(".movie-poster")) return;
    const wrapper = event.target.closest(".poster-wrap");
    if (!wrapper || !event.target.naturalWidth) return;
    wrapper.style.setProperty("--poster-natural-width", `${event.target.naturalWidth}px`);
  }, true);
  list.addEventListener("change", (event) => {
    const id = event.target.dataset.movieId;
    if (!id) return;
    if (event.target.checked) {
      state.selected.add(id);
      const session = defaultSessionFor(movieById.get(id));
      if (session) state.agenda.set(id, session.id);
      state.focusedMovieId = id;
    } else {
      state.selected.delete(id);
      delete state.priorities[id];
      state.agenda.delete(id);
      state.focusedMovieId = null;
    }
    state.showUnassigned = false;
    persist();
    count.textContent = state.selected.size;
    keepPosition(renderAgenda);
    const conflicts = conflictsByMovie();
    if (event.target.checked && conflicts.has(id)) say("⚠️ Esta selección crea un conflicto. Está marcado en rojo para que elijas otro pase.");
  });
  $("#optimizeButton").addEventListener("click", () => checkAgenda(true));
  $("#unassignedStat").addEventListener("click", () => {
    const unassigned = [...state.selected].filter((movieId) => !state.agenda.has(movieId));
    if (!unassigned.length) { say("No tienes películas sin hueco."); return; }
    state.activeDay = allDaysKey;
    state.focusedMovieId = null;
    state.showUnassigned = true;
    renderMovieList();
    renderAgenda();
  });
  $("#clearButton").addEventListener("click", () => { state.selected.clear(); state.agenda.clear(); state.priorities = {}; state.focusedMovieId = null; state.showUnassigned = false; persist(); renderMovieList(); renderAgenda(); say("Selección vaciada."); });
  content.addEventListener("change", (event) => { if (event.target.dataset.sessionFor) setManualSession(event.target.dataset.sessionFor, event.target.value); });
  content.addEventListener("click", (event) => {
    const tabDay = event.target.closest("[data-day-tab]")?.dataset.dayTab;
    if (tabDay) { chooseDay(tabDay); return; }
    const movieId = event.target.closest("[data-map-for]")?.dataset.mapFor;
    const venueId = event.target.closest("[data-venue]")?.dataset.venue;
    const unassignMovieId = event.target.closest("[data-unassign-movie]")?.dataset.unassignMovie;
    const assignButton = event.target.closest("[data-assign-movie][data-assign-session]");
    const removeMovieId = event.target.closest("[data-remove-movie]")?.dataset.removeMovie;
    if (event.target.closest("[data-close-unassigned]")) { state.showUnassigned = false; renderAgenda(); return; }
    if (unassignMovieId) { unassignMovie(unassignMovieId); return; }
    if (assignButton) { assignPendingSession(assignButton.dataset.assignMovie, assignButton.dataset.assignSession); return; }
    if (removeMovieId) { removeMovieFromSelection(removeMovieId); return; }
    if (movieId) { focusMapForMovie(movieId); return; }
    const item = venueId && mapItemsForDay().find((candidate) => venueForLocation(candidate.session.location) === venueId);
    if (item) { state.focusedMovieId = item.movie.id; renderMapForActiveDay(); }
  });

  const registerWebMcp = () => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({
        name: "leer_agenda_sitges",
        title: "Leer agenda de Sitges",
        description: "Devuelve las películas seleccionadas, los pases asignados y los conflictos que necesitan revisión manual.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: () => {
          const planned = plannedItems();
          const conflicts = conflictsByMovie(planned);
          return { selected: state.selected.size, scheduled: planned.map(({ movie, session }) => ({ title: movie.title, start: session.start, end: session.end, location: session.location })), conflicts: [...conflicts.entries()].map(([movieId, messages]) => ({ title: movieById.get(movieId).title, messages })) };
        },
      }, { signal: lifecycle.signal })).catch(() => {});
      void Promise.resolve(context.registerTool({
        name: "optimizar_agenda_sitges",
        title: "Seleccionar y revisar agenda de Sitges",
        description: "Selecciona películas, mantiene los pases ya elegidos y señala los conflictos sin modificar horarios automáticamente.",
        inputSchema: { type: "object", properties: { movieIds: { type: "array", items: { type: "string" }, minItems: 1 } }, required: ["movieIds"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: (input) => {
          if (locked) throw new Error("Espera a que se cargue tu cuenta antes de modificar la agenda.");
          const ids = input?.movieIds;
          if (!Array.isArray(ids) || !ids.every((id) => movieById.has(id))) throw new Error("La selección incluye una película desconocida.");
          state.selected = new Set(ids);
          state.priorities = Object.fromEntries(Object.entries(state.priorities).filter(([id]) => state.selected.has(id)));
          state.agenda = new Map([...state.agenda].filter(([movieId]) => state.selected.has(movieId)));
          ensureSessionsForSelectedMovies();
          persist();
          const planned = plannedItems();
          const conflicts = conflictsByMovie(planned);
          renderMovieList();
          renderAgenda();
          return { scheduled: planned.length, conflicts: [...conflicts.entries()].map(([movieId, messages]) => ({ title: movieById.get(movieId).title, messages })) };
        },
      }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* WebMCP is optional for ordinary browsers. */ }
  };

  window.SitgesAgenda = {
    snapshot,
    subscribe: (callback) => { subscribers.add(callback); return () => subscribers.delete(callback); },
    setPriority: (movieId, score) => {
      if (locked || !state.selected.has(movieId) || !Number.isInteger(score) || score < 0 || score > 10) return false;
      state.priorities[movieId] = score;
      persist(); keepPosition(renderAgenda);
      return true;
    },
    setExportIdentity: (identity) => { exportIdentity = identity; },
    getExportIdentity: () => exportIdentity,
    exportSelection: () => {
      if (!exportIdentity) throw new Error("Entra en tu cuenta para exportar tu agenda.");
      const conflicts = conflictsByMovie();
      return {
        owner: exportIdentity, generatedAt: new Date().toISOString(), sourceDate: program.fetchedAt,
        movies: [...state.selected].map((id) => {
          const movie = movieById.get(id), session = getSession(id, state.agenda.get(id));
          return { ...movie, session: session || null, venue: session ? venueById(venueForLocation(session.location)) || null : null, conflicts: conflicts.get(id) || [] };
        }).sort((a, b) => (a.session ? timeValue(a.session.start) : Infinity) - (b.session ? timeValue(b.session.start) : Infinity) || a.title.localeCompare(b.title, "es")),
      };
    },
    localKey: storageKey,
    initialLocal: persisted,
    setPersistence: (handler) => { persistHandler = handler; },
    setLocked: (value) => { locked = value; $(".workspace").inert = value; $(".workspace").setAttribute("aria-busy", String(value)); },
    apply: (input, { preserveView = false } = {}) => {
      const data = window.SitgesData.normalize(input);
      state.selected = new Set(data.selected.filter((id) => movieById.has(id)));
      state.priorities = data.priorities;
      state.agenda = new Map(Object.entries(data.agenda).filter(([id, sessionId]) => state.selected.has(id) && getSession(id, sessionId)));
      commitments = data.commitments;
      lodging = data.lodging;
      if (!preserveView) { state.focusedMovieId = null; state.showUnassigned = false; state.activeDay = allDaysKey; }
      const render = () => { renderMovieList(); renderAgenda(); };
      if (preserveView) keepPosition(render); else render();
    },
    replace: (input) => { if (locked) throw new Error("Espera a que se cargue tu agenda."); window.SitgesAgenda.apply(input); persist(); },
    notice: say,
  };
  setupSections();
  if (program.stats && $("#programStatus")) $("#programStatus").innerHTML = `${program.stats.currentMovies || program.stats.movies} fichas del catálogo oficial · ${program.stats.sessions} sesiones${program.stats.retainedMovies ? ` · ${program.stats.retainedMovies} fichas anteriores conservadas sin pase confirmado` : ""}. <a href="https://sitgesfilmfestival.com/es/edicion/peliculas" target="_blank" rel="noreferrer">Programación oficial</a> revisada el ${new Intl.DateTimeFormat("es-ES").format(new Date(program.fetchedAt))}.`;
  renderMovieList();
  renderAgenda();
  registerWebMcp();
})();
