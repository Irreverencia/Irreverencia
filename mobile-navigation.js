(() => {
  const workspace = document.querySelector('.workspace');
  const buttons = [document.querySelector('#showMovies'), document.querySelector('#showAgenda')];
  if (!workspace || buttons.some(button => !button)) return;
  const mobile = window.matchMedia('(max-width: 920px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let currentPanel = 0;
  const updateButtons = (index) => {
    currentPanel = index;
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  };
  const showPanel = (index, animate = true) => {
    if (!mobile.matches) return;
    updateButtons(index);
    // Horizontal only: each column keeps its own vertical reading position.
    workspace.scrollTo({ left: index * workspace.clientWidth, behavior: animate && !reducedMotion.matches ? 'smooth' : 'instant' });
  };
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => showPanel(index));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'ArrowRight' ? 1 : 0;
      showPanel(next); buttons[next].focus({ preventScroll: true });
    });
  });
  workspace.addEventListener('scroll', () => {
    if (mobile.matches && workspace.clientWidth) updateButtons(workspace.scrollLeft >= workspace.clientWidth / 2 ? 1 : 0);
  }, { passive: true });
  window.addEventListener('resize', () => showPanel(currentPanel, false));
  mobile.addEventListener('change', () => {
    if (mobile.matches) showPanel(currentPanel, false);
    else workspace.scrollLeft = 0;
  });
})();
