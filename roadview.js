(() => {
  const toggle = document.getElementById('roadviewToggle');
  const panel = document.getElementById('roadviewPanel');
  const canvas = document.getElementById('roadviewCanvas');
  const status = document.getElementById('roadviewStatus');
  const closeButton = document.getElementById('roadviewClose');
  let generation = 0;
  let timer;
  let viewer;
  let onInit;

  function close() {
    generation++;
    clearTimeout(timer);
    if (viewer && onInit) kakao.maps.event.removeListener(viewer, 'init', onInit);
    viewer = null;
    onInit = null;
    canvas.replaceChildren();
    panel.hidden = true;
    panel.classList.remove('is-ready');
    panel.setAttribute('aria-busy', 'false');
    toggle.setAttribute('aria-pressed', 'false');
    toggle.setAttribute('aria-label', '로드뷰 열기');
    toggle.title = '로드뷰 열기';
    toggle.focus({ preventScroll: true });
  }

  function open() {
    const request = ++generation;
    const position = map.getCenter();
    panel.hidden = false;
    panel.setAttribute('aria-busy', 'true');
    toggle.setAttribute('aria-pressed', 'true');
    toggle.setAttribute('aria-label', '로드뷰 닫기');
    toggle.title = '로드뷰 닫기';
    status.textContent = '주변 로드뷰를 찾는 중…';
    function fail(message) {
      if (request !== generation) return;
      generation++; // Ignore callbacks arriving after a timeout or failure.
      clearTimeout(timer);
      panel.setAttribute('aria-busy', 'false');
      status.textContent = message;
    }
    timer = setTimeout(() => fail('로드뷰 연결이 지연되고 있습니다. 닫은 뒤 다시 시도해 주세요.'), 15000);
    try {
      const client = new kakao.maps.RoadviewClient();
      client.getNearestPanoId(position, 500, panoId => {
        if (request !== generation) return;
        if (!panoId) {
          fail('지도 중심 주변 500m 이내에 로드뷰가 없습니다. 지도를 이동한 뒤 다시 열어 주세요.');
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
          };
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

  toggle.addEventListener('click', () => panel.hidden ? open() : close());
  closeButton.addEventListener('click', close);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) close();
  });
  new ResizeObserver(() => {
    if (viewer && panel.classList.contains('is-ready')) viewer.relayout();
  }).observe(canvas);
})();
