(() => {
  const drawerRoot = document.querySelector('.mobile-toc-drawer');
  const drawer = document.querySelector('.mobile-toc-drawer > summary');
  const navCard = document.querySelector('.nav-rail .site-nav-card');
  const navList = navCard ? navCard.querySelector('.site-nav-list') : null;
  if (!drawerRoot || !drawer || !navCard || !navList) return;

  const root = document.documentElement;
  const mobileQuery = window.matchMedia('(max-width: 760px)');
  const overlayRoot = document.createElement('div');
  const navMount = { parent: navCard.parentNode, nextSibling: navCard.nextSibling };
  const drawerMount = { parent: drawerRoot.parentNode, nextSibling: drawerRoot.nextSibling };
  let frame = 0;
  let dragState = null;

  overlayRoot.className = 'mobile-overlay-root';

  const setOverlayLock = (x, y, scale) => {
    root.style.setProperty('--mobile-overlay-shift-x', `${Math.round(x)}px`);
    root.style.setProperty('--mobile-overlay-shift-y', `${Math.round(y)}px`);
    root.style.setProperty('--mobile-overlay-scale', `${scale}`);
  };

  const restoreNode = (node, mount) => {
    if (!mount.parent) return;
    if (mount.nextSibling && mount.nextSibling.parentNode === mount.parent) {
      mount.parent.insertBefore(node, mount.nextSibling);
      return;
    }
    mount.parent.appendChild(node);
  };

  const mountOverlayLayer = () => {
    if (overlayRoot.parentNode !== document.body) {
      document.body.appendChild(overlayRoot);
    }

    navCard.classList.add('is-overlay-layer');
    drawerRoot.classList.add('is-overlay-layer');

    if (navCard.parentNode !== overlayRoot) {
      overlayRoot.appendChild(navCard);
    }

    if (drawerRoot.parentNode !== overlayRoot) {
      overlayRoot.appendChild(drawerRoot);
    }
  };

  const unmountOverlayLayer = () => {
    navCard.classList.remove('is-overlay-layer');
    drawerRoot.classList.remove('is-overlay-layer');
    restoreNode(navCard, navMount);
    restoreNode(drawerRoot, drawerMount);
    if (overlayRoot.parentNode) {
      overlayRoot.remove();
    }
  };

  const syncOverlayLayer = () => {
    if (mobileQuery.matches) {
      mountOverlayLayer();
      return;
    }

    unmountOverlayLayer();
    setOverlayLock(0, 0, 1);
  };

  const updateAnchor = () => {
    frame = 0;

    const viewport = window.visualViewport;
    if (!mobileQuery.matches || !viewport) {
      setOverlayLock(0, 0, 1);
      return;
    }

    const layoutWidth = document.documentElement.clientWidth;
    const layoutHeight = document.documentElement.clientHeight;
    const shiftX = viewport.offsetLeft + viewport.width - layoutWidth;
    const shiftY = viewport.offsetTop + viewport.height - layoutHeight;
    const scale = viewport.scale && Number.isFinite(viewport.scale) ? 1 / viewport.scale : 1;

    setOverlayLock(shiftX, shiftY, scale);
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
    mobileQuery.addEventListener('change', () => {
      syncOverlayLayer();
      scheduleAnchorUpdate();
    });
  } else if (typeof mobileQuery.addListener === 'function') {
    mobileQuery.addListener(() => {
      syncOverlayLayer();
      scheduleAnchorUpdate();
    });
  }

  navList.addEventListener('pointerdown', (event) => {
    if (!mobileQuery.matches) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: navList.scrollLeft,
      moved: false,
    };

    navList.classList.add('is-dragging');
    try {
      navList.setPointerCapture(event.pointerId);
    } catch (error) {
      void error;
    }
  });

  navList.addEventListener('pointermove', (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    if (Math.abs(deltaX) > 6) {
      dragState.moved = true;
      navList.scrollLeft = dragState.startScrollLeft - deltaX;
      event.preventDefault();
    }
  });

  const releaseDrag = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    navList.classList.remove('is-dragging');
    try {
      navList.releasePointerCapture(event.pointerId);
    } catch (error) {
      void error;
    }
    window.setTimeout(() => {
      dragState = null;
    }, 0);
  };

  navList.addEventListener('pointerup', releaseDrag);
  navList.addEventListener('pointercancel', releaseDrag);
  navList.addEventListener('pointerleave', releaseDrag);

  navList.addEventListener('click', (event) => {
    if (!dragState || !dragState.moved) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  document.addEventListener('pointerdown', (event) => {
    if (!drawerRoot.open) return;
    if (drawerRoot.contains(event.target)) return;
    drawerRoot.open = false;
  });

  drawerRoot.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link) return;
    window.requestAnimationFrame(() => {
      drawerRoot.open = false;
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      drawerRoot.open = false;
    }
  });

  syncOverlayLayer();
  scheduleAnchorUpdate();
})();
