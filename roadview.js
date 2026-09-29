(() => {
  const panel = document.getElementById('roadviewPanel');
  const canvas = document.getElementById('roadviewCanvas');
  const status = document.getElementById('roadviewStatus');
  const closeButton = document.getElementById('roadviewClose');
  let moveTimer;
  let moveSequence = 0;
  let previousPosition;
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
  let locationElement;
  let onViewpointChanged;

  function removeLocation() {
    if (locationOverlay) locationOverlay.setMap(null);
    locationOverlay = null;
    locationElement = null;
  }

  function syncDirection() {
    if (!viewer || !locationElement) return;
    const pan = viewer.getViewpoint().pan;
    if (!Number.isFinite(pan)) return;
    const heading = ((pan % 360) + 360) % 360;
    locationElement.style.setProperty('--roadview-heading', heading + 'deg');
    locationElement.setAttribute('aria-label', '로드뷰 위치, 북쪽 기준 시계 방향 ' + Math.round(heading) + '도, 선택하면 약 50m 이동');
  }

  function syncLocation() {
    const position = viewer.getPosition();
    if (!position) return;
    if (!locationOverlay) {
      locationElement = document.createElement('div');
      locationElement.className = 'roadview-location';
      locationElement.setAttribute('role', 'button');
      locationElement.tabIndex = 0;
      locationElement.title = '이 방향으로 약 50m 이동';
      locationElement.addEventListener('click', event => {
        event.stopPropagation();
        kakao.maps.event.preventMap();
        move50(viewer.getPosition(), viewer.getViewpoint().pan);
      });
      locationElement.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        move50(viewer.getPosition(), viewer.getViewpoint().pan);
      });
      locationElement.innerHTML = '<svg class="roadview-direction" viewBox="0 0 120 120" aria-hidden="true">' +
        '<circle cx="60" cy="60" r="54" fill="#fee500" fill-opacity=".13" stroke="#d3c700" stroke-opacity=".45"/>' +
        '<g class="roadview-heading"><path d="M60 60L21.8 21.8A54 54 0 0 1 98.2 21.8Z" fill="#ffe600" fill-opacity=".65" stroke="#e6ce00" stroke-width="1.5"/>' +
        '<path d="M60 11l-5 9h10Z" fill="#fff" stroke="#827600" stroke-width="1.5"/>' +
        '<circle cx="60" cy="60" r="15" fill="#fff" stroke="#39434c" stroke-width="2"/>' +
        '<ellipse cx="60" cy="48" rx="7" ry="5" fill="#39b7ff" stroke="#0075d8" stroke-width="2"/></g></svg>' +
        '<span class="roadview-location-label">로드뷰</span>';
      locationOverlay = new kakao.maps.CustomOverlay({
        position,
        content: locationElement,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 40
      });
    }
    locationOverlay.setPosition(position);
    locationOverlay.setMap(map);
    syncDirection();

    map.setCenter(position);
    // Keep the centered marker visible without offsetting the map center.
    const bounds = mapElement.getBoundingClientRect();
    const rect = panel.getBoundingClientRect();
    const cx = bounds.left + bounds.width / 2, cy = bounds.top + bounds.height / 2;
    if (rect.left < cx + 65 && rect.right > cx - 65 && rect.top < cy + 65 && rect.bottom > cy - 65) {
      const bottom = Math.min(rect.bottom, bounds.bottom - 8);
      const height = Math.min(rect.height, bottom - cy - 65);
      if (height >= 120) setRect(rect.left, bottom - height, rect.right, bottom);
    }
  }

  function close() {
    generation++;
    clearTimeout(moveTimer);
    moveSequence++;
    previousPosition = null;
    clearTimeout(timer);
    if (viewer && onInit) kakao.maps.event.removeListener(viewer, 'init', onInit);
    if (viewer && onPositionChanged) kakao.maps.event.removeListener(viewer, 'position_changed', onPositionChanged);
    if (viewer && onViewpointChanged) kakao.maps.event.removeListener(viewer, 'viewpoint_changed', onViewpointChanged);
    onViewpointChanged = null;
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
            previousPosition = viewer.getPosition();
            viewer.relayout();
            syncLocation();
          };
          onPositionChanged = () => {
            if (request !== generation || !panel.classList.contains('is-ready')) return;
            const from = previousPosition, to = viewer.getPosition();
            previousPosition = to;
            syncLocation();
            if (!from || !to) return;
            const step = movement(from, to);
            // Native arrows choose the road direction; extend short steps only.
            if (step.distance > 1 && step.distance < 45) move50(from, step.bearing);
          };
          onViewpointChanged = () => {
            if (request === generation && panel.classList.contains('is-ready')) syncDirection();
          };
          kakao.maps.event.addListener(viewer, 'viewpoint_changed', onViewpointChanged);
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

  function movement(from, to) {
    const r = Math.PI / 180;
    const lat1 = from.getLat() * r, lat2 = to.getLat() * r;
    const dLat = lat2 - lat1, dLng = (to.getLng() - from.getLng()) * r;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return {
      distance: 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, a))),
      bearing: Math.atan2(Math.sin(dLng) * Math.cos(lat2),
        Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)) / r
    };
  }

  function move50(origin, heading) {
    if (!viewer || !panel.classList.contains('is-ready')) return;
    const activeViewer = viewer, request = generation, sequence = ++moveSequence;
    clearTimeout(moveTimer);
    const panoId = viewer.getPanoId(), viewpoint = viewer.getViewpoint();
    const radians = Math.PI / 180, bearing = heading * radians;
    const lat = origin.getLat() * radians, lng = origin.getLng() * radians;
    const distance = 50 / 6371000;
    const nextLat = Math.asin(Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(bearing));
    const nextLng = lng + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(lat), Math.cos(distance) - Math.sin(lat) * Math.sin(nextLat));
    const target = new kakao.maps.LatLng(nextLat / radians, nextLng / radians);
    status.textContent = '선택한 방향으로 이동 중…';
    let finished = false;
    function finish(message) {
      if (finished || request !== generation || sequence !== moveSequence) return false;
      finished = true;
      clearTimeout(moveTimer);
      status.textContent = message;
      clearTimeout(timer);
      timer = setTimeout(() => { if (request === generation && sequence === moveSequence) status.textContent = ''; }, 3500);
      return true;
    }
    moveTimer = setTimeout(() => finish('연결이 지연됩니다. 다시 시도해 주세요.'), 10000);
    try {
      new kakao.maps.RoadviewClient().getNearestPanoId(target, 20, nextId => {
        if (finished || request !== generation || sequence !== moveSequence) return;
        if (viewer !== activeViewer || viewer.getPanoId() !== panoId) { finish(''); return; }
        if (!nextId || nextId === panoId) {
          finish('약 50m 앞에 이동할 로드뷰가 없습니다. 현재 위치를 유지합니다.');
          return;
        }
        // Reopening establishes a new starting point, preventing chained jumps.
        if (finish('')) open(target, viewpoint, nextId);
      });
    } catch (error) { finish('로드뷰를 찾지 못했습니다. 다시 시도해 주세요.'); }
  }

  function refreshMapAfterCoverageOff() {
    // Kakao RoadviewOverlay can leave its coverage tiles visually cached until
    // the next map interaction. Preserve the current center and force a redraw
    // as soon as the coverage layer is detached.
    const center = map.getCenter();
    map.relayout();
    map.setCenter(center);
    requestAnimationFrame(() => {
      const nextCenter = map.getCenter();
      map.relayout();
      map.setCenter(nextCenter);
    });
  }

  coverageButton.addEventListener('click', () => {
    coverageEnabled = !coverageEnabled;
    coverage.setMap(coverageEnabled ? map : null);
    if (!coverageEnabled) refreshMapAfterCoverageOff();
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
