(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const scoreFor = (data, id) => data.priorities?.[id] || 0;
  const ranked = (movies, data) => movies.filter(movie => data.selected.includes(movie.id))
    .sort((a, b) => scoreFor(data, b.id) - scoreFor(data, a.id) || a.title.localeCompare(b.title, 'es') || a.id.localeCompare(b.id));
  const filtered = (movies, { query = '', day = 'all', venue = 'all' } = {}) => movies.filter(movie => {
    const text = [movie.title, movie.originalTitle, ...movie.directors].join(' ').toLocaleLowerCase('es');
    return text.includes(query.trim().toLocaleLowerCase('es')) && (day === 'all' && venue === 'all' || movie.sessions.some(session => (day === 'all' || session.start.startsWith(day)) && (venue === 'all' || session.location === venue)));
  });
  const rating = (movie, value, context) => `<div class="priority-control" role="group" aria-label="Prioridad de ${escape(movie.title)}" data-priority-context="${context}"><strong>Prioridad <span>${value}/10</span></strong><div class="priority-stars"><button type="button" data-priority-movie="${movie.id}" data-priority-value="0" aria-label="Prioridad 0 de 10 para ${escape(movie.title)}" aria-pressed="${value === 0}">0</button>${Array.from({length:10}, (_, i) => `<button type="button" class="${i < value ? 'star-filled' : ''}" data-priority-movie="${movie.id}" data-priority-value="${i + 1}" aria-label="Prioridad ${i + 1} de 10 para ${escape(movie.title)}" aria-pressed="${value === i + 1}" title="${i + 1}/10">${i < value ? '★' : '☆'}</button>`).join('')}</div></div>`;
  const api = { ranked, filtered, scoreFor, rating };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  const $ = selector => document.querySelector(selector), app = window.SitgesAgenda;
  if (!app || !$('#festivalCatalog')) return;
  const movies = window.SITGES_PROGRAM.movies, byId = new Map(movies.map(movie => [movie.id, movie]));
  const dayLabel = date => new Intl.DateTimeFormat('es-ES', {weekday:'short',day:'numeric',month:'long',timeZone:'Europe/Madrid'}).format(new Date(date.slice(0,10) + 'T12:00:00+02:00'));
  const passLabel = session => `${dayLabel(session.start)} · ${session.start.slice(11,16)}–${session.unconfirmedDuration ? 'fin pendiente' : session.end.slice(11,16)}${session.end.slice(0,10) !== session.start.slice(0,10) ? ' (+1 día)' : ''} · ${session.location}`;
  const poster = movie => movie.posterUrl ? `<img class="catalog-poster" loading="lazy" src="${escape(movie.posterUrl)}" alt="Póster de ${escape(movie.title)}" />` : '<div class="poster-fallback">Sin póster</div>';
  $('#catalogDay').innerHTML = '<option value="all">Todos: 8–18 octubre</option>' + Array.from({length:11}, (_, i) => `2026-10-${String(i+8).padStart(2,'0')}`).map(day => `<option value="${day}">${escape(dayLabel(day))}</option>`).join('');
  $('#catalogVenue').innerHTML = '<option value="all">Todas las salas</option>' + [...new Set(movies.flatMap(movie => movie.sessions.map(s => s.location)))].sort().map(venue => `<option value="${escape(venue)}">${escape(venue)}</option>`).join('');
  let catalogRendered = false, lastSelection = '';
  function renderCatalog() {
    catalogRendered = true;
    const data = app.snapshot(); lastSelection = JSON.stringify(data.selected);
    const day = $('#catalogDay').value, venue = $('#catalogVenue').value;
    const visible = filtered(movies, {query:$('#catalogSearch').value,day,venue});
    $('#catalogCount').textContent = `${visible.length} películas · incluye fichas sin pase cuando se muestran todos los días y salas. Consulta informativa: no modifica tu agenda.`;
    $('#festivalCatalog').innerHTML = visible.length ? visible.map(movie => {
      const sessions = movie.sessions.filter(s => (day === 'all' || s.start.startsWith(day)) && (venue === 'all' || s.location === venue));
      return `<article class="catalog-card">${poster(movie)}<div><h3>${escape(movie.title)}</h3><p>${movie.duration || '—'} min · ${escape(movie.directors.join(' · '))}</p><p>${escape(movie.sections.join(' · '))}</p>${data.selected.includes(movie.id) ? '<span class="selected-badge">En tu selección</span>' : ''}<details><summary>Sinopsis y ficha</summary><p>${escape(movie.synopsis || 'Sinopsis no publicada por el festival.')}</p><a href="${escape(movie.officialUrl)}" target="_blank" rel="noreferrer">Ficha oficial ↗</a></details></div><div class="catalog-passes"><strong>Pases</strong>${sessions.length ? `<ul>${sessions.map(s => `<li>${escape(passLabel(s))}${s.shared ? `<small>Sesión conjunta: ${escape(s.name)}</small>` : ''}</li>`).join('')}</ul>` : `<p>${movie.archived ? 'Ficha anterior: ya no figura en el catálogo oficial actual; sin pase confirmado.' : 'Pases pendientes de publicación.'}</p>`}</div></article>`;
    }).join('') : '<p class="day-empty">No hay películas con estos filtros.</p>';
  }
  function render() {
    const active = document.activeElement;
    const focus = active?.dataset?.priorityMovie ? { id:active.dataset.priorityMovie, value:active.dataset.priorityValue, context:active.closest('[data-priority-context]')?.dataset.priorityContext } : null;
    const data = app.snapshot();
    document.querySelectorAll('[data-priority-slot]').forEach(slot => {
      const movie = byId.get(slot.dataset.prioritySlot);
      const html = movie && data.selected.includes(movie.id) ? rating(movie, scoreFor(data,movie.id), 'selection') : '';
      if (slot.innerHTML !== html) slot.innerHTML = html;
      slot.hidden = !html;
    });
    const selection = ranked(movies, data);
    $('#priorityCount').textContent = `${selection.length} películas seleccionadas · 0 = sin prioridad asignada · 10 = máxima prioridad · todos los días`;
    const html = selection.length ? selection.map((movie, index) => {
      const chosen = movie.sessions.find(s => s.id === data.agenda[movie.id]);
      return `<article class="priority-card"><span class="priority-rank">${index + 1}</span>${poster(movie)}<div><h3>${escape(movie.title)}</h3><p>${movie.duration || '—'} min</p><p>${chosen ? escape(passLabel(chosen)) : 'Sin pase asignado'}</p>${rating(movie,scoreFor(data,movie.id),'ranking')}</div></article>`;
    }).join('') : '<p class="day-empty">Selecciona películas en «Películas que quiero ver». Aquí aparecerán ordenadas por prioridad.</p>';
    if ($('#priorityList').innerHTML !== html) $('#priorityList').innerHTML = html;
    if (catalogRendered && lastSelection !== JSON.stringify(data.selected)) renderCatalog();
    if (focus) document.querySelector(`[data-priority-context="${focus.context}"] [data-priority-movie="${focus.id}"][data-priority-value="${focus.value}"]`)?.focus({preventScroll:true});
  }
  for (const id of ['#catalogSearch','#catalogDay','#catalogVenue']) $(id).addEventListener(id === '#catalogSearch' ? 'input' : 'change', renderCatalog);
  $('#browseGridButton').addEventListener('click', () => $('#viewProgramButton').click());
  document.querySelector('.workspace').addEventListener('click', event => {
    const button = event.target.closest('[data-priority-movie]');
    if (button) app.setPriority(button.dataset.priorityMovie, Number(button.dataset.priorityValue));
  });
  document.addEventListener('sitges:view', event => { if (event.detail === 2 && !catalogRendered) renderCatalog(); });
  app.subscribe(render); render();
})();
