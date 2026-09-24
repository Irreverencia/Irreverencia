(() => {
  const workspace = document.querySelector('.workspace');
  const buttons = ['#showMovies', '#showAgenda', '#showFestival', '#showPriorities'].map(selector => document.querySelector(selector));
  const desktopButtons = [...document.querySelectorAll('[data-desktop-panel]')];
  if (!workspace || buttons.some(button => !button)) return;
  const mobile = window.matchMedia('(max-width: 920px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let currentPanel = 0;
  const updateButtons = (index) => {
    currentPanel = index;
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    desktopButtons.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.desktopPanel) === (index < 2 ? 0 : index))));
    workspace.dataset.view = index < 2 ? 'planner' : index === 2 ? 'festival' : 'priorities';
    if (mobile.matches) buttons[index].scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    document.dispatchEvent(new CustomEvent('sitges:view', { detail: index }));
  };
  const showPanel = (index, animate = true) => {
    updateButtons(index);
    if (!mobile.matches) return;
    // Horizontal only: each column keeps its own vertical reading position.
    workspace.scrollTo({ left: index * workspace.clientWidth, behavior: animate && !reducedMotion.matches ? 'smooth' : 'instant' });
  };
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => showPanel(index));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const next = Math.max(0, Math.min(buttons.length - 1, currentPanel + (event.key === 'ArrowRight' ? 1 : -1)));
      showPanel(next); buttons[next].focus({ preventScroll: true });
    });
  });
  desktopButtons.forEach(button => button.addEventListener('click', () => showPanel(Number(button.dataset.desktopPanel), false)));
  workspace.addEventListener('scroll', () => {
    if (mobile.matches && workspace.clientWidth) updateButtons(Math.max(0, Math.min(buttons.length - 1, Math.round(workspace.scrollLeft / workspace.clientWidth))));
  }, { passive: true });
  window.addEventListener('resize', () => showPanel(currentPanel, false));
  mobile.addEventListener('change', () => {
    if (mobile.matches) showPanel(currentPanel, false);
    else { workspace.scrollLeft = 0; updateButtons(currentPanel); }
  });
})();
