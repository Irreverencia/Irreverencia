(() => {
  const list = document.querySelector('#movieList'), preview = document.querySelector('#posterPreview');
  const movies = new Map(window.SITGES_PROGRAM.movies.map(m => [m.id, m]));
  let anchor = null, timer;
  const hide = () => { clearTimeout(timer); preview.hidden = true; anchor?.removeAttribute('aria-describedby'); anchor = null; };
  const later = () => { clearTimeout(timer); timer = setTimeout(hide, 150); };
  function show(wrapper) {
    const movie = movies.get(wrapper.dataset.posterId); if (!movie) return;
    clearTimeout(timer);
    if (anchor === wrapper && !preview.hidden) return;
    hide(); anchor = wrapper;
    const image = document.createElement('img');
    image.alt = `Póster de ${movie.title}`;
    if (movie.posterUrl) image.src = movie.posterUrl;
    else image.hidden = true;
    const copy = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = movie.title;
    const subtitle = document.createElement('p'); subtitle.className = 'poster-preview-meta'; subtitle.textContent = `${movie.duration || '—'} min · ${movie.sections.join(' · ')}`;
    const synopsis = document.createElement('p'); synopsis.textContent = movie.synopsis || 'Sinopsis no publicada por el festival.';
    const source = document.createElement('a'); source.textContent = 'Ficha y sinopsis oficial ↗'; source.href = movie.officialUrl; source.target = '_blank'; source.rel = 'noreferrer';
    const close = document.createElement('button'); close.type = 'button'; close.className = 'poster-preview-close'; close.textContent = '×'; close.setAttribute('aria-label', 'Cerrar póster y sinopsis'); close.addEventListener('click', hide);
    copy.append(title, subtitle, synopsis, source);
    preview.replaceChildren(close, image, copy);
    wrapper.setAttribute('aria-describedby', 'posterPreview');
    preview.hidden = false;
    const natural = wrapper.querySelector('img')?.naturalWidth || 291;
    preview.style.setProperty('--preview-poster-width', `${natural}px`);
    const rect = wrapper.getBoundingClientRect();
    const width = preview.offsetWidth, height = preview.offsetHeight;
    preview.style.left = `${Math.max(8, Math.min(rect.right + 12, window.innerWidth - width - 8))}px`;
    preview.style.top = `${Math.max(8, Math.min(rect.top, window.innerHeight - height - 8))}px`;
  }
  list.addEventListener('pointerover', e => { const wrapper = e.target.closest('[data-poster-id]'); if (wrapper) show(wrapper); });
  list.addEventListener('pointerout', e => { if (e.target.closest('[data-poster-id]') && !anchor?.contains(e.relatedTarget) && !preview.contains(e.relatedTarget)) later(); });
  list.addEventListener('focusin', e => { const wrapper = e.target.closest('[data-poster-id]'); if (wrapper) show(wrapper); });
  list.addEventListener('focusout', e => { if (!preview.contains(e.relatedTarget)) later(); });
  list.addEventListener('click', e => { const wrapper = e.target.closest('[data-poster-id]'); if (wrapper) { e.preventDefault(); show(wrapper); } });
  preview.addEventListener('pointerenter', () => clearTimeout(timer));
  preview.addEventListener('pointerleave', later);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  document.addEventListener('pointerdown', e => {
    if (!preview.hidden && !preview.contains(e.target) && !anchor?.contains(e.target)) hide();
  });
  window.addEventListener('scroll', event => {
    // On mobile the columns scroll independently; scrolling the synopsis itself must remain possible.
    if (event.target instanceof Node && preview.contains(event.target)) return;
    hide();
  }, { passive: true, capture: true });
  window.addEventListener('resize', hide);
})();
