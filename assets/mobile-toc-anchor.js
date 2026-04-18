(() => {
  const drawer = document.querySelector('.mobile-toc-drawer > summary');
  if (!drawer) return;

  const root = document.documentElement;
  const mobileQuery = window.matchMedia('(max-width: 760px)');
  let frame = 0;

  const setViewportLock = (x, y, scale) => {
    root.style.setProperty('--mobile-toc-shift-x', `${Math.round(x)}px`);
    root.style.setProperty('--mobile-toc-shift-y', `${Math.round(y)}px`);
    root.style.setProperty('--mobile-toc-scale', `${scale}`);
  };

  const updateAnchor = () => {
    frame = 0;

    const viewport = window.visualViewport;
    if (!mobileQuery.matches || !viewport) {
      setViewportLock(0, 0, 1);
      return;
    }

    const layoutWidth = document.documentElement.clientWidth;
    const layoutHeight = document.documentElement.clientHeight;
    const shiftX = viewport.offsetLeft + viewport.width - layoutWidth;
    const shiftY = viewport.offsetTop + viewport.height - layoutHeight;
    const scale = viewport.scale && Number.isFinite(viewport.scale) ? 1 / viewport.scale : 1;

    setViewportLock(shiftX, shiftY, scale);
  };

  const scheduleAnchorUpdate = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(updateAnchor);
  };

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleAnchorUpdate, { passive: true });
    window.visualViewport.addEventListener('scroll', scheduleAnchorUpdate, { passive: true });
  }

  window.addEventListener('resize', scheduleAnchorUpdate, { passive: true });
  window.addEventListener('orientationchange', scheduleAnchorUpdate, { passive: true });
  window.addEventListener('pageshow', scheduleAnchorUpdate, { passive: true });

  if (typeof mobileQuery.addEventListener === 'function') {
    mobileQuery.addEventListener('change', scheduleAnchorUpdate);
  } else if (typeof mobileQuery.addListener === 'function') {
    mobileQuery.addListener(scheduleAnchorUpdate);
  }

  scheduleAnchorUpdate();
})();
