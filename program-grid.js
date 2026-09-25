(() => {
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const clock = v => v.slice(11, 16);
  const dateLabel = day => new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' }).format(new Date(day + 'T12:00:00+02:00'));
  const minutes = (value, day) => (Date.parse(value.slice(0, 19) + 'Z') - Date.parse(day + 'T00:00:00Z')) / 60000;
  function sessionsFor(program) {
    const byId = new Map();
    for (const movie of program.movies) for (const session of movie.sessions) {
      if (!byId.has(session.id)) byId.set(session.id, { ...session, movies: [], sections: [] });
      const s = byId.get(session.id); s.movies.push({ id: movie.id, title: movie.title, url: movie.officialUrl });
      s.sections.push(...movie.sections);
    }
    for (const activity of program.otherActivities || []) byId.set(activity.id, { ...activity, movies: [], sections: ['Otras actividades'] });
    return [...byId.values()].sort((a, b) => a.start.localeCompare(b.start) || a.location.localeCompare(b.location));
  }
  const colors = ['#e5efff', '#f8e2db', '#e3efd9', '#f4e3f5', '#fff0c8', '#d9f2f0', '#e9e3f4'];
  const color = section => colors[[...section].reduce((n, c) => n + c.charCodeAt(0), 0) % colors.length];
  function layout(program, { day = 'all', venue = 'all', scale = 1, chosen = [] } = {}) {
    const all = sessionsFor(program), chosenIds = new Set(chosen);
    const days = Array.from({ length: 11 }, (_, i) => `2026-10-${String(8 + i).padStart(2, '0')}`).filter(d => day === 'all' || d === day);
    const locations = [...new Set(all.map(s => s.location))].sort((a, b) => a.localeCompare(b, 'es')).filter(v => venue === 'all' || venue === v);
    const visible = all.filter(s => days.includes(s.start.slice(0, 10)) && locations.includes(s.location));
    const start = Math.min(480, ...visible.map(s => Math.floor(minutes(s.start, s.start.slice(0, 10)) / 60) * 60));
    const end = Math.max(1440, ...visible.map(s => Math.ceil(Math.max(minutes(s.end, s.start.slice(0, 10)), minutes(s.start, s.start.slice(0, 10)) + 20) / 60) * 60));
    const ticks = Array.from({ length: (end - start) / 30 + 1 }, (_, i) => start + i * 30);
    const axis = ticks.map(t => `<span class="grid-time" style="top:${(t - start) * scale}px">${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}${t >= 1440 ? ' +1' : ''}</span>`).join('');
    const height = (end - start) * scale;
    const html = days.map(d => `<section class="grid-day"><h3>${escape(dateLabel(d))}</h3><div class="grid-lanes"><div class="grid-axis"><div class="grid-lane-heading">Hora</div><div class="grid-lane-body" style="height:${height}px">${axis}</div></div>${locations.map(location => {
      const events = visible.filter(s => s.start.startsWith(d) && s.location === location);
      return `<div class="grid-lane"><div class="grid-lane-heading">${escape(location)}</div><div class="grid-lane-body" style="height:${height}px;background-size:100% ${30 * scale}px">${events.map(s => {
        const length = Math.max(0, minutes(s.end, d) - minutes(s.start, d));
        const title = s.movies.length === 1 ? s.movies[0].title : s.name;
        const label = `${clock(s.start)}–${s.unconfirmedDuration ? '?' : clock(s.end)} · ${title} · ${s.movies.map(m => m.title).join(' + ')} · ${location}`;
        return `<button type="button" class="grid-event${chosenIds.has(s.id) ? ' grid-chosen' : ''}${s.unconfirmedDuration ? ' grid-unconfirmed' : ''}" data-grid-session="${escape(s.id)}" aria-pressed="${chosenIds.has(s.id)}" title="${escape(label)}" aria-label="${escape(label)}" style="top:${(minutes(s.start, d) - start) * scale}px;height:${Math.max(19, length * scale - 2)}px;background:${color(s.sections[0] || '')}"><b>${clock(s.start)} – ${s.unconfirmedDuration ? '?' : clock(s.end)}</b><span>${escape(title)}</span>${s.movies.length > 1 ? `<small>${s.movies.length} películas · pase conjunto</small>` : ''}<small class="grid-selection-label" ${chosenIds.has(s.id) ? '' : 'hidden'}>En tu agenda</small></button>`;
      }).join('')}</div></div>`;
    }).join('')}</div></section>`).join('');
    return { html, visible, days, locations, start };
  }
  const api = { sessionsFor, layout, minutes, escape };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  window.SitgesGrid = api;
  const $ = s => document.querySelector(s), program = window.SITGES_PROGRAM;
  const all = sessionsFor(program), byId = new Map(all.map(s => [s.id, s]));
  $('#programDayFilter').innerHTML = '<option value="all">Todos: 8–18 octubre</option>' + Array.from({ length: 11 }, (_, i) => `2026-10-${String(i + 8).padStart(2, '0')}`).map(d => `<option value="${d}">${escape(dateLabel(d))}</option>`).join('');
  $('#programVenueFilter').innerHTML = '<option value="all">Todas las salas</option>' + [...new Set(all.map(s => s.location))].sort().map(v => `<option value="${escape(v)}">${escape(v)}</option>`).join('');
  function render() {
    const chosen = Object.values(window.SitgesAgenda.snapshot().agenda);
    const view = layout(program, { day: $('#programDayFilter').value, venue: $('#programVenueFilter').value, scale: Number($('#programScale').value), chosen });
    $('#programGrid').innerHTML = `<div class="program-grid-board">${view.html}</div>`;
    $('#programGrid').scrollTop = Math.max(0, 480 - view.start) * Number($('#programScale').value);
    const extra = view.visible.filter(s => !s.movies.length).length;
    $('#programGridSummary').textContent = `${view.visible.filter(s => s.movies.length).length} sesiones de cine · ${extra} ${extra === 1 ? 'otra actividad' : 'otras actividades'} · ${view.days.length} ${view.days.length === 1 ? 'día' : 'días'} · ${view.locations.length} ${view.locations.length === 1 ? 'sala' : 'salas'}. Revisado el ${new Date(program.fetchedAt).toLocaleDateString('es-ES')}.`;
    $('#programDetails').hidden = true;
    const pending = program.movies.filter(m => !m.sessions.length);
    $('#programPendingTitle').textContent = `${pending.length} fichas sin pase publicado o confirmado`;
    $('#programPending').innerHTML = `<ul>${pending.map(m => `<li>${escape(m.title)}${m.archived ? ' · ya no figura en el catálogo actual' : ''}</li>`).join('')}</ul>`;
  }
  $('#viewProgramButton').addEventListener('click', () => { if (!window.SitgesAgenda.getExportIdentity()) return; $('#programDialog').showModal(); render(); });
  for (const id of ['#programDayFilter', '#programVenueFilter', '#programScale']) $(id).addEventListener('change', render);
  let detailSession = null;
  function showDetails(s) {
    const data = window.SitgesAgenda.snapshot();
    const panel = $('#programDetails');
    panel.innerHTML = `<button type="button" class="grid-detail-close" aria-label="Cerrar detalle del pase">×</button><h3>${escape(s.name)}</h3><p id="gridSelectionStatus" role="status"></p><p>${escape(dateLabel(s.start.slice(0, 10)))} · ${clock(s.start)}–${s.unconfirmedDuration ? 'fin pendiente' : clock(s.end)}${s.end.slice(0, 10) !== s.start.slice(0, 10) ? ' (+1 día)' : ''} · ${escape(s.location)}</p><ul>${s.movies.map(m => {
      const chosen = data.agenda[m.id], selected = data.selected.includes(m.id), same = chosen === s.id;
      const current = chosen && byId.get(chosen);
      return `<li><a href="${escape(m.url)}" target="_blank" rel="noreferrer">${escape(m.title)}</a>${current && !same ? `<small>Tu pase actual: ${escape(dateLabel(current.start.slice(0,10)))} · ${clock(current.start)} · ${escape(current.location)}</small>` : ''}<div class="grid-selection-actions"><button type="button" data-grid-select="${escape(m.id)}" ${same || s.unconfirmedDuration && selected ? 'disabled' : ''}>${same ? '✓ Este pase está en tu agenda' : s.unconfirmedDuration ? selected ? 'Seleccionada · fin pendiente' : 'Seleccionar sin pase (fin pendiente)' : chosen ? 'Cambiar a este pase' : 'Seleccionar película y este pase'}</button>${selected ? `<button type="button" data-grid-remove="${escape(m.id)}">Quitar de mi selección</button>` : ''}</div></li>`;
    }).join('')}</ul><p>${s.shared ? 'Pase conjunto: selecciona las películas que quieras; comparten este bloque horario. ' : ''}${s.qa ? 'Con presentación / coloquio. ' : ''}${s.talent ? 'Con invitados. ' : ''}${!s.movies.length ? 'Actividad sin películas asociadas en la web oficial.' : ''}</p>`;
    panel.hidden = false;
  }
  $('#programGrid').addEventListener('click', e => {
    const s = byId.get(e.target.closest('[data-grid-session]')?.dataset.gridSession); if (!s) return;
    detailSession = s; showDetails(s);
  });
  $('#programDetails').addEventListener('click', event => {
    if (event.target.closest('.grid-detail-close')) { $('#programDetails').hidden = true; detailSession = null; return; }
    const select = event.target.closest('[data-grid-select]'), remove = event.target.closest('[data-grid-remove]');
    if (!detailSession || !select && !remove) return;
    const id = select?.dataset.gridSelect || remove.dataset.gridRemove;
    const result = select ? window.SitgesAgenda.selectScreening(id, detailSession.id) : window.SitgesAgenda.removeSelection(id);
    showDetails(detailSession);
    const status = $('#gridSelectionStatus');
    status.textContent = !result ? 'No se ha cambiado tu selección. Espera a que termine de cargar tu cuenta.' : result.conflicts?.length ? `⚠️ Conflicto: ${result.conflicts.join(' ')} No se han cambiado los otros pases. Revisa tu agenda.` : remove ? 'Película eliminada de tu selección.' : detailSession.unconfirmedDuration ? 'Seleccionada sin pase asignado: fin pendiente de confirmar.' : 'Pase guardado en tu agenda.';
    status.className = result.conflicts?.length ? 'grid-conflict' : '';
    $('#programDetails').querySelector(`[data-grid-${remove ? 'select' : 'remove'}="${id}"]`)?.focus({preventScroll:true});
  });
  window.SitgesAgenda.subscribe(() => {
    if (!$('#programDialog').open) return;
    const chosen = new Set(Object.values(window.SitgesAgenda.snapshot().agenda));
    $('#programGrid').querySelectorAll('[data-grid-session]').forEach(button => {
      const selected = chosen.has(button.dataset.gridSession);
      button.classList.toggle('grid-chosen', selected);
      button.setAttribute('aria-pressed', String(selected));
      const label = button.querySelector('.grid-selection-label');
      if (label) label.hidden = !selected;
    });
  });
})();
