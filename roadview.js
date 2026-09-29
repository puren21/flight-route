(() => {
  const panel = document.getElementById('roadviewPanel');
  const canvas = document.getElementById('roadviewCanvas');
  const status = document.getElementById('roadviewStatus');
  const closeButton = document.getElementById('roadviewClose');
  const forwardButton = document.getElementById('roadviewForward');
  let forwardTimer;
  const coverageButton = document.getElementById('roadviewCoverageToggle');
  const coverageHint = document.getElementById('roadviewCoverageHint');
  const coverage = new kakao.maps.RoadviewOverlay();
  let coverageEnabled = false;
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
    clearTimeout(forwardTimer);
    forwardButton.disabled = true;
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

  function open(position = map.getCenter(), viewpoint, knownPanoId, radius = 500) {
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
      const showPanorama = panoId => {
        if (request !== generation) return;
        if (!panoId) {
          fail('선택한 위치 주변 ' + radius + 'm 이내에 로드뷰가 없습니다. 표시된 다른 도로를 눌러 주세요.');
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
            if (viewpoint) viewer.setViewpoint(viewpoint);
            forwardButton.disabled = false;
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
      };
      if (knownPanoId) showPanorama(knownPanoId);
      else client.getNearestPanoId(position, radius, showPanorama);
    } catch (error) {
      fail('로드뷰를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }

  forwardButton.addEventListener('click', () => {
    if (!viewer || forwardButton.disabled || !panel.classList.contains('is-ready')) return;
    const activeViewer = viewer, request = generation;
    const panoId = viewer.getPanoId(), position = viewer.getPosition();
    const viewpoint = viewer.getViewpoint();
    const radians = Math.PI / 180, bearing = viewpoint.pan * radians;
    const lat = position.getLat() * radians, lng = position.getLng() * radians;
    const distance = 50 / 6371000;
    const nextLat = Math.asin(Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(bearing));
    const nextLng = lng + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(lat), Math.cos(distance) - Math.sin(lat) * Math.sin(nextLat));
    const target = new kakao.maps.LatLng(nextLat / radians, nextLng / radians);
    forwardButton.disabled = true;
    status.textContent = '약 50m 앞의 로드뷰를 찾는 중…';
    let finished = false;
    function finish(message) {
      if (finished || request !== generation) return false;
      finished = true;
      clearTimeout(forwardTimer);
      forwardButton.disabled = false;
      status.textContent = message;
      clearTimeout(timer);
      timer = setTimeout(() => { if (request === generation) status.textContent = ''; }, 3500);
      return true;
    }
    forwardTimer = setTimeout(() => finish('연결이 지연됩니다. 다시 시도해 주세요.'), 10000);
    try {
      new kakao.maps.RoadviewClient().getNearestPanoId(target, 30, nextId => {
        if (finished || request !== generation) return;
        if (viewer !== activeViewer || viewer.getPanoId() !== panoId) { finish(''); return; }
        if (!nextId || nextId === panoId) {
          finish('앞쪽에 이동할 로드뷰가 없습니다. 방향을 바꾸거나 지도를 눌러 주세요.');
          return;
        }
        if (finish('')) open(target, viewpoint, nextId);
      });
    } catch (error) { finish('로드뷰를 찾지 못했습니다. 다시 시도해 주세요.'); }
  });

  coverageButton.addEventListener('click', () => {
    coverageEnabled = !coverageEnabled;
    coverage.setMap(coverageEnabled ? map : null);
    coverageButton.setAttribute('aria-pressed', String(coverageEnabled));
    const label = coverageEnabled ? '로드뷰 가능 도로 숨기기' : '로드뷰 가능 도로 표시';
    coverageButton.setAttribute('aria-label', label);
    coverageButton.title = label;
    coverageHint.hidden = !coverageEnabled;
  });

  window.openRoadviewAt = open;
  window.moveOpenRoadviewAt = position => {
    if (panel.hidden && !coverageEnabled) return false;
    open(position, undefined, undefined, coverageEnabled ? 50 : 500);
    return true;
  };
  kakao.maps.event.addListener(map, 'click', event => {
    window.moveOpenRoadviewAt(event.latLng);
  });

  const corners = panel.querySelectorAll('.roadview-corner');
  let drag;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  function viewportBounds() {
    const v = window.visualViewport;
    return { left: (v?.offsetLeft || 0) + 8, top: (v?.offsetTop || 0) + 72,
      right: (v?.offsetLeft || 0) + (v?.width || window.innerWidth) - 8,
      bottom: (v?.offsetTop || 0) + (v?.height || window.innerHeight) - 8 };
  }
  function setRect(left, top, right, bottom) {
    Object.assign(panel.style, { left: left + 'px', top: top + 'px',
      bottom: 'auto', width: (right - left) + 'px', height: (bottom - top) + 'px' });
  }
  function resizeCorner(rect, corner, dx, dy) {
    const v = viewportBounds();
    const minWidth = Math.min(240, v.right - v.left);
    const minHeight = Math.min(180, v.bottom - v.top);
    let { left, top, right, bottom } = rect;
    if (corner.includes('w')) left = clamp(left + dx, v.left, right - minWidth);
    else right = clamp(right + dx, left + minWidth, v.right);
    if (corner.includes('n')) top = clamp(top + dy, v.top, bottom - minHeight);
    else bottom = clamp(bottom + dy, top + minHeight, v.bottom);
    setRect(left, top, right, bottom);
  }
  corners.forEach(handle => {
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
        rect: panel.getBoundingClientRect(), corner: handle.dataset.corner };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      resizeCorner(drag.rect, drag.corner, event.clientX - drag.x, event.clientY - drag.y);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type =>
      handle.addEventListener(type, () => { drag = null; }));
    handle.addEventListener('keydown', event => {
      const delta = { ArrowRight: [24, 0], ArrowLeft: [-24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[event.key];
      if (!delta) return;
      event.preventDefault();
      resizeCorner(panel.getBoundingClientRect(), handle.dataset.corner, ...delta);
    });
  });
  function fitPanel() {
    if (panel.hidden) return;
    const rect = panel.getBoundingClientRect(), v = viewportBounds();
    const width = Math.min(rect.width, v.right - v.left);
    const height = Math.min(rect.height, v.bottom - v.top);
    const left = clamp(rect.left, v.left, v.right - width);
    const top = clamp(rect.top, v.top, v.bottom - height);
    setRect(left, top, left + width, top + height);
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
