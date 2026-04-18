(() => {
  const drawer = document.querySelector('.mobile-toc-drawer > summary');
  if (!drawer) return;

  const root = document.documentElement;
  const mobileQuery = window.matchMedia('(max-width: 760px)');
  let frame = 0;

  const setShift = (x, y) => {
    root.style.setProperty('--mobile-toc-shift-x', `${Math.round(x)}px`);
    root.style.setProperty('--mobile-toc-shift-y', `${Math.round(y)}px`);
  };

  const updateAnchor = () => {
    frame = 0;

    const viewport = window.visualViewport;
    if (!mobileQuery.matches || !viewport) {
      setShift(0, 0);
      return;
    }

    const layoutWidth = document.documentElement.clientWidth;
    const layoutHeight = document.documentElement.clientHeight;
    const shiftX = viewport.offsetLeft + viewport.width - layoutWidth;
    const shiftY = viewport.offsetTop + viewport.height - layoutHeight;

    setShift(shiftX, shiftY);
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
