(() => {
  const panel = document.getElementById('roadviewPanel');
  const canvas = document.getElementById('roadviewCanvas');
  const status = document.getElementById('roadviewStatus');
  const closeButton = document.getElementById('roadviewClose');
  let generation = 0;
  let timer;
  let viewer;
  let onInit;
  let onPositionChanged;
  let locationOverlay;

  function removeLocation() {
    if (locationOverlay) locationOverlay.setMap(null);
    locationOverlay = null;
  }

  function syncLocation() {
    const position = viewer.getPosition();
    if (!position) return;
    if (!locationOverlay) {
      locationOverlay = new kakao.maps.CustomOverlay({
        position,
        content: '<div class="roadview-location" role="img" aria-label="현재 로드뷰 위치"><span>로드뷰 위치</span><i></i></div>',
        xAnchor: 0.5,
        yAnchor: 1,
        zIndex: 40
      });
    }
    locationOverlay.setPosition(position);
    locationOverlay.setMap(map);

    // Keep the location visible above the Roadview panel when it covers the pin.
    const bounds = mapElement.getBoundingClientRect();
    const panelBounds = panel.getBoundingClientRect();
    const point = map.getProjection().containerPointFromCoords(position);
    const x = bounds.left + point.x;
    const y = bounds.top + point.y;
    const covered = x >= panelBounds.left - 50 && x <= panelBounds.right + 50 &&
      y >= panelBounds.top - 16 && y <= panelBounds.bottom + 60;
    const outside = point.x < 50 || point.x > bounds.width - 50 ||
      point.y < 65 || point.y > bounds.height - 30;
    if (covered || outside) {
      const targetY = Math.max(70, Math.min(bounds.height / 2, (panelBounds.top - bounds.top) / 2));
      map.panBy(point.x - bounds.width / 2, point.y - targetY);
    }
  }

  function close() {
    generation++;
    clearTimeout(timer);
    if (viewer && onInit) kakao.maps.event.removeListener(viewer, 'init', onInit);
    if (viewer && onPositionChanged) kakao.maps.event.removeListener(viewer, 'position_changed', onPositionChanged);
    onPositionChanged = null;
    removeLocation();
    viewer = null;
    onInit = null;
    canvas.replaceChildren();
    panel.hidden = true;
    panel.classList.remove('is-ready');
    panel.setAttribute('aria-busy', 'false');
  }

  function open(position = map.getCenter()) {
    if (!panel.hidden) close();
    const request = ++generation;
    panel.hidden = false;
    fitPanel();
    panel.setAttribute('aria-busy', 'true');
    status.textContent = '주변 로드뷰를 찾는 중…';
    function fail(message) {
      if (request !== generation) return;
      generation++; // Ignore callbacks arriving after a timeout or failure.
      clearTimeout(timer);
      panel.setAttribute('aria-busy', 'false');
      status.textContent = message;
      removeLocation();
    }
    timer = setTimeout(() => fail('로드뷰 연결이 지연되고 있습니다. 닫은 뒤 다시 시도해 주세요.'), 15000);
    try {
      const client = new kakao.maps.RoadviewClient();
      client.getNearestPanoId(position, 500, panoId => {
        if (request !== generation) return;
        if (!panoId) {
          fail('선택한 위치 주변 500m 이내에 로드뷰가 없습니다. 다른 위치에서 다시 열어 주세요.');
          return;
        }
        try {
          viewer = new kakao.maps.Roadview(canvas);
          onInit = () => {
            if (request !== generation) return;
            clearTimeout(timer);
            status.textContent = '';
            panel.setAttribute('aria-busy', 'false');
            panel.classList.add('is-ready');
            viewer.relayout();
            syncLocation();
          };
          onPositionChanged = () => {
            if (request === generation && panel.classList.contains('is-ready')) syncLocation();
          };
          kakao.maps.event.addListener(viewer, 'position_changed', onPositionChanged);
          kakao.maps.event.addListener(viewer, 'init', onInit);
          viewer.setPanoId(panoId, position);
        } catch (error) {
          fail('로드뷰를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
      });
    } catch (error) {
      fail('로드뷰를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }

  window.openRoadviewAt = open;
  window.moveOpenRoadviewAt = position => {
    if (panel.hidden) return false;
    open(position);
    return true;
  };
  kakao.maps.event.addListener(map, 'click', event => {
    window.moveOpenRoadviewAt(event.latLng);
  });

  const resizeHandle = document.getElementById('roadviewResize');
  let drag;
  function resize(width, height) {
    const rect = panel.getBoundingClientRect();
    const viewport = window.visualViewport;
    const right = viewport ? viewport.offsetLeft + viewport.width : window.innerWidth;
    const top = viewport ? viewport.offsetTop : 0;
    const maxWidth = Math.max(120, right - rect.left - 8);
    const maxHeight = Math.max(100, rect.bottom - top - 72);
    panel.style.width = Math.min(maxWidth, Math.max(Math.min(240, maxWidth), width)) + 'px';
    panel.style.height = Math.min(maxHeight, Math.max(Math.min(180, maxHeight), height)) + 'px';
  }
  resizeHandle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };
    resizeHandle.setPointerCapture(event.pointerId);
  });
  resizeHandle.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    resize(drag.width + event.clientX - drag.x, drag.height - event.clientY + drag.y);
  });
  function endResize() { drag = null; }
  resizeHandle.addEventListener('pointerup', endResize);
  resizeHandle.addEventListener('pointercancel', endResize);
  resizeHandle.addEventListener('lostpointercapture', endResize);
  resizeHandle.addEventListener('keydown', event => {
    const delta = { ArrowRight: [24, 0], ArrowLeft: [-24, 0], ArrowUp: [0, 24], ArrowDown: [0, -24] }[event.key];
    if (!delta) return;
    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    resize(rect.width + delta[0], rect.height + delta[1]);
  });
  function fitPanel() {
    if (panel.hidden) return;
    const rect = panel.getBoundingClientRect();
    resize(rect.width, rect.height);
  }
  window.addEventListener('resize', fitPanel);
  window.visualViewport?.addEventListener('resize', fitPanel);

  closeButton.addEventListener('click', close);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) close();
  });
  new ResizeObserver(() => {
    if (viewer && panel.classList.contains('is-ready')) viewer.relayout();
  }).observe(canvas);
})();
