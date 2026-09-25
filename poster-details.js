(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const safeUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' ? escape(url.href) : ''; } catch { return ''; } };
  function details(movie, full = true) {
    const row = (label, value) => value && (!Array.isArray(value) || value.length) ? `<dt>${label}</dt><dd>${escape(Array.isArray(value) ? value.join(' · ') : value)}</dd>` : '';
    const source = safeUrl(movie.officialUrl), poster = safeUrl(movie.posterUrl);
    const date = value => new Intl.DateTimeFormat('es-ES', {day:'numeric',month:'long',weekday:'short',timeZone:'Europe/Madrid'}).format(new Date(value.slice(0,10) + 'T12:00:00+02:00'));
    return `${poster ? `<img src="${poster}" alt="Póster de ${escape(movie.title)}">` : ''}<div class="film-details-copy"><h2${full ? ' id="movieDetailsTitle"' : ''}>${escape(movie.title)}</h2><dl>${row('Título original', movie.originalTitle)}${row('Dirección', movie.directors)}${row('Año', movie.year)}${row('Duración', movie.duration > 0 ? `${movie.duration} min` : 'No publicada')}${row('Secciones', movie.sections)}${row('Países', movie.countries)}${row('Idiomas', movie.languages)}${row('Géneros', movie.genres)}${row('Tipo', movie.types)}${row('Estreno', movie.premieres)}${row('Calificación', movie.ratings)}</dl><h3>Sinopsis</h3><p>${escape(movie.synopsis || 'Sinopsis no publicada por el festival.')}</p>${full ? `<h3>Ficha técnica y reparto</h3><p class="film-credits">${escape(movie.credits || 'Ficha técnica y reparto no publicados en los datos disponibles.')}</p><h3>Pases</h3>${movie.sessions.length ? `<ul>${movie.sessions.map(s => `<li>${escape(date(s.start))} · ${escape(s.start.slice(11,16))}–${s.unconfirmedDuration ? 'fin pendiente' : escape(s.end.slice(11,16))}${s.end.slice(0,10) !== s.start.slice(0,10) ? ' (+1 día)' : ''} · ${escape(s.location)}${s.shared ? `<br>Sesión conjunta: ${escape(s.name)}. Se reserva el bloque completo.` : ''}${s.qa ? '<br>Con presentación / coloquio.' : ''}${s.talent ? '<br>Con invitados.' : ''}</li>`).join('')}</ul>` : '<p>Sin pase confirmado.</p>'}` : '<p>Pulsa el póster para ver la ficha completa y el reparto.</p>'}${source ? `<a href="${source}" target="_blank" rel="noreferrer">Toda la información en la ficha oficial ↗</a>` : ''}</div>`;
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { details, safeUrl }; return; }
  const preview = document.querySelector('#posterPreview'), dialog = document.querySelector('#movieDetails');
  const movies = new Map(window.SITGES_PROGRAM.movies.map(movie => [movie.id, movie]));
  let anchor = null, timer, opener = null;
  const hide = () => { clearTimeout(timer); preview.hidden = true; anchor?.removeAttribute('aria-describedby'); anchor = null; };
  const later = () => { clearTimeout(timer); timer = setTimeout(hide, 180); };
  function show(wrapper) {
    const movie = movies.get(wrapper.dataset.posterId);
    if (!movie || dialog.open || (anchor === wrapper && !preview.hidden)) return;
    hide(); anchor = wrapper;
    preview.innerHTML = details(movie, false);
    wrapper.setAttribute('aria-describedby', 'posterPreview'); preview.hidden = false;
    preview.style.setProperty('--preview-poster-width', `${wrapper.querySelector('img')?.naturalWidth || 291}px`);
    const rect = wrapper.getBoundingClientRect();
    preview.style.left = `${Math.max(8, Math.min(rect.right + 12, window.innerWidth - preview.offsetWidth - 8))}px`;
    preview.style.top = `${Math.max(8, Math.min(rect.top, window.innerHeight - preview.offsetHeight - 8))}px`;
  }
  function open(wrapper) {
    const movie = movies.get(wrapper.dataset.posterId); if (!movie) return;
    hide(); opener = wrapper;
    document.querySelector('#movieDetailsContent').innerHTML = details(movie);
    dialog.showModal(); dialog.scrollTop = 0;
  }
  document.addEventListener('pointerover', event => {
    if (event.pointerType !== 'mouse' || !window.matchMedia('(min-width: 921px) and (hover: hover)').matches) return;
    const wrapper = event.target.closest('[data-poster-id]'); if (wrapper) show(wrapper);
  });
  document.addEventListener('pointerout', event => {
    if (event.pointerType === 'mouse' && event.target.closest('[data-poster-id]') && !anchor?.contains(event.relatedTarget) && !preview.contains(event.relatedTarget)) later();
  });
  document.addEventListener('click', event => {
    const wrapper = event.target.closest('[data-poster-id]');
    if (wrapper) { event.preventDefault(); open(wrapper); }
  });
  document.addEventListener('keydown', event => {
    const wrapper = event.target.closest('[data-poster-id]');
    if (wrapper && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open(wrapper); }
    if (event.key === 'Escape') hide();
  });
  dialog.querySelector('.movie-details-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { if (opener?.isConnected) opener.focus({preventScroll:true}); opener = null; });
  preview.addEventListener('pointerenter', () => clearTimeout(timer));
  preview.addEventListener('click', event => { if (event.target.tagName === 'IMG' && anchor) open(anchor); });
  preview.addEventListener('pointerleave', later);
  window.addEventListener('scroll', event => { if (event.target instanceof Node && preview.contains(event.target)) return; hide(); }, {passive:true,capture:true});
  window.addEventListener('resize', hide);
})();
