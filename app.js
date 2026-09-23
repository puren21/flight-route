const mapElement=document.getElementById('map');
mapElement.style.transform='none';
mapElement.style.transformOrigin='';
const map=new kakao.maps.Map(mapElement,{center:new kakao.maps.LatLng(35.16,126.84),level:8});
map.setCopyrightPosition(kakao.maps.CopyrightPosition.BOTTOMRIGHT, false);


let routePolylines=[],routeLabels=[],routeBounds=new kakao.maps.LatLngBounds(),currentMarker=null;
let locationWatchId=null;
let currentLocationLatLng=null;
let locationTrackingStarted=false;
let locationRecenterRequested=false;
let currentLocationMarkerEl=null;
let currentLocationHeadingEl=null;
let currentHeading=null;
let deviceHeading=null;
let lastMovementPosition=null;
let locationMoveAnimation=null;
let deviceOrientationListening=false;

const routeIndex=new Map();
let selectedRoute=null;
let routeSelectOverlay=null;
let routePopupOpenedAt=0;
let routePopupSuppressUntil=0;
const statusEl=document.getElementById('status');
const routeToggle={checked:true};
const routeStyle={weight:3,color:'#E53935',opacity:.9};
const offRouteStyle={weight:2,color:'#6F7F95',opacity:.5};
const ROUTE_STYLE_STORAGE_KEY='flightRouteLineStyleV1';
const LABEL_STYLE_STORAGE_KEY='flightRouteLabelStyleV1';
const labelStyle={size:13,color:'#0D47A1'};

try{
  const savedRouteStyle=JSON.parse(localStorage.getItem(ROUTE_STYLE_STORAGE_KEY)||'null');
  if(savedRouteStyle){
    const w=Number(savedRouteStyle.route?.weight);
    const c=String(savedRouteStyle.route?.color||'');
    const o=Number(savedRouteStyle.route?.opacity);
    const ow=Number(savedRouteStyle.off?.weight);
    const oc=String(savedRouteStyle.off?.color||'');
    const oo=Number(savedRouteStyle.off?.opacity);

    if(Number.isFinite(w) && w>=1 && w<=10) routeStyle.weight=w;
    if(/^#[0-9a-fA-F]{6}$/.test(c)) routeStyle.color=c;
    if(Number.isFinite(o) && o>=0.1 && o<=1) routeStyle.opacity=o;

    if(Number.isFinite(ow) && ow>=1 && ow<=10) offRouteStyle.weight=ow;
    if(/^#[0-9a-fA-F]{6}$/.test(oc)) offRouteStyle.color=oc;
    if(Number.isFinite(oo) && oo>=0.1 && oo<=1) offRouteStyle.opacity=oo;
  }
}catch(e){
  console.error('라인 설정 불러오기 오류',e);
}
try{
  const savedLabelStyle=JSON.parse(localStorage.getItem(LABEL_STYLE_STORAGE_KEY)||'null');
  if(savedLabelStyle){
    const savedSize=Number(savedLabelStyle.size);
    const savedColor=String(savedLabelStyle.color||'');
    if(Number.isFinite(savedSize) && savedSize>=8 && savedSize<=28) labelStyle.size=savedSize;
    if(/^#[0-9a-fA-F]{6}$/.test(savedColor)) labelStyle.color=savedColor;
  }
}catch(e){
  console.error('라벨 설정 불러오기 오류',e);
}
const controlPanel=document.getElementById('controlPanel');
const panelToggleBtn=document.getElementById('panelToggleBtn');
const mobileMenuLauncher=document.getElementById('mobileMenuLauncher');
const menuBackBtn=document.getElementById('menuBackBtn');
const panelTitle=document.getElementById('panelTitle');
const SETTINGS_TITLE_HTML=`<span class="settings-title-icon send-title-icon" aria-hidden="true">
        <svg viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="#2f80ff"/>
          <path d="M17.5 24H30.5M24.5 18L30.5 24L24.5 30" fill="none" stroke="#fff" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span><span class="settings-title-text">설정</span>`;
const menuHome=document.getElementById('menuHome');
const menuPages=[...document.querySelectorAll('.menu-page')];
const LAST_MENU_STORAGE_KEY='flightRouteLastMenuV1';
let lastMenuState={pageId:'',title:''};
try{
  lastMenuState=JSON.parse(localStorage.getItem(LAST_MENU_STORAGE_KEY)||'{}')||{};
}catch(e){
  lastMenuState={pageId:'',title:''};
}
const MEMO_STORAGE_KEY='flightRouteMemosV1';
const ROUTE_STATE_STORAGE_KEY='flightRouteStatesV1';
const ROUTE_STATE_CLOUD_KEY='__route_states__';
let savedRouteStates={};
try{
  savedRouteStates=JSON.parse(localStorage.getItem(ROUTE_STATE_STORAGE_KEY)||'{}')||{};
}catch(e){
  savedRouteStates={};
}
const SUPABASE_REST_URL='https://zdjuksmhtvhetzblczqq.supabase.co/rest/v1';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_Hlk_1ZOd_WF_Ijn6VM258w_3w8HFYN4';
const SUPABASE_HEADERS={
  'apikey':SUPABASE_PUBLISHABLE_KEY,
  'Content-Type':'application/json'
};

let krAirspaceEnabled=false;
let krAirspaceLoaded=false;
const krAirspaceOverlays={obstacle:[]};
const KR_AIRSPACE_SPECS={
  obstacle:{
    url:'./airspace/lt_c_aisobls.geojson',
    label:'장애물공역',
    color:'#6E6E6E',
    fillOpacity:.08,
    nameFields:['remarks_tx','name']
  }
};
let routeMemos={};
try{
  routeMemos=JSON.parse(localStorage.getItem(MEMO_STORAGE_KEY)||'{}')||{};
}catch(e){
  routeMemos={};
}

function ensureSettingsTitle(){
  if(panelTitle.querySelector('.settings-title-icon')) return;
  panelTitle.innerHTML=SETTINGS_TITLE_HTML;
}

function syncPanelToggle(){
  const collapsed=controlPanel.classList.contains('collapsed');
  if(collapsed) ensureSettingsTitle();
  panelToggleBtn.textContent=collapsed?'›':'‹';
  panelToggleBtn.setAttribute('aria-label',collapsed?'메뉴 펼치기':'메뉴 접기');
  document.body.classList.toggle('menu-open',!collapsed);
}
function toggleControlPanel(){
  const willOpen=controlPanel.classList.contains('collapsed');
  controlPanel.classList.toggle('collapsed');

  if(willOpen){
    const lastPageId=String(lastMenuState?.pageId||'');
    const lastTitle=String(lastMenuState?.title||'');
    const pageExists=lastPageId && document.getElementById(lastPageId);

    if(pageExists){
      openMenuPage(lastPageId,lastTitle||'설정');
    }else{
      showMenuHome();
    }
  }else{
    // 메뉴를 접을 때는 하위 메뉴 표시 상태만 해제하고
    // 마지막 메뉴 위치는 lastMenuState에 그대로 보존함.
    // 이렇게 해야 접힌 상태에서 항상 초기 '설정' 아이콘이 보임.
    controlPanel.classList.remove('detail-view');
    ensureSettingsTitle();
  }

  syncPanelToggle();
}

const panelResizeHandle=document.getElementById('panelResizeHandle');
if(panelResizeHandle){
  let resizingPanel=false;
  let resizeStartY=0;
  let resizeStartHeight=0;

  const stopPanelResize=e=>{
    if(!resizingPanel) return;
    resizingPanel=false;
    controlPanel.classList.remove('resizing');
    try{ panelResizeHandle.releasePointerCapture?.(e.pointerId); }catch(err){}
    e.preventDefault();
    e.stopPropagation();
  };

  panelResizeHandle.addEventListener('pointerdown',e=>{
    if(controlPanel.classList.contains('collapsed')) return;
    if(e.button!==undefined && e.button!==0) return;

    resizingPanel=true;
    resizeStartY=e.clientY;
    resizeStartHeight=controlPanel.getBoundingClientRect().height;
    controlPanel.classList.add('resizing');

    try{ panelResizeHandle.setPointerCapture?.(e.pointerId); }catch(err){}
    e.preventDefault();
    e.stopPropagation();
  });

  panelResizeHandle.addEventListener('pointermove',e=>{
    if(!resizingPanel) return;

    const panelRect=controlPanel.getBoundingClientRect();
    const minHeight=220;
    const maxHeight=Math.max(minHeight,window.innerHeight-panelRect.top-8);
    const nextHeight=Math.min(maxHeight,Math.max(minHeight,resizeStartHeight+(e.clientY-resizeStartY)));

    controlPanel.style.setProperty('--user-panel-height',Math.round(nextHeight)+'px');
    e.preventDefault();
    e.stopPropagation();
  });

  panelResizeHandle.addEventListener('pointerup',stopPanelResize);
  panelResizeHandle.addEventListener('pointercancel',stopPanelResize);
}

panelToggleBtn.addEventListener('click',e=>{
  e.stopPropagation();
  toggleControlPanel();
});

document.querySelector('.panel-header')?.addEventListener('click',e=>{
  if(e.target.closest('#panelToggleBtn')) return;

  // 접힌 상태의 초기 아이콘을 누르면 뒤로가기로 처리하지 않고
  // 마지막으로 보던 메뉴를 그대로 복원해서 열어야 함.
  if(controlPanel.classList.contains('collapsed')){
    toggleControlPanel();
    return;
  }

  // 펼쳐진 하위 메뉴에서는 상단 헤더 전체를 이전 메뉴 버튼처럼 사용함.
  if(controlPanel.classList.contains('detail-view')){
    const activePage=document.querySelector('.menu-page.active');
    const parentPage=activePage?.dataset.parentPage;
    const parentTitle=activePage?.dataset.parentTitle;

    if(parentPage){
      openMenuPage(parentPage,parentTitle||'스타일 설정');
    }else{
      showMenuHome();
    }
    return;
  }

  // 메인 메뉴에서는 기존처럼 헤더 클릭으로 열기/닫기함.
  if(e.target.closest('#menuBackBtn')) return;
  toggleControlPanel();
});

mobileMenuLauncher.addEventListener('click',()=>{
  toggleControlPanel();
});

function updateStablePanelWidth(){
  if(window.matchMedia('(max-width:700px)').matches){
    controlPanel.style.removeProperty('--stable-panel-width');
    return;
  }

  const wasCollapsed=controlPanel.classList.contains('collapsed');
  const wasDetail=controlPanel.classList.contains('detail-view');
  const previousHomeDisplay=menuHome.style.display;
  const previousActive=menuPages.map(page=>page.classList.contains('active'));

  controlPanel.classList.remove('collapsed');
  controlPanel.classList.remove('detail-view');
  controlPanel.style.setProperty('--stable-panel-width','320px');

  let maxWidth=320;

  menuHome.style.display='flex';
  menuPages.forEach(page=>page.classList.remove('active'));
  maxWidth=Math.max(maxWidth,Math.ceil(controlPanel.scrollWidth));

  menuHome.style.display='none';
  menuPages.forEach((page,index)=>{
    menuPages.forEach(p=>p.classList.remove('active'));
    page.classList.add('active');
    maxWidth=Math.max(maxWidth,Math.ceil(controlPanel.scrollWidth));
  });

  menuHome.style.display=previousHomeDisplay;
  menuPages.forEach((page,index)=>page.classList.toggle('active',previousActive[index]));
  controlPanel.classList.toggle('detail-view',wasDetail);
  controlPanel.classList.toggle('collapsed',wasCollapsed);

  maxWidth=Math.min(Math.max(maxWidth,320),420);
  controlPanel.style.setProperty('--stable-panel-width',maxWidth+'px');
}

function updateStablePanelHeight(){
  const isMobile=window.matchMedia('(max-width:700px)').matches;
  const wasCollapsed=controlPanel.classList.contains('collapsed');
  const wasDetail=controlPanel.classList.contains('detail-view');
  const previousHomeDisplay=menuHome.style.display;
  const previousActive=menuPages.map(page=>page.classList.contains('active'));
  const previousTitleHtml=panelTitle.innerHTML;

  controlPanel.classList.remove('collapsed');
  controlPanel.classList.remove('detail-view');
  controlPanel.style.removeProperty('--stable-panel-height');

  let maxHeight=0;

  menuHome.style.display='flex';
  menuPages.forEach(page=>page.classList.remove('active'));
  panelTitle.innerHTML=SETTINGS_TITLE_HTML;
  maxHeight=Math.max(maxHeight,Math.ceil(controlPanel.scrollHeight));

  menuHome.style.display='none';
  menuPages.forEach(page=>{
    menuPages.forEach(p=>p.classList.remove('active'));
    page.classList.add('active');
    controlPanel.classList.add('detail-view');
    maxHeight=Math.max(maxHeight,Math.ceil(controlPanel.scrollHeight));
  });

  menuHome.style.display=previousHomeDisplay;
  menuPages.forEach((page,index)=>page.classList.toggle('active',previousActive[index]));
  controlPanel.classList.toggle('detail-view',wasDetail);
  controlPanel.classList.toggle('collapsed',wasCollapsed);
  panelTitle.innerHTML=previousTitleHtml;

  const reducedHeight=Math.max(220,Math.ceil(maxHeight*(2/3)));
  controlPanel.style.setProperty('--stable-panel-height',reducedHeight+'px');
}

function showMenuHome(){
  controlPanel.classList.remove('detail-view');
  menuHome.style.display='flex';
  document.querySelectorAll('.menu-page').forEach(page=>page.classList.remove('active'));
  panelTitle.innerHTML=SETTINGS_TITLE_HTML;

  lastMenuState={pageId:'',title:''};
  try{
    localStorage.setItem(LAST_MENU_STORAGE_KEY,JSON.stringify(lastMenuState));
  }catch(e){}
}

function openMenuPage(pageId,title){
  menuHome.style.display='none';
  document.querySelectorAll('.menu-page').forEach(page=>{
    page.classList.toggle('active',page.id===pageId);
  });
  controlPanel.classList.add('detail-view');
  panelTitle.textContent=title;

  lastMenuState={pageId:String(pageId||''),title:String(title||'')};
  try{
    localStorage.setItem(LAST_MENU_STORAGE_KEY,JSON.stringify(lastMenuState));
  }catch(e){}
}

document.querySelectorAll('.ios-menu-row').forEach(row=>{
  row.addEventListener('click',e=>{
    e.stopPropagation();
    openMenuPage(row.dataset.page,row.dataset.title);
  });
});

menuBackBtn?.addEventListener('click',e=>{
  e.stopPropagation();
  const activePage=document.querySelector('.menu-page.active');
  const parentPage=activePage?.dataset.parentPage;
  const parentTitle=activePage?.dataset.parentTitle;
  if(parentPage){
    openMenuPage(parentPage,parentTitle||'스타일 설정');
    return;
  }
  showMenuHome();
});

document.addEventListener('pointerdown',event=>{
  if(controlPanel.classList.contains('collapsed')) return;

  const target=event.target;
  if(controlPanel.contains(target) || mobileMenuLauncher.contains(target)) return;

  // 바깥을 눌러 닫을 때 현재 하위 메뉴 위치를 확실히 기억함.
  const activePage=document.querySelector('.menu-page.active');
  if(controlPanel.classList.contains('detail-view') && activePage){
    lastMenuState={
      pageId:String(activePage.id||''),
      title:String(panelTitle.textContent||'')
    };
    try{
      localStorage.setItem(LAST_MENU_STORAGE_KEY,JSON.stringify(lastMenuState));
    }catch(e){}
  }

  // 화면만 접고 메뉴 위치는 그대로 보존함.
  // 접힌 상태에서는 하위 메뉴 헤더가 남지 않도록 초기 설정 아이콘으로 복원함.
  controlPanel.classList.remove('detail-view');
  ensureSettingsTitle();
  controlPanel.classList.add('collapsed');
  syncPanelToggle();
});




const geocoder=new kakao.maps.services.Geocoder();
let addressOverlay=null;

function setRouteState(routeLine,enabled,persist=true){
  routeLine._routeEnabled=enabled;

  if(persist && routeLine._routeNumber){
    savedRouteStates[routeLine._routeNumber]=enabled;
    localStorage.setItem(ROUTE_STATE_STORAGE_KEY,JSON.stringify(savedRouteStates));
    syncRemoteRouteStates().catch(console.error);
  }

  if(enabled){
    routeLine.setOptions({
      strokeWeight:routeStyle.weight,
      strokeColor:routeStyle.color,
      strokeOpacity:routeStyle.opacity
    });
    updateRouteOutline(routeLine,routeStyle.weight,routeStyle.opacity);
  }else{
    routeLine.setOptions({
      strokeWeight:offRouteStyle.weight,
      strokeColor:offRouteStyle.color,
      strokeOpacity:offRouteStyle.opacity
    });
    updateRouteOutline(routeLine,offRouteStyle.weight,offRouteStyle.opacity);
  }

  if(routeLine._labelOverlay){
    const showLabel=routeToggle.checked && map.getLevel()<=8;
    routeLine._labelOverlay.setMap(showLabel?map:null);
    if(routeLine._labelOverlay._labelElement){
      routeLine._labelOverlay._labelElement.style.opacity=
        enabled ? String(routeStyle.opacity) : String(offRouteStyle.opacity);
    }
  }
}

async function syncRemoteRouteStates(){
  const response=await fetch(
    SUPABASE_REST_URL+'/route_memos?on_conflict=route_number',
    {
      method:'POST',
      headers:{
        ...SUPABASE_HEADERS,
        'Prefer':'resolution=merge-duplicates,return=minimal'
      },
      body:JSON.stringify({
        route_number:ROUTE_STATE_CLOUD_KEY,
        memo:JSON.stringify(savedRouteStates),
        updated_at:new Date().toISOString()
      })
    }
  );
  if(!response.ok) throw new Error('경로 상태 동기화 실패 ('+response.status+')');
}

async function loadRemoteRouteStates(){
  try{
    const response=await fetch(
      SUPABASE_REST_URL+'/route_memos?route_number=eq.'+
        encodeURIComponent(ROUTE_STATE_CLOUD_KEY)+
        '&select=memo,updated_at',
      {headers:SUPABASE_HEADERS}
    );
    if(!response.ok) throw new Error('경로 상태 불러오기 실패 ('+response.status+')');
    const rows=await response.json();

    if(rows.length && rows[0].memo){
      try{
        savedRouteStates=JSON.parse(rows[0].memo)||{};
        localStorage.setItem(ROUTE_STATE_STORAGE_KEY,JSON.stringify(savedRouteStates));
      }catch(e){
        console.error('온라인 경로 상태 파싱 오류',e);
      }
    }else if(Object.keys(savedRouteStates).length){
      await syncRemoteRouteStates();
    }

    applySavedRouteStates();
  }catch(error){
    console.error(error);
    applySavedRouteStates();
  }
}

function applySavedRouteStates(){
  routePolylines.forEach(line=>{
    if(!line._routeNumber) return;
    const enabled=Object.prototype.hasOwnProperty.call(savedRouteStates,line._routeNumber)
      ? savedRouteStates[line._routeNumber]!==false
      : true;
    setRouteState(line,enabled,false);
  });
  updateRouteLabelVisibility();
}

async function resetRouteStates(){
  if(!confirm('모든 비행경로의 켜기·끄기 상태를 초기화하고 전부 켜시겠습니까?')) return;
  savedRouteStates={};
  localStorage.setItem(ROUTE_STATE_STORAGE_KEY,'{}');
  applySavedRouteStates();
  try{
    await syncRemoteRouteStates();
    statusEl.textContent='켜기·끄기 상태를 초기화했습니다.';
  }catch(error){
    console.error(error);
    statusEl.textContent='기기에서는 초기화했지만 온라인 동기화에 실패했습니다.';
  }
}

function persistRouteMemos(){
  localStorage.setItem(MEMO_STORAGE_KEY,JSON.stringify(routeMemos));
  renderMemoList();
}

async function loadRemoteMemos(){
  try{
    const response=await fetch(
      SUPABASE_REST_URL+'/route_memos?select=route_number,memo,updated_at',
      {headers:SUPABASE_HEADERS}
    );
    if(!response.ok) throw new Error('메모 불러오기 실패 ('+response.status+')');

    const rows=await response.json();
    const remote={};
    rows.forEach(row=>{
      if(row.route_number===ROUTE_STATE_CLOUD_KEY) return;
      if(row.route_number && row.memo){
        remote[String(row.route_number)]={
          memo:row.memo,
          updated:row.updated_at || ''
        };
      }
    });

    // 온라인 데이터를 기준으로 동기화함.
    // 서버에서 삭제된 메모를 다른 기기의 오래된 localStorage가 다시 살려내지 않도록
    // 원격에 없는 로컬 메모는 자동 재업로드하지 않음.
    const local={...routeMemos};
    const merged={...remote};
    const uploads=[];

    Object.keys(local).forEach(num=>{
      const localItem=local[num];
      const remoteItem=remote[num];
      if(!localItem?.memo || !remoteItem) return;

      const localTime=Date.parse(localItem.updated||'')||0;
      const remoteTime=Date.parse(remoteItem.updated||'')||0;

      // 같은 메모가 서버에도 존재하고 로컬 수정본이 더 최신인 경우에만 업로드함.
      if(localTime>remoteTime){
        merged[num]=localItem;
        uploads.push(upsertRemoteMemo(num,localItem.memo,localItem.updated||new Date().toISOString()));
      }
    });

    if(uploads.length) await Promise.allSettled(uploads);

    routeMemos=merged;
    persistRouteMemos();
    return true;
  }catch(error){
    console.error(error);
    renderMemoList();
    return false;
  }
}

async function upsertRemoteMemo(num,memo,updatedAt){
  const response=await fetch(
    SUPABASE_REST_URL+'/route_memos?on_conflict=route_number',
    {
      method:'POST',
      headers:{
        ...SUPABASE_HEADERS,
        'Prefer':'resolution=merge-duplicates,return=minimal'
      },
      body:JSON.stringify({
        route_number:String(num),
        memo:memo,
        updated_at:updatedAt || new Date().toISOString()
      })
    }
  );
  if(!response.ok){
    const detail=await response.text();
    throw new Error('메모 저장 실패 ('+response.status+'): '+detail);
  }
}

async function deleteRemoteMemo(num){
  const response=await fetch(
    SUPABASE_REST_URL+'/route_memos?route_number=eq.'+encodeURIComponent(String(num)),
    {
      method:'DELETE',
      headers:{
        ...SUPABASE_HEADERS,
        'Prefer':'return=minimal'
      }
    }
  );
  if(!response.ok){
    const detail=await response.text();
    throw new Error('메모 삭제 실패 ('+response.status+'): '+detail);
  }
}

let memoEditingRoute=null;
let memoEditingNumber='';

function openMemoEditor(routeLine){
  const num=routeLine?._routeNumber || '';
  openMemoEditorByNumber(num,routeLine);
}

function openMemoEditorByNumber(num,routeLine=null){
  num=String(num||'');
  if(!num){
    alert('번호가 없는 라인에는 메모를 저장할 수 없습니다.');
    return;
  }

  memoEditingRoute=routeLine;
  memoEditingNumber=num;
  const backdrop=document.getElementById('memoModalBackdrop');
  const title=document.getElementById('memoModalTitle');
  const textarea=document.getElementById('memoTextarea');

  title.textContent=num+'번 메모';
  textarea.value=routeMemos[num]?.memo || '';
  const modal=backdrop.querySelector('.memo-modal');
  if(modal){
    modal.style.position='';
    modal.style.left='';
    modal.style.top='';
    modal.style.margin='';
    modal.style.transform='';
  }
  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden','false');

  setTimeout(()=>{
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length,textarea.value.length);
  },50);
}

function closeMemoEditor(){
  const backdrop=document.getElementById('memoModalBackdrop');
  backdrop.classList.remove('open');
  backdrop.setAttribute('aria-hidden','true');
  memoEditingRoute=null;
  memoEditingNumber='';
}

async function saveCurrentMemo(){
  if(!memoEditingNumber) return;
  const num=memoEditingNumber;
  const memo=document.getElementById('memoTextarea').value.trim();
  const saveBtn=document.getElementById('memoSaveBtn');

  try{
    saveBtn.disabled=true;
    saveBtn.textContent='저장 중...';

    if(memo){
      const updated=new Date().toISOString();
      await upsertRemoteMemo(num,memo,updated);
      routeMemos[num]={memo:memo,updated:updated};
    }else{
      await deleteRemoteMemo(num);
      delete routeMemos[num];
    }

    persistRouteMemos();
    closeMemoEditor();
  }catch(error){
    console.error(error);
    alert('온라인 메모 저장에 실패했습니다.\n\n'+error.message);
  }finally{
    saveBtn.disabled=false;
    saveBtn.textContent='저장';
  }
}

async function deleteCurrentMemo(){
  if(!memoEditingNumber) return;
  const num=memoEditingNumber;
  const deleteBtn=document.getElementById('memoDeleteBtn');

  try{
    deleteBtn.disabled=true;
    deleteBtn.textContent='삭제 중...';
    await deleteRemoteMemo(num);
    delete routeMemos[num];
    persistRouteMemos();
    closeMemoEditor();
  }catch(error){
    console.error(error);
    alert('온라인 메모 삭제에 실패했습니다.\n\n'+error.message);
  }finally{
    deleteBtn.disabled=false;
    deleteBtn.textContent='삭제';
  }
}

document.getElementById('memoSaveBtn').addEventListener('click',saveCurrentMemo);
document.getElementById('memoDeleteBtn').addEventListener('click',deleteCurrentMemo);
document.getElementById('memoCancelBtn').addEventListener('click',closeMemoEditor);
document.getElementById('memoModalBackdrop').addEventListener('click',function(e){
  if(e.target===this) closeMemoEditor();
});

(function enableMemoModalDrag(){
  const modal=document.querySelector('.memo-modal');
  const handle=document.getElementById('memoModalTitle');
  if(!modal || !handle) return;

  let dragging=false;
  let startX=0, startY=0;
  let startLeft=0, startTop=0;

  const clamp=(v,min,max)=>Math.min(Math.max(v,min),max);

  handle.addEventListener('pointerdown',e=>{
    if(e.button!==undefined && e.button!==0) return;
    const rect=modal.getBoundingClientRect();

    modal.style.position='fixed';
    modal.style.left=rect.left+'px';
    modal.style.top=rect.top+'px';
    modal.style.margin='0';
    modal.style.transform='none';

    dragging=true;
    startX=e.clientX;
    startY=e.clientY;
    startLeft=rect.left;
    startTop=rect.top;

    try{ handle.setPointerCapture?.(e.pointerId); }catch(err){}
    e.preventDefault();
    e.stopPropagation();
  });

  handle.addEventListener('pointermove',e=>{
    if(!dragging) return;

    const maxLeft=Math.max(8,window.innerWidth-modal.offsetWidth-8);
    const maxTop=Math.max(8,window.innerHeight-modal.offsetHeight-8);

    const nextLeft=clamp(startLeft+(e.clientX-startX),8,maxLeft);
    const nextTop=clamp(startTop+(e.clientY-startY),8,maxTop);

    modal.style.left=nextLeft+'px';
    modal.style.top=nextTop+'px';
    e.preventDefault();
    e.stopPropagation();
  });

  const endDrag=e=>{
    if(!dragging) return;
    dragging=false;
    try{ handle.releasePointerCapture?.(e.pointerId); }catch(err){}
    e.stopPropagation();
  };

  handle.addEventListener('pointerup',endDrag);
  handle.addEventListener('pointercancel',endDrag);

  window.addEventListener('resize',()=>{
    if(getComputedStyle(modal).position!=='fixed') return;
    const rect=modal.getBoundingClientRect();
    const maxLeft=Math.max(8,window.innerWidth-modal.offsetWidth-8);
    const maxTop=Math.max(8,window.innerHeight-modal.offsetHeight-8);
    modal.style.left=clamp(rect.left,8,maxLeft)+'px';
    modal.style.top=clamp(rect.top,8,maxTop)+'px';
  });
})();

function showRouteProperties(routeLine){
  const num=routeLine._routeNumber || '번호 없음';
  const memo=routeMemos[routeLine._routeNumber]?.memo || '저장된 메모 없음';
  alert('번호: '+num+'\n\n메모:\n'+memo);
}

let memoDetailNumber='';

function normalizeMemoSortNumber(value){
  const text=String(value||'').replace(/^돌산_/,'').trim();
  const match=text.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function openMemoFromList(num){
  num=String(num||'');
  if(!num) return;

  memoDetailNumber=num;
  const title=document.getElementById('memoDetailNumber');
  const textarea=document.getElementById('memoDetailTextarea');

  if(title) title.textContent=num;
  if(textarea) textarea.value=routeMemos[num]?.memo || '';

  openMenuPage('memoDetailPage',num);

  setTimeout(()=>{
    textarea?.focus();
    const length=textarea?.value?.length || 0;
    textarea?.setSelectionRange(length,length);
  },60);
}

function closeMemoDetail(){
  memoDetailNumber='';
  openMenuPage('memoPage','메모');
}

async function saveMemoDetail(){
  if(!memoDetailNumber) return;

  const num=memoDetailNumber;
  const textarea=document.getElementById('memoDetailTextarea');
  const saveBtn=document.getElementById('memoDetailSaveBtn');
  const memo=(textarea?.value || '').trim();

  try{
    if(saveBtn){
      saveBtn.disabled=true;
      saveBtn.textContent='저장 중';
    }

    if(memo){
      const updated=new Date().toISOString();
      await upsertRemoteMemo(num,memo,updated);
      routeMemos[num]={memo:memo,updated:updated};
    }else{
      await deleteRemoteMemo(num);
      delete routeMemos[num];
    }

    persistRouteMemos();
    renderMemoList();
    closeMemoDetail();
  }catch(error){
    console.error(error);
    alert('온라인 메모 저장에 실패했습니다.\n\n'+error.message);
  }finally{
    if(saveBtn){
      saveBtn.disabled=false;
      saveBtn.textContent='저장';
    }
  }
}

async function deleteMemoDetail(){
  if(!memoDetailNumber) return;

  const num=memoDetailNumber;
  const deleteBtn=document.getElementById('memoDetailDeleteBtn');

  try{
    if(deleteBtn){
      deleteBtn.disabled=true;
      deleteBtn.textContent='삭제 중';
    }

    await deleteRemoteMemo(num);
    delete routeMemos[num];
    persistRouteMemos();
    renderMemoList();
    closeMemoDetail();
  }catch(error){
    console.error(error);
    alert('온라인 메모 삭제에 실패했습니다.\n\n'+error.message);
  }finally{
    if(deleteBtn){
      deleteBtn.disabled=false;
      deleteBtn.textContent='삭제';
    }
  }
}

document.getElementById('memoDetailCancelBtn')?.addEventListener('click',closeMemoDetail);
document.getElementById('memoDetailSaveBtn')?.addEventListener('click',saveMemoDetail);
document.getElementById('memoDetailDeleteBtn')?.addEventListener('click',deleteMemoDetail);

function normalizeRouteIdentity(value){
  let raw=String(value||'').trim();
  if(!raw) return '';

  const isDolsan=/^돌산_/i.test(raw);
  raw=raw.replace(/^돌산_/i,'');

  const parts=raw.split('_').filter(Boolean).map(part=>{
    const trimmed=part.trim();
    if(/^\d+$/.test(trimmed)) return String(Number(trimmed));
    return trimmed.toLowerCase();
  });

  if(!parts.length) return '';
  return (isDolsan?'돌산|':'일반|')+parts.join('|');
}

function routePrimaryIdentity(value){
  let raw=String(value||'').trim();
  if(!raw) return '';

  const isDolsan=/^돌산_/i.test(raw);
  raw=raw.replace(/^돌산_/i,'');

  const first=raw.split('_').filter(Boolean)[0] || '';
  if(!/^\d+$/.test(first)) return '';

  return (isDolsan?'돌산|':'일반|')+String(Number(first));
}

function resolveMemoRouteKeys(value){
  const raw=String(value||'').trim();
  if(!raw) return [];

  // 정확히 같은 키가 있으면 가장 우선함.
  if(routeIndex.has(raw)) return [raw];

  const fullIdentity=normalizeRouteIdentity(raw);
  const exactNormalized=[];

  for(const key of routeIndex.keys()){
    if(normalizeRouteIdentity(key)===fullIdentity){
      exactNormalized.push(String(key));
    }
  }
  if(exactNormalized.length) return exactNormalized;

  // 예: 메모가 027로 저장됐는데 실제 경로가
  // 027_00 / 027_01 / 027_02로 나뉘어 있으면 모두 선택함.
  const primary=routePrimaryIdentity(raw);
  if(!primary) return [];

  const primaryMatches=[];
  for(const key of routeIndex.keys()){
    if(routePrimaryIdentity(key)===primary){
      primaryMatches.push(String(key));
    }
  }

  return primaryMatches;
}

let memoRouteFocusTimer=null;

function focusMemoRoute(value){
  const keys=resolveMemoRouteKeys(value);
  if(!keys.length) return false;

  const bounds=new kakao.maps.LatLngBounds();
  let hasBounds=false;

  keys.forEach(key=>{
    const entry=routeIndex.get(key);
    if(!entry?.bounds) return;

    try{
      const sw=entry.bounds.getSouthWest?.();
      const ne=entry.bounds.getNorthEast?.();

      if(sw && ne){
        bounds.extend(sw);
        bounds.extend(ne);
        hasBounds=true;
      }
    }catch(e){
      console.error('메모 경로 범위 계산 오류',key,e);
    }
  });

  if(!hasBounds) return false;

  clearTimeout(memoRouteFocusTimer);

  try{
    map.setBounds(bounds);

    memoRouteFocusTimer=setTimeout(()=>{
      try{
        map.setLevel(Math.max(1,map.getLevel()-1));
      }catch(e){
        console.error('메모 경로 확대 오류',e);
      }
    },40);

    return true;
  }catch(e){
    console.error('메모 경로 이동 오류',e);
    return false;
  }
}

function renderMemoList(){
  const list=document.getElementById('memoList');
  if(!list) return;
  list.innerHTML='';

  const keys=Object.keys(routeMemos)
    .filter(num=>routeMemos[num]?.memo)
    .sort((a,b)=>{
      const na=normalizeMemoSortNumber(a);
      const nb=normalizeMemoSortNumber(b);

      if(na!==null && nb!==null){
        if(na!==nb) return na-nb;
        return String(a).localeCompare(String(b),'ko',{numeric:true});
      }
      if(na!==null) return -1;
      if(nb!==null) return 1;
      return String(a).localeCompare(String(b),'ko',{numeric:true});
    });

  if(keys.length===0){
    const empty=document.createElement('div');
    empty.className='memo-empty memo-settings-empty';
    empty.textContent='저장된 메모가 없습니다.';
    list.appendChild(empty);
    return;
  }

  keys.forEach(num=>{
    const row=document.createElement('button');
    row.type='button';
    row.className='memo-settings-row';
    row.setAttribute('aria-label',num+' 메모 열기 및 경로 위치로 이동');

    const left=document.createElement('span');
    left.className='memo-settings-left';

    const icon=document.createElement('span');
    icon.className='memo-note-icon';
    icon.setAttribute('aria-hidden','true');
    icon.innerHTML='<svg viewBox="0 0 29 29"><rect x="1" y="1" width="27" height="27" rx="6.5" fill="#fff"/><path d="M7.5 1h14A6.5 6.5 0 0 1 28 7.5V9H1V7.5A6.5 6.5 0 0 1 7.5 1Z" fill="#ffd60a"/><path d="M6 13.5h17M6 17.5h17M6 21.5h12" stroke="#c7c7cc" stroke-width="1.15" stroke-linecap="round"/></svg>';

    const label=document.createElement('span');
    label.className='memo-settings-label';
    label.textContent=num;

    const chevron=document.createElement('span');
    chevron.className='memo-settings-chevron';
    chevron.textContent='›';

    left.appendChild(icon);
    left.appendChild(label);
    row.appendChild(left);
    row.appendChild(chevron);

    row.addEventListener('click',()=>{
      // 메모 상세는 먼저 항상 열고, 지도 이동은 별도로 실행함.
      openMemoFromList(num);

      requestAnimationFrame(()=>{
        try{
          focusMemoRoute(num);
        }catch(e){
          console.error('메모 선택 경로 이동 오류',e);
        }
      });
    });

    list.appendChild(row);
  });
}

function closeRouteSelectPopup(){
  if(routeSelectOverlay){
    routeSelectOverlay.setMap(null);
    routeSelectOverlay=null;
  }
}

function showRouteSelectPopup(routeLine,position){
  closeRouteSelectPopup();

  const box=document.createElement('div');
  box.className='route-select-popup';

  const title=document.createElement('div');
  title.className='route-select-title';

  const titleNumber=document.createElement('span');
  titleNumber.className='route-select-title-number';
  titleNumber.textContent=routeLine._routeNumber || '번호 없음';

  const titleLength=document.createElement('span');
  titleLength.className='route-select-title-length';
  const routeLengthMeters=typeof routeLine.getLength==='function' ? routeLine.getLength() : 0;
  const routeLengthKm=routeLengthMeters/1000;
  titleLength.textContent=routeLengthKm>=10
    ? routeLengthKm.toFixed(1).replace(/\.0$/,'')+' km'
    : routeLengthKm.toFixed(2).replace(/0$/,'').replace(/\.0$/,'')+' km';

  title.appendChild(titleNumber);
  title.appendChild(titleLength);

  const actions=document.createElement('div');
  actions.className='route-select-actions';

  ['mousedown','mouseup','click','touchstart','touchend'].forEach(eventName=>{
    box.addEventListener(eventName,function(e){
      e.stopPropagation();
      kakao.maps.event.preventMap();
    },{passive:false});
  });

  const toggleRow=document.createElement('div');
  toggleRow.className='route-menu-row';

  const toggleLabel=document.createElement('span');
  toggleLabel.className='route-menu-label';
  toggleLabel.textContent='경로표시';

  const toggleSwitch=document.createElement('button');
  toggleSwitch.className='route-toggle-switch';
  toggleSwitch.type='button';

  const syncToggleState=()=>{
    const enabled=routeLine._routeEnabled!==false;
    toggleSwitch.classList.toggle('on',enabled);
    toggleSwitch.setAttribute('aria-pressed',enabled?'true':'false');
    toggleSwitch.setAttribute('aria-label',enabled?'경로 끄기':'경로 켜기');
  };
  syncToggleState();

  const toggleRoute=function(e){
    if(e){ e.preventDefault(); e.stopPropagation(); }
    setRouteState(routeLine,routeLine._routeEnabled===false);
    syncToggleState();
  };
  toggleSwitch.addEventListener('click',toggleRoute);

  toggleRow.appendChild(toggleLabel);
  toggleRow.appendChild(toggleSwitch);

  const memoBtn=document.createElement('button');
  memoBtn.className='route-menu-row route-memo-btn';
  memoBtn.type='button';

  const memoLabel=document.createElement('span');
  memoLabel.className='route-menu-label';
  memoLabel.textContent='메모추가';

  const memoChevron=document.createElement('span');
  memoChevron.className='route-menu-chevron';
  memoChevron.textContent='›';

  memoBtn.appendChild(memoLabel);
  memoBtn.appendChild(memoChevron);

  const memoEditor=document.createElement('div');
  memoEditor.className='route-inline-memo';

  const memoTextarea=document.createElement('textarea');
  memoTextarea.className='route-inline-memo-textarea';
  memoTextarea.placeholder='메모를 입력하세요';
  memoTextarea.value=routeMemos[routeLine._routeNumber]?.memo || '';

  const memoActions=document.createElement('div');
  memoActions.className='route-inline-memo-actions';

  const memoCancel=document.createElement('button');
  memoCancel.type='button';
  memoCancel.className='route-inline-memo-cancel';
  memoCancel.textContent='취소';

  const memoDelete=document.createElement('button');
  memoDelete.type='button';
  memoDelete.className='route-inline-memo-delete';
  memoDelete.textContent='삭제';

  const memoSave=document.createElement('button');
  memoSave.type='button';
  memoSave.className='route-inline-memo-save';
  memoSave.textContent='저장';

  memoActions.appendChild(memoCancel);
  memoActions.appendChild(memoDelete);
  memoActions.appendChild(memoSave);
  memoEditor.appendChild(memoTextarea);
  memoEditor.appendChild(memoActions);

  const setInlineMemoOpen=open=>{
    memoEditor.classList.toggle('open',open);
    memoBtn.classList.toggle('memo-open',open);
    memoChevron.textContent=open?'⌄':'›';
    if(open){
      memoTextarea.value=routeMemos[routeLine._routeNumber]?.memo || '';
      setTimeout(()=>{
        memoTextarea.focus();
        memoTextarea.setSelectionRange(memoTextarea.value.length,memoTextarea.value.length);
      },60);
    }
  };

  memoBtn.addEventListener('click',e=>{
    e.preventDefault();
    e.stopPropagation();
    setInlineMemoOpen(!memoEditor.classList.contains('open'));
  });

  memoCancel.addEventListener('click',e=>{
    e.preventDefault();
    e.stopPropagation();
    setInlineMemoOpen(false);
  });

  memoSave.addEventListener('click',async e=>{
    e.preventDefault();
    e.stopPropagation();
    const num=routeLine._routeNumber || '';
    if(!num) return;
    const memo=memoTextarea.value.trim();

    try{
      memoSave.disabled=true;
      memoSave.textContent='저장 중';
      if(memo){
        const updated=new Date().toISOString();
        await upsertRemoteMemo(num,memo,updated);
        routeMemos[num]={memo:memo,updated:updated};
      }else{
        await deleteRemoteMemo(num);
        delete routeMemos[num];
      }
      persistRouteMemos();
      setInlineMemoOpen(false);
    }catch(error){
      console.error(error);
      alert('온라인 메모 저장에 실패했습니다.\n\n'+error.message);
    }finally{
      memoSave.disabled=false;
      memoSave.textContent='저장';
    }
  });

  memoDelete.addEventListener('click',async e=>{
    e.preventDefault();
    e.stopPropagation();
    const num=routeLine._routeNumber || '';
    if(!num) return;

    try{
      memoDelete.disabled=true;
      memoDelete.textContent='삭제 중';
      await deleteRemoteMemo(num);
      delete routeMemos[num];
      persistRouteMemos();
      memoTextarea.value='';
      setInlineMemoOpen(false);
    }catch(error){
      console.error(error);
      alert('온라인 메모 삭제에 실패했습니다.\n\n'+error.message);
    }finally{
      memoDelete.disabled=false;
      memoDelete.textContent='삭제';
    }
  });

  actions.appendChild(toggleRow);
  actions.appendChild(memoBtn);
  actions.appendChild(memoEditor);

  box.appendChild(title);
  box.appendChild(actions);

  routePopupOpenedAt=Date.now();
  routeSelectOverlay=new kakao.maps.CustomOverlay({
    map:map,
    position:position,
    content:box,
    clickable:true,
    xAnchor:0.5,
    yAnchor:1.32,
    zIndex:40
  });

  // 상단 노선번호 영역을 드래그하면 팝업 위치를 지도 위에서 이동함.
  let popupDragPointerId=null;
  let popupDragStartX=0;
  let popupDragStartY=0;
  let popupDragStartPoint=null;

  const stopPopupDrag=()=>{
    popupDragPointerId=null;
    popupDragStartPoint=null;
  };

  title.addEventListener('pointerdown',e=>{
    if(e.button!==undefined && e.button!==0) return;
    if(!routeSelectOverlay) return;

    e.preventDefault();
    e.stopPropagation();
    kakao.maps.event.preventMap();

    box.style.pointerEvents='auto';

    const projection=map.getProjection();
    const overlayPosition=routeSelectOverlay.getPosition();
    popupDragStartPoint=projection.containerPointFromCoords(overlayPosition);
    popupDragPointerId=e.pointerId;
    popupDragStartX=e.clientX;
    popupDragStartY=e.clientY;

    try{ title.setPointerCapture(e.pointerId); }catch(err){}
  });

  title.addEventListener('pointermove',e=>{
    if(popupDragPointerId===null || e.pointerId!==popupDragPointerId || !popupDragStartPoint || !routeSelectOverlay) return;

    e.preventDefault();
    e.stopPropagation();
    kakao.maps.event.preventMap();

    const projection=map.getProjection();
    const nextPoint=new kakao.maps.Point(
      popupDragStartPoint.x+(e.clientX-popupDragStartX),
      popupDragStartPoint.y+(e.clientY-popupDragStartY)
    );
    routeSelectOverlay.setPosition(projection.coordsFromContainerPoint(nextPoint));
  });

  title.addEventListener('pointerup',e=>{
    if(popupDragPointerId!==e.pointerId) return;
    try{ title.releasePointerCapture(e.pointerId); }catch(err){}
    stopPopupDrag();
  });

  title.addEventListener('pointercancel',stopPopupDrag);
}

function isMobileRouteDevice(){
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints>1 && /Macintosh/i.test(navigator.userAgent));
}

let kakaoNaviSdkPromise=null;

function ensureKakaoNaviSdk(){
  if(window.Kakao) return Promise.resolve(window.Kakao);
  if(kakaoNaviSdkPromise) return kakaoNaviSdkPromise;

  kakaoNaviSdkPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js';
    script.crossOrigin='anonymous';
    script.async=true;
    script.onload=()=>window.Kakao ? resolve(window.Kakao) : reject(new Error('카카오 JavaScript SDK 초기화 실패'));
    script.onerror=()=>reject(new Error('카카오 JavaScript SDK 로딩 실패'));
    document.head.appendChild(script);
  }).catch(error=>{
    kakaoNaviSdkPromise=null;
    throw error;
  });

  return kakaoNaviSdkPromise;
}

async function startKakaoNavi(name,lat,lng){
  const rawName=name || '선택 위치';
  const destinationName=encodeURIComponent(rawName);
  const webUrl='https://map.kakao.com/link/to/'+destinationName+','+lat+','+lng;

  if(isMobileRouteDevice()){
    try{
      const KakaoSdk=await ensureKakaoNaviSdk();

      if(!KakaoSdk.isInitialized()){
        KakaoSdk.init('7ee4bab8cd4d6be6d0d68a49e9b4502b');
      }

      if(!KakaoSdk.Navi || typeof KakaoSdk.Navi.start!=='function'){
        throw new Error('카카오내비 모듈을 사용할 수 없습니다.');
      }

      KakaoSdk.Navi.start({
        name:rawName,
        x:Number(lng),
        y:Number(lat),
        coordType:'wgs84'
      });
    }catch(error){
      console.error('카카오내비 실행 오류',error);
      alert('카카오내비 앱을 실행하지 못했습니다.\n'+(error?.message||''));
    }
    return;
  }

  window.open(webUrl,'_blank','noopener,noreferrer');
}

function wgs84ToWebMercator(lat,lng){
  const x=lng*20037508.34/180;
  let y=Math.log(Math.tan((90+lat)*Math.PI/360))/(Math.PI/180);
  y=y*20037508.34/180;
  return {x:x,y:y};
}

function startNaverMapRoute(name,lat,lng){
  const rawName=name || '선택 위치';
  const destinationName=encodeURIComponent(rawName);
  const appName=encodeURIComponent(window.location.origin + window.location.pathname);

  if(isMobileRouteDevice()){
    const appUrl='nmap://route/car?dlat='+lat+
      '&dlng='+lng+
      '&dname='+destinationName+
      '&appname='+appName;

    // 모바일에서는 현재 사이트를 유지한 채 네이버지도 앱만 호출함.
    // 네이버 웹 길찾기로 자동 전환하지 않음.
    window.location.href=appUrl;
    return;
  }

  const p=wgs84ToWebMercator(lat,lng);
  const webUrl='https://map.naver.com/p/directions/-/'+
    p.x+','+p.y+','+destinationName+',,ADDRESS_POI/-/car';
  window.open(webUrl,'_blank','noopener,noreferrer');
}

function showAddressPopup(latLng){
  const lat=latLng.getLat();
  const lng=latLng.getLng();

  geocoder.coord2Address(lng,lat,function(result,status){
    let jibun='지번 정보를 찾을 수 없습니다.';

    if(status===kakao.maps.services.Status.OK && result && result[0]){
      if(result[0].address && result[0].address.address_name){
        jibun=result[0].address.address_name;
      }else if(result[0].road_address && result[0].road_address.address_name){
        jibun=result[0].road_address.address_name;
      }
    }

    if(addressOverlay){
      addressOverlay.setMap(null);
      addressOverlay=null;
    }

    const box=document.createElement('div');
    box.className='address-popup';

    ['pointerdown','pointerup','mousedown','mouseup','click','touchstart','touchend'].forEach(eventName=>{
      box.addEventListener(eventName,e=>{
        e.stopPropagation();
        try{ kakao.maps.event.preventMap(); }catch(err){}
      },{passive:false});
    });

    const close=document.createElement('button');
    close.className='close-btn';
    close.type='button';
    close.textContent='×';

    const title=document.createElement('div');
    title.className='title';
    title.textContent='지번 정보';

    const addr=document.createElement('div');
    addr.className='addr';
    addr.textContent=jibun;

    const navi=document.createElement('button');
    navi.className='navi-btn';
    navi.type='button';
    navi.textContent='카카오 길찾기';
    navi.addEventListener('click',()=>startKakaoNavi(jibun,lat,lng));

    const naver=document.createElement('button');
    naver.className='naver-btn';
    naver.type='button';
    naver.textContent='네이버지도 길찾기';
    naver.addEventListener('click',()=>startNaverMapRoute(jibun,lat,lng));

    close.addEventListener('click',()=>{
      if(addressOverlay){
        addressOverlay.setMap(null);
        addressOverlay=null;
      }
    });

    box.appendChild(close);
    box.appendChild(title);
    box.appendChild(addr);
    const routeActions=document.createElement('div');
    routeActions.className='route-actions';
    routeActions.appendChild(naver);
    routeActions.appendChild(navi);
    box.appendChild(routeActions);

    addressOverlay=new kakao.maps.CustomOverlay({
      map:map,
      position:latLng,
      content:box,
      clickable:true,
      xAnchor:0.5,
      yAnchor:1.08,
      zIndex:30
    });
  });
}

kakao.maps.event.addListener(map,'click',function(){
  if(routeSelectOverlay && Date.now()-routePopupOpenedAt>250){
    closeRouteSelectPopup();
  }
  if(addressOverlay){
    addressOverlay.setMap(null);
    addressOverlay=null;
  }
});

kakao.maps.event.addListener(map,'rightclick',function(mouseEvent){
  // iPhone 길게 누르기는 지도 rightclick과 노선 click이 함께 발생할 수 있음.
  // 주소/길찾기 팝업을 우선하고, 같은 제스처에서 노선 팝업은 열리지 않도록 차단함.
  routePopupSuppressUntil=Date.now()+900;
  closeRouteSelectPopup();
  showAddressPopup(mouseEvent.latLng);
});

// 모바일 길게 누르기에서 Safari의 복사/찾아보기/번역 메뉴가 뜨지 않도록 기본 메뉴만 차단함.
mapElement.addEventListener('contextmenu',event=>{
  event.preventDefault();
},{passive:false});
mapElement.addEventListener('selectstart',event=>{
  event.preventDefault();
},{passive:false});

// iOS Safari에서 지도 위를 길게 눌렀을 때 주변 라벨/텍스트가 선택되지 않도록 전체 지도 영역의 선택 동작을 차단함.
// 단, 입력창/버튼/링크 등 실제 조작 요소는 예외로 둠.
const isInteractiveMapTarget=target=>{
  if(!(target instanceof Element)) return false;
  return !!target.closest('input, textarea, select, button, a, [contenteditable="true"]');
};

['pointerdown','touchstart'].forEach(eventName=>{
  mapElement.addEventListener(eventName,event=>{
    if(isInteractiveMapTarget(event.target)) return;
    if(eventName==='touchstart' && event.touches && event.touches.length>1) return;
    const sel=window.getSelection?.();
    if(sel && !sel.isCollapsed) sel.removeAllRanges();
  },{capture:true,passive:true});
});

document.addEventListener('selectionchange',()=>{
  if(!window.matchMedia('(max-width:700px)').matches) return;
  const sel=window.getSelection?.();
  if(!sel || sel.isCollapsed || sel.rangeCount===0) return;
  const node=sel.anchorNode;
  const el=node?.nodeType===1 ? node : node?.parentElement;
  if(el && mapElement.contains(el) && !isInteractiveMapTarget(el)){
    sel.removeAllRanges();
  }
});

function niceScaleDistance(meters){
  const exponent=Math.pow(10,Math.floor(Math.log10(meters)));
  const fraction=meters/exponent;
  let niceFraction;
  if(fraction>=5) niceFraction=5;
  else if(fraction>=2) niceFraction=2;
  else niceFraction=1;
  return niceFraction*exponent;
}

function updateScaleBar(){
  const scaleBar=document.getElementById('scaleBar');
  const verticalScaleBar=document.getElementById('verticalScaleBar');
  if(!scaleBar && !verticalScaleBar) return;

  const projection=map.getProjection();
  if(!projection) return;

  const mapRect=mapElement.getBoundingClientRect();
  const center=map.getCenter();
  const centerPoint=projection.containerPointFromCoords(center);

  // 하단 가로 스케일
  if(scaleBar){
    const usableWidth=Math.max(80,mapRect.width-24);
    const halfWidth=usableWidth/2;
    const leftPoint=new kakao.maps.Point(centerPoint.x-halfWidth,centerPoint.y);
    const rightPoint=new kakao.maps.Point(centerPoint.x+halfWidth,centerPoint.y);
    const leftCoord=projection.coordsFromContainerPoint(leftPoint);
    const rightCoord=projection.coordsFromContainerPoint(rightPoint);
    const horizontalLine=new kakao.maps.Polyline({path:[leftCoord,rightCoord]});
    const horizontalMeters=horizontalLine.getLength();

    scaleBar.style.removeProperty('width');
    scaleBar.textContent=horizontalMeters>=1000
      ? (horizontalMeters/1000).toFixed(horizontalMeters>=10000?0:1).replace(/\.0$/,'')+' km'
      : Math.round(horizontalMeters)+' m';
  }

  // 우측 세로 스케일
  if(verticalScaleBar){
    const usableHeight=Math.max(120,mapRect.height-120);
    const halfHeight=usableHeight/2;
    const topPoint=new kakao.maps.Point(centerPoint.x,centerPoint.y-halfHeight);
    const bottomPoint=new kakao.maps.Point(centerPoint.x,centerPoint.y+halfHeight);
    const topCoord=projection.coordsFromContainerPoint(topPoint);
    const bottomCoord=projection.coordsFromContainerPoint(bottomPoint);
    const verticalLine=new kakao.maps.Polyline({path:[topCoord,bottomCoord]});
    const verticalMeters=verticalLine.getLength();

    verticalScaleBar.textContent=verticalMeters>=1000
      ? (verticalMeters/1000).toFixed(verticalMeters>=10000?0:1).replace(/\.0$/,'')+' km'
      : Math.round(verticalMeters)+' m';
  }
}

kakao.maps.event.addListener(map,'zoom_changed',updateScaleBar);
kakao.maps.event.addListener(map,'idle',updateScaleBar);

async function loadRoute(){
  try{
    const response=await fetch('./flight-route.geojson');
    if(!response.ok) throw new Error('GeoJSON 파일을 불러오지 못했습니다.');
    const geojson=await response.json();
    if(!geojson.features||!Array.isArray(geojson.features)) throw new Error('유효한 GeoJSON FeatureCollection이 아닙니다.');
    let lineCount=0;
    geojson.features.forEach(feature=>{
      if(!feature.geometry)return;
      const rawLabelNumber=feature.properties?.num ?? feature.properties?.num1 ?? '';
      // GeoJSON의 fid 129는 돌산 구간인데 num이 "025"로 잘못 들어가 있어
      // 일반 025와 멀리 떨어진 두 구간이 하나로 묶이는 문제가 발생함.
      const labelNumber=(
        Number(feature.properties?.fid)===129 &&
        String(rawLabelNumber)==='025'
      ) ? '돌산_025' : rawLabelNumber;
      if(feature.geometry.type==='LineString'){drawLineString(feature.geometry.coordinates,labelNumber);lineCount++;}
      if(feature.geometry.type==='MultiLineString'){feature.geometry.coordinates.forEach(coords=>{drawLineString(coords,labelNumber);lineCount++;});}
    });
    if(routePolylines.length>0){
      map.setBounds(routeBounds);
      const fittedLevel=map.getLevel();
      map.setLevel(Math.max(1,fittedLevel-1));
    }
    updateRouteLabelVisibility();
    populateRouteNumberMenu();
    statusEl.textContent='비행경로 '+lineCount+'개 선 표시 완료';
  }catch(error){console.error(error);statusEl.textContent='GeoJSON 로딩 오류: '+error.message;}
}
function smoothRoutePath(sourcePath,iterations=2,ratio=0.12){
  if(!Array.isArray(sourcePath) || sourcePath.length<3) return sourcePath;

  let points=sourcePath.slice();
  for(let pass=0;pass<iterations;pass++){
    const next=[points[0]];
    for(let i=0;i<points.length-1;i++){
      const a=points[i];
      const b=points[i+1];
      const alat=a.getLat(), alng=a.getLng();
      const blat=b.getLat(), blng=b.getLng();

      next.push(new kakao.maps.LatLng(
        alat+(blat-alat)*ratio,
        alng+(blng-alng)*ratio
      ));
      next.push(new kakao.maps.LatLng(
        blat-(blat-alat)*ratio,
        blng-(blng-alng)*ratio
      ));
    }
    next.push(points[points.length-1]);
    points=next;
  }
  return points;
}

function getRouteOutlineWeight(weight){
  return Math.max(Number(weight)+4,7);
}

function updateRouteOutline(routeLine,weight,opacity){
  if(!routeLine?._outlineLine) return;
  routeLine._outlineLine.setOptions({
    strokeWeight:getRouteOutlineWeight(weight),
    strokeColor:'#FFFFFF',
    strokeOpacity:Math.min(1,Math.max(.82,Number(opacity)||.9)),
    strokeStyle:'solid'
  });
}

function drawLineString(coordinates,labelNumber){
  const localBounds=new kakao.maps.LatLngBounds();
  const path=coordinates.map(coord=>{
    const latLng=new kakao.maps.LatLng(coord[1],coord[0]);
    routeBounds.extend(latLng);
    localBounds.extend(latLng);
    return latLng;
  });
  const displayPath=smoothRoutePath(path);

  // 위성지도에서도 잘 보이도록 기존 컬러선 아래에 더 두꺼운 흰색 바탕선을 겹쳐 그림.
  const outlineLine=new kakao.maps.Polyline({
    map:map,
    path:displayPath,
    strokeWeight:getRouteOutlineWeight(routeStyle.weight),
    strokeColor:'#FFFFFF',
    strokeOpacity:.95,
    strokeStyle:'solid',
    clickable:false,
    zIndex:4
  });

  const routeLine=new kakao.maps.Polyline({
    map:map,
    path:displayPath,
    strokeWeight:routeStyle.weight,
    strokeColor:routeStyle.color,
    strokeOpacity:routeStyle.opacity,
    strokeStyle:'solid',
    clickable:true,
    zIndex:5
  });

  routeLine._outlineLine=outlineLine;

  routeLine._routeNumber=labelNumber!=='' ? String(labelNumber) : '';
  const savedEnabled=routeLine._routeNumber &&
    Object.prototype.hasOwnProperty.call(savedRouteStates,routeLine._routeNumber)
      ? savedRouteStates[routeLine._routeNumber]!==false
      : true;
  routeLine._routeEnabled=savedEnabled;
  if(!savedEnabled){
    routeLine.setOptions({
      strokeWeight:offRouteStyle.weight,
      strokeColor:offRouteStyle.color,
      strokeOpacity:offRouteStyle.opacity
    });
    updateRouteOutline(routeLine,offRouteStyle.weight,offRouteStyle.opacity);
  }else{
    updateRouteOutline(routeLine,routeStyle.weight,routeStyle.opacity);
  }

  if(labelNumber!==''){
    const key=String(labelNumber);
    if(!routeIndex.has(key)){
      routeIndex.set(key,{
        bounds:new kakao.maps.LatLngBounds(),
        lines:[]
      });
    }
    const entry=routeIndex.get(key);
    path.forEach(p=>entry.bounds.extend(p));
    entry.lines.push(routeLine);
  }

  // 모바일에서도 쉽게 선택할 수 있도록 같은 경로에 넓은 투명 터치영역을 둠
  const hitLine=new kakao.maps.Polyline({
    map:map,
    path:displayPath,
    strokeWeight:24,
    strokeColor:'#000000',
    strokeOpacity:0.01,
    strokeStyle:'solid',
    clickable:true,
    zIndex:6
  });

  const openRouteMenu=function(mouseEvent){
    if(Date.now()<routePopupSuppressUntil) return;
    const pos=(mouseEvent && mouseEvent.latLng)
      ? mouseEvent.latLng
      : displayPath[Math.floor(displayPath.length/2)];
    showRouteSelectPopup(routeLine,pos);
  };

  kakao.maps.event.addListener(hitLine,'click',openRouteMenu);
  kakao.maps.event.addListener(routeLine,'click',openRouteMenu);

  routeLine._hitLine=hitLine;
  routePolylines.push(routeLine);

  if(labelNumber!=='' && coordinates.length>0){
    const midIndex=Math.floor((coordinates.length-1)/2);
    const mid=coordinates[midIndex];
    const label=document.createElement('div');
    label.className='route-label';
    label.textContent=labelNumber;
    label.style.fontSize=labelStyle.size+'px';
    label.style.color=labelStyle.color;

    const overlay=new kakao.maps.CustomOverlay({
      map:null,
      position:new kakao.maps.LatLng(mid[1],mid[0]),
      content:label,
      xAnchor:0.5,
      yAnchor:0.5,
      zIndex:10
    });

    overlay._labelElement=label;
    routeLine._labelOverlay=overlay;
    routeLabels.push(overlay);
    setRouteState(routeLine,savedEnabled,false);
    updateRouteLabelVisibility();
  }
}

let routeWheelNumbers=[];
let routeWheelSelected='';
let routeWheelScrollTimer=null;

function populateRouteNumberMenu(){
  const wheel=document.getElementById('routeNumberWheel');
  if(!wheel) return;

  const prefix=document.getElementById('routePrefixSelect')?.value || 'normal';

  routeWheelNumbers=[...routeIndex.keys()]
    .filter(num=>prefix==='dolsan'
      ? String(num).startsWith('돌산_')
      : !String(num).startsWith('돌산_'))
    .sort((a,b)=>{
      const normalizeNumber=value=>{
        const text=String(value).replace(/^돌산_/,'').trim();
        const numeric=parseInt(text,10);
        return Number.isNaN(numeric) ? null : numeric;
      };

      const na=normalizeNumber(a);
      const nb=normalizeNumber(b);

      // 1, 01, 001을 모두 같은 숫자 1로 판단해서 정렬함.
      if(na!==null && nb!==null){
        if(na!==nb) return na-nb;

        // 같은 숫자라면 표기 형식만 안정적으로 정리함.
        return String(a).localeCompare(String(b),'ko',{numeric:true});
      }

      if(na!==null) return -1;
      if(nb!==null) return 1;
      return String(a).localeCompare(String(b),'ko',{numeric:true});
    });

  wheel.innerHTML='';

  // iOS 휠처럼 첫/마지막 값도 중앙까지 올 수 있도록 위아래 여백을 둠.
  const topSpacer=document.createElement('div');
  topSpacer.className='route-wheel-spacer';
  wheel.appendChild(topSpacer);

  routeWheelNumbers.forEach(num=>{
    const item=document.createElement('button');
    item.type='button';
    item.className='route-wheel-item';
    item.dataset.value=num;
    item.setAttribute('role','option');
    item.textContent=String(num).startsWith('돌산_')
      ? String(num)
      : String(num).replace(/^0+(?=\d)/,'');
    item.addEventListener('click',()=>{
      scrollRouteWheelTo(num,true);
    });
    wheel.appendChild(item);
  });

  const bottomSpacer=document.createElement('div');
  bottomSpacer.className='route-wheel-spacer';
  wheel.appendChild(bottomSpacer);

  if(routeWheelNumbers.length){
    const initial=(routeWheelSelected && routeIndex.has(routeWheelSelected))
      ? routeWheelSelected
      : routeWheelNumbers[0];
    requestAnimationFrame(()=>scrollRouteWheelTo(initial,false));
  }
}

function focusRouteNumber(num){
  const entry=routeIndex.get(String(num));
  if(!entry) return;

  map.setBounds(entry.bounds);

  // 너무 멀리 보이지 않도록 한 단계 확대
  setTimeout(()=>{
    map.setLevel(Math.max(1,map.getLevel()-1));
  },0);
}

function routeWheelNearest(){
  const wheel=document.getElementById('routeNumberWheel');
  if(!wheel) return null;
  const center=wheel.scrollTop+wheel.clientHeight/2;
  let nearest=null;
  let nearestDist=Infinity;

  wheel.querySelectorAll('.route-wheel-item').forEach(item=>{
    const itemCenter=item.offsetTop+item.offsetHeight/2;
    const dist=Math.abs(itemCenter-center);
    if(dist<nearestDist){
      nearest=item;
      nearestDist=dist;
    }
  });
  return nearest;
}

function syncRouteWheelSelection(focusMap=true){
  const wheel=document.getElementById('routeNumberWheel');
  const item=routeWheelNearest();
  if(!wheel || !item) return;

  const num=item.dataset.value;
  const changed=routeWheelSelected!==num;
  routeWheelSelected=num;

  wheel.querySelectorAll('.route-wheel-item').forEach(el=>{
    const active=el===item;
    el.classList.toggle('active',active);
    el.setAttribute('aria-selected',active?'true':'false');
  });

  if(focusMap) focusRouteNumber(num);
}

function scrollRouteWheelTo(num,focusMap=true){
  const wheel=document.getElementById('routeNumberWheel');
  if(!wheel) return;
  const item=wheel.querySelector('.route-wheel-item[data-value="'+CSS.escape(String(num))+'"]');
  if(!item) return;

  const target=item.offsetTop-(wheel.clientHeight-item.offsetHeight)/2;
  wheel.scrollTo({top:target,behavior:focusMap?'smooth':'auto'});

  if(focusMap){
    clearTimeout(routeWheelScrollTimer);
    routeWheelScrollTimer=setTimeout(()=>syncRouteWheelSelection(true),500);
  }else{
    requestAnimationFrame(()=>syncRouteWheelSelection(false));
  }
}

document.getElementById('routeNumberWheel')?.addEventListener('scroll',()=>{
  clearTimeout(routeWheelScrollTimer);

  // 휠이 움직이는 동안에는 선택 표시만 갱신하고 지도는 이동하지 않음.
  syncRouteWheelSelection(false);

  // 스크롤이 완전히 멈춘 뒤 잠깐 여유를 두고 최종 선택 경로로 이동함.
  routeWheelScrollTimer=setTimeout(()=>{
    syncRouteWheelSelection(true);
  },500);
},{passive:true});

function normalizeRouteSearchValue(value){
  const raw=String(value||'').trim();
  if(!raw) return '';

  const prefix=document.getElementById('routePrefixSelect')?.value || 'normal';

  // 사용자가 전체 번호를 직접 넣은 경우도 우선 허용함.
  if(routeIndex.has(raw)) return raw;

  const numeric=Number(raw);
  if(Number.isNaN(numeric)) return '';

  if(prefix==='dolsan'){
    const dolsanCandidates=[
      '돌산_'+String(numeric),
      '돌산_'+String(numeric).padStart(2,'0'),
      '돌산_'+String(numeric).padStart(3,'0')
    ];
    for(const candidate of dolsanCandidates){
      if(routeIndex.has(candidate)) return candidate;
    }
    return '';
  }

  const candidates=[
    String(numeric),
    String(numeric).padStart(2,'0'),
    String(numeric).padStart(3,'0')
  ];
  for(const candidate of candidates){
    if(routeIndex.has(candidate)) return candidate;
  }

  return '';
}

function goToRouteFromInput(){
  const input=document.getElementById('routeNumberInput');
  if(!input) return;

  const num=normalizeRouteSearchValue(input.value);
  if(!num){
    input.classList.add('invalid');
    setTimeout(()=>input.classList.remove('invalid'),700);
    return;
  }

  input.classList.remove('invalid');
  input.value=num;
  scrollRouteWheelTo(num,false);

  clearTimeout(routeWheelScrollTimer);
  routeWheelScrollTimer=setTimeout(()=>{
    focusRouteNumber(num);
  },220);
}

let routeNumberInputTimer=null;

document.getElementById('routeNumberGoBtn')?.addEventListener('click',goToRouteFromInput);

document.getElementById('routeNumberInput')?.addEventListener('input',e=>{
  clearTimeout(routeNumberInputTimer);

  const input=e.currentTarget;
  const num=normalizeRouteSearchValue(input.value);

  if(!num){
    input.classList.remove('invalid');
    return;
  }

  input.classList.remove('invalid');

  // 유효한 경로번호가 입력된 뒤 0.5초 동안 추가 입력이 없으면 자동 이동함.
  routeNumberInputTimer=setTimeout(()=>{
    input.value=num;
    scrollRouteWheelTo(num,false);
    focusRouteNumber(num);
  },500);
});

document.getElementById('routeNumberInput')?.addEventListener('keydown',e=>{
  if(e.key==='Enter'){
    e.preventDefault();
    clearTimeout(routeNumberInputTimer);
    goToRouteFromInput();
    e.currentTarget.blur();
  }
});

document.getElementById('routePrefixSelect')?.addEventListener('change',()=>{
  clearTimeout(routeNumberInputTimer);

  // 구분을 바꾸면 아래 휠도 즉시 해당 그룹만 표시함.
  routeWheelSelected='';
  populateRouteNumberMenu();

  const input=document.getElementById('routeNumberInput');
  if(!input || !input.value.trim()) return;

  const num=normalizeRouteSearchValue(input.value);
  if(!num) return;

  routeNumberInputTimer=setTimeout(()=>{
    scrollRouteWheelTo(num,false);
    focusRouteNumber(num);
  },500);
});

function updateRouteLabelVisibility(){
  // 카카오 지도 level 값은 숫자가 클수록 더 멀리 축소된 상태임
  const showByScale=routeToggle.checked && map.getLevel()<=8;

  routePolylines.forEach(line=>{
    if(line._labelOverlay){
      line._labelOverlay.setMap(showByScale?map:null);
      if(line._labelOverlay._labelElement){
        line._labelOverlay._labelElement.style.opacity=
          line._routeEnabled===false ? String(offRouteStyle.opacity) : String(routeStyle.opacity);
      }
    }
  });
}

function applyRouteStyle(){
  routePolylines.forEach(line=>{
    if(line._routeEnabled!==false){
      line.setOptions({
        strokeWeight:routeStyle.weight,
        strokeColor:routeStyle.color,
        strokeOpacity:routeStyle.opacity
      });
      updateRouteOutline(line,routeStyle.weight,routeStyle.opacity);
      if(line._labelOverlay?._labelElement){
        line._labelOverlay._labelElement.style.opacity=String(routeStyle.opacity);
      }
    }
  });
}

function applyOffRouteStyle(){
  routePolylines.forEach(line=>{
    if(line._routeEnabled===false){
      line.setOptions({
        strokeWeight:offRouteStyle.weight,
        strokeColor:offRouteStyle.color,
        strokeOpacity:offRouteStyle.opacity
      });
      updateRouteOutline(line,offRouteStyle.weight,offRouteStyle.opacity);
      if(line._labelOverlay?._labelElement){
        line._labelOverlay._labelElement.style.opacity=String(offRouteStyle.opacity);
      }
    }
  });
}

document.querySelectorAll('.style-section-toggle').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const body=document.getElementById(btn.dataset.target);
    const willOpen=!body.classList.contains('open');
    const scope=btn.parentElement;

    scope.querySelectorAll(':scope > .style-section-body.open').forEach(openBody=>{
      if(openBody===body) return;
      openBody.classList.remove('open');
      const otherBtn=scope.querySelector(':scope > .style-section-toggle[data-target="'+openBody.id+'"]');
      if(otherBtn?.lastElementChild) otherBtn.lastElementChild.textContent='›';
    });

    body.classList.toggle('open',willOpen);
    if(btn.lastElementChild) btn.lastElementChild.textContent=willOpen?'‹':'›';
  });
});

const routeWeightInput=document.getElementById('routeWeight');
const routeColorInput=document.getElementById('routeColor');
const routeOpacityInput=document.getElementById('routeOpacity');
const routeWeightValue=document.getElementById('routeWeightValue');
const routeOpacityValue=document.getElementById('routeOpacityValue');
const labelSizeInput=document.getElementById('labelSize');
const labelSizeValue=document.getElementById('labelSizeValue');
const labelColorInput=document.getElementById('labelColor');
const offRouteWeightInput=document.getElementById('offRouteWeight');
const offRouteColorInput=document.getElementById('offRouteColor');
const offRouteOpacityInput=document.getElementById('offRouteOpacity');
const offRouteWeightValue=document.getElementById('offRouteWeightValue');
const offRouteOpacityValue=document.getElementById('offRouteOpacityValue');
const saveLabelStyleBtn=document.getElementById('saveLabelStyleBtn');

routeWeightInput.value=String(routeStyle.weight);
routeWeightValue.textContent=String(routeStyle.weight);
routeColorInput.value=routeStyle.color.toLowerCase();
routeOpacityInput.value=String(routeStyle.opacity);
routeOpacityValue.textContent=Math.round(routeStyle.opacity*100)+'%';

offRouteWeightInput.value=String(offRouteStyle.weight);
offRouteWeightValue.textContent=String(offRouteStyle.weight);
offRouteColorInput.value=offRouteStyle.color.toLowerCase();
offRouteOpacityInput.value=String(offRouteStyle.opacity);
offRouteOpacityValue.textContent=Math.round(offRouteStyle.opacity*100)+'%';

labelSizeInput.value=String(labelStyle.size);
labelSizeValue.textContent=labelStyle.size+'px';
labelColorInput.value=labelStyle.color.toLowerCase();

function persistDisplayStyles(){
  try{
    localStorage.setItem(ROUTE_STYLE_STORAGE_KEY,JSON.stringify({
      route:{
        weight:routeStyle.weight,
        color:routeStyle.color,
        opacity:routeStyle.opacity
      },
      off:{
        weight:offRouteStyle.weight,
        color:offRouteStyle.color,
        opacity:offRouteStyle.opacity
      }
    }));
    localStorage.setItem(LABEL_STYLE_STORAGE_KEY,JSON.stringify({
      size:labelStyle.size,
      color:labelStyle.color
    }));
  }catch(error){
    console.error('스타일 설정 저장 오류',error);
  }
}

function refreshSizePresetGroups(){
  document.querySelectorAll('.size-preset-group').forEach(group=>{
    const target=document.getElementById(group.dataset.target);
    if(!target) return;
    const current=Number(target.value);
    group.querySelectorAll('button').forEach(btn=>{
      btn.classList.toggle('active',Number(btn.dataset.value)===current);
    });
  });
}

document.querySelectorAll('.size-preset-group button').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const group=btn.closest('.size-preset-group');
    const target=document.getElementById(group?.dataset.target||'');
    if(!target) return;
    target.value=btn.dataset.value;
    target.dispatchEvent(new Event('input',{bubbles:true}));
    refreshSizePresetGroups();
  });
});

refreshSizePresetGroups();

routeWeightInput.addEventListener('input',()=>{
  routeStyle.weight=Number(routeWeightInput.value);
  routeWeightValue.textContent=routeWeightInput.value;
  applyRouteStyle();
  persistDisplayStyles();
  refreshSizePresetGroups();
});

routeColorInput.addEventListener('input',()=>{
  routeStyle.color=routeColorInput.value;
  applyRouteStyle();
  persistDisplayStyles();
});

routeOpacityInput.addEventListener('input',()=>{
  routeStyle.opacity=Number(routeOpacityInput.value);
  routeOpacityValue.textContent=Math.round(routeStyle.opacity*100)+'%';
  applyRouteStyle();
  persistDisplayStyles();
});

offRouteWeightInput.addEventListener('input',()=>{
  offRouteStyle.weight=Number(offRouteWeightInput.value);
  offRouteWeightValue.textContent=offRouteWeightInput.value;
  applyOffRouteStyle();
  persistDisplayStyles();
  refreshSizePresetGroups();
});

offRouteColorInput.addEventListener('input',()=>{
  offRouteStyle.color=offRouteColorInput.value;
  applyOffRouteStyle();
  persistDisplayStyles();
});

offRouteOpacityInput.addEventListener('input',()=>{
  offRouteStyle.opacity=Number(offRouteOpacityInput.value);
  offRouteOpacityValue.textContent=Math.round(offRouteStyle.opacity*100)+'%';
  applyOffRouteStyle();
  persistDisplayStyles();
});

labelSizeInput.addEventListener('input',()=>{
  labelStyle.size=Number(labelSizeInput.value);
  labelSizeValue.textContent=labelStyle.size+'px';
  routeLabels.forEach(overlay=>{
    if(overlay._labelElement){
      overlay._labelElement.style.fontSize=labelStyle.size+'px';
    }
  });
  persistDisplayStyles();
  refreshSizePresetGroups();
});

labelColorInput.addEventListener('input',()=>{
  labelStyle.color=labelColorInput.value;
  routeLabels.forEach(overlay=>{
    if(overlay._labelElement){
      overlay._labelElement.style.color=labelStyle.color;
    }
  });
  persistDisplayStyles();
});

saveLabelStyleBtn?.addEventListener('click',()=>{
  persistDisplayStyles();
  statusEl.textContent='라인·라벨 설정을 현재 값으로 저장했습니다.';
});

kakao.maps.event.addListener(map,'zoom_changed',updateRouteLabelVisibility);
const mapTypeToggle=document.getElementById('mapTypeToggle');
const mapTypeToggleLabel=document.getElementById('mapTypeToggleLabel');
const mapTypeToggleIcon=document.getElementById('mapTypeToggleIcon');
let satelliteMapEnabled=false;

function syncMapTypeToggle(){
  if(!mapTypeToggle || !mapTypeToggleLabel || !mapTypeToggleIcon) return;

  if(satelliteMapEnabled){
    mapTypeToggleLabel.textContent='지도';
    mapTypeToggle.setAttribute('aria-label','지도로 전환');
    mapTypeToggle.setAttribute('title','지도로 전환');
    mapTypeToggleIcon.innerHTML=
      '<path d="M5 8l7-3 8 3 7-3v19l-7 3-8-3-7 3V8Z"></path>'+
      '<path d="M12 5v19M20 8v19"></path>';
  }else{
    mapTypeToggleLabel.textContent='영상';
    mapTypeToggle.setAttribute('aria-label','영상으로 전환');
    mapTypeToggle.setAttribute('title','영상으로 전환');
    mapTypeToggleIcon.innerHTML=
      '<rect x="4" y="6" width="24" height="20" rx="3"></rect>'+
      '<path d="M7 22l6-7 4 4 3-3 5 6"></path>'+
      '<circle cx="21.5" cy="11.5" r="2.2"></circle>';
  }
}

function setSatelliteMap(enabled){
  satelliteMapEnabled=!!enabled;
  map.setMapTypeId(
    satelliteMapEnabled
      ? kakao.maps.MapTypeId.HYBRID
      : kakao.maps.MapTypeId.ROADMAP
  );
  document.body.classList.toggle('satellite-map',satelliteMapEnabled);
  syncMapTypeToggle();
}

mapTypeToggle?.addEventListener('click',()=>{
  setSatelliteMap(!satelliteMapEnabled);
});
syncMapTypeToggle();
function mercatorToWgs84Point(pt){
  if(!Array.isArray(pt) || pt.length<2) return null;
  const x=Number(pt[0]), y=Number(pt[1]);
  if(!Number.isFinite(x)||!Number.isFinite(y)) return null;

  // 이미 WGS84로 저장된 경우 그대로 사용
  if(Math.abs(x)<=180 && Math.abs(y)<=90){
    return new kakao.maps.LatLng(y,x);
  }

  const max=20037508.34;
  const lon=x/max*180;
  const lat=180/Math.PI*(2*Math.atan(Math.exp((y/max*180)*Math.PI/180))-Math.PI/2);
  return new kakao.maps.LatLng(lat,lon);
}

function airspaceName(props,spec){
  if(!props) return spec.label;
  for(const key of spec.nameFields){
    const v=props[key];
    if(v!==undefined && v!==null && String(v).trim()) return String(v).trim();
  }
  for(const [k,v] of Object.entries(props)){
    if(typeof v==='string' && v.trim() && !v.trim().startsWith('<')) return v.trim();
  }
  return spec.label;
}

function addKoreanAirspaceRing(ring,spec,key,name){
  if(!Array.isArray(ring)) return 0;
  const path=ring.map(mercatorToWgs84Point).filter(Boolean);
  if(path.length<3) return 0;

  const polygon=new kakao.maps.Polygon({
    map:null,
    path:path,
    strokeWeight:2,
    strokeColor:spec.color,
    strokeOpacity:.85,
    strokeStyle:'solid',
    fillColor:spec.color,
    fillOpacity:spec.fillOpacity
  });
  krAirspaceOverlays[key].push(polygon);
  return 1;
}

function renderKoreanAirspaceFeature(feature,spec,key){
  if(!feature?.geometry) return 0;
  const geom=feature.geometry;
  const name=airspaceName(feature.properties,spec);
  let count=0;

  if(geom.type==='Polygon'){
    const outer=geom.coordinates?.[0];
    count+=addKoreanAirspaceRing(outer,spec,key,name);
  }else if(geom.type==='MultiPolygon'){
    (geom.coordinates||[]).forEach(poly=>{
      const outer=poly?.[0];
      count+=addKoreanAirspaceRing(outer,spec,key,name);
    });
  }
  return count;
}

function selectedKoreanAirspaceCategories(){
  return new Set(
    [...document.querySelectorAll('.krAirspaceCategory:checked')].map(el=>el.value)
  );
}

function refreshKoreanAirspaceVisibility(){
  const selected=selectedKoreanAirspaceCategories();
  Object.entries(krAirspaceOverlays).forEach(([key,items])=>{
    const show=krAirspaceEnabled && selected.has(key);
    items.forEach(o=>o.setMap(show?map:null));
  });
}

async function loadKoreanAirspace(){
  const status=document.getElementById('krAirspaceStatus');
  if(krAirspaceLoaded){
    refreshKoreanAirspaceVisibility();
    return;
  }
  if(status) status.textContent='국내 공역 데이터를 불러오는 중...';

  try{
    let polygonCount=0;
    for(const [key,spec] of Object.entries(KR_AIRSPACE_SPECS)){
      const res=await fetch(spec.url,{cache:'no-store'});
      if(!res.ok) throw new Error(spec.label+' HTTP '+res.status);
      const data=await res.json();
      (data.features||[]).forEach(feature=>{
        polygonCount+=renderKoreanAirspaceFeature(feature,spec,key);
      });
    }
    krAirspaceLoaded=true;
    refreshKoreanAirspaceVisibility();
    if(status) status.textContent='국내 공역 '+polygonCount+'개 폴리곤 표시 준비 완료';
  }catch(error){
    console.error('Korean airspace load error',error);
    if(status) status.textContent='국내 공역 데이터를 불러오지 못했습니다.';
  }
}

function normalizeHeading(value){
  const n=Number(value);
  if(!Number.isFinite(n)) return null;
  return ((n%360)+360)%360;
}

function updateLocationHeadingVisual(){
  if(!currentLocationHeadingEl) return;
  const heading=normalizeHeading(currentHeading);
  if(heading===null){
    currentLocationHeadingEl.classList.remove('visible');
    return;
  }

  currentLocationHeadingEl.classList.add('visible');
  currentLocationHeadingEl.style.transform='translateX(-50%) rotate('+heading+'deg)';
}

function distanceMeters(lat1,lng1,lat2,lng2){
  const R=6371000;
  const toRad=v=>v*Math.PI/180;
  const p1=toRad(lat1);
  const p2=toRad(lat2);
  const dp=toRad(lat2-lat1);
  const dl=toRad(lng2-lng1);
  const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function bearingBetween(lat1,lng1,lat2,lng2){
  const toRad=v=>v*Math.PI/180;
  const toDeg=v=>v*180/Math.PI;
  const p1=toRad(lat1);
  const p2=toRad(lat2);
  const dl=toRad(lng2-lng1);

  const y=Math.sin(dl)*Math.cos(p2);
  const x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
  return normalizeHeading(toDeg(Math.atan2(y,x)));
}

function smoothHeading(previous,next){
  const prev=normalizeHeading(previous);
  const target=normalizeHeading(next);
  if(target===null) return prev;
  if(prev===null) return target;

  let delta=((target-prev+540)%360)-180;
  return normalizeHeading(prev+delta*0.35);
}

function ensureCurrentLocationMarker(loc){
  if(currentMarker) return;

  const markerEl=document.createElement('div');
  markerEl.className='current-location-marker';
  markerEl.setAttribute('aria-label','현재 위치');

  const headingEl=document.createElement('div');
  headingEl.className='current-location-heading';

  const dotEl=document.createElement('div');
  dotEl.className='current-location-dot';

  markerEl.appendChild(headingEl);
  markerEl.appendChild(dotEl);

  currentLocationMarkerEl=markerEl;
  currentLocationHeadingEl=headingEl;

  currentMarker=new kakao.maps.CustomOverlay({
    map:map,
    position:loc,
    content:markerEl,
    xAnchor:0.5,
    yAnchor:0.5,
    zIndex:80
  });

  updateLocationHeadingVisual();
}

function animateCurrentLocationTo(loc){
  ensureCurrentLocationMarker(loc);

  if(locationMoveAnimation){
    cancelAnimationFrame(locationMoveAnimation);
    locationMoveAnimation=null;
  }

  const from=currentLocationLatLng || loc;
  const fromLat=from.getLat();
  const fromLng=from.getLng();
  const toLat=loc.getLat();
  const toLng=loc.getLng();
  const duration=650;
  const started=performance.now();

  const ease=t=>1-Math.pow(1-t,3);

  const frame=now=>{
    const p=Math.min(1,(now-started)/duration);
    const ep=ease(p);
    const lat=fromLat+(toLat-fromLat)*ep;
    const lng=fromLng+(toLng-fromLng)*ep;
    const point=new kakao.maps.LatLng(lat,lng);

    currentMarker.setPosition(point);

    if(p<1){
      locationMoveAnimation=requestAnimationFrame(frame);
    }else{
      currentLocationLatLng=loc;
      locationMoveAnimation=null;
    }
  };

  locationMoveAnimation=requestAnimationFrame(frame);
}

function updateCurrentLocationMarker(loc){
  if(!currentLocationLatLng){
    currentLocationLatLng=loc;
    ensureCurrentLocationMarker(loc);
    currentMarker.setPosition(loc);
    return;
  }

  animateCurrentLocationTo(loc);
  currentMarker.setMap(map);
}

function handleDeviceOrientation(event){
  let heading=null;

  if(Number.isFinite(event.webkitCompassHeading)){
    heading=event.webkitCompassHeading;
  }else if(Number.isFinite(event.alpha)){
    heading=360-event.alpha;
  }

  heading=normalizeHeading(heading);
  if(heading===null) return;

  deviceHeading=heading;
  if(currentHeading===null) updateLocationHeadingVisual();
}

async function enableDeviceHeading(){
  if(deviceOrientationListening || typeof DeviceOrientationEvent==='undefined') return;

  try{
    if(typeof DeviceOrientationEvent.requestPermission==='function'){
      const permission=await DeviceOrientationEvent.requestPermission();
      if(permission!=='granted') return;
    }

    window.addEventListener('deviceorientationabsolute',handleDeviceOrientation,true);
    window.addEventListener('deviceorientation',handleDeviceOrientation,true);
    deviceOrientationListening=true;
  }catch(error){
    console.warn('방향 센서 사용 불가',error);
  }
}

function handleLocationUpdate(position){
  const lat=position.coords.latitude;
  const lng=position.coords.longitude;
  const loc=new kakao.maps.LatLng(lat,lng);

  // 화살표는 휴대폰이 바라보는 방향이 아니라 실제 GPS 이동 궤적을 기준으로 함.
  if(lastMovementPosition){
    const moved=distanceMeters(
      lastMovementPosition.lat,
      lastMovementPosition.lng,
      lat,
      lng
    );

    // GPS 흔들림은 방향으로 취급하지 않음.
    if(moved>=1.0){
      const movementBearing=bearingBetween(
        lastMovementPosition.lat,
        lastMovementPosition.lng,
        lat,
        lng
      );
      currentHeading=movementBearing;
      lastMovementPosition={lat,lng};
    }
  }else{
    lastMovementPosition={lat,lng};
  }

  updateCurrentLocationMarker(loc);
  updateLocationHeadingVisual();

  // GPS 갱신은 위치 마커만 움직임.
  // 지도 중심 이동은 최초 위치 확인 또는 사용자가 '현재 위치'를 다시 눌렀을 때만 수행함.
  if(!locationTrackingStarted || locationRecenterRequested){
    map.setCenter(loc);
    if(!locationTrackingStarted) map.setLevel(4);
    locationTrackingStarted=true;
    locationRecenterRequested=false;
  }

  statusEl.textContent='현재 위치 추적 중 · '+lat.toFixed(6)+', '+lng.toFixed(6);
}

function handleLocationError(error){
  console.error(error);

  let message='현재 위치를 가져오지 못했습니다.';
  if(error && error.code===1) message='위치 권한을 허용해 주세요.';
  else if(error && error.code===2) message='현재 위치를 확인할 수 없습니다.';
  else if(error && error.code===3) message='현재 위치 확인 시간이 초과되었습니다.';

  statusEl.textContent=message;
  alert(message);
}

async function locateMe(){
  if(!navigator.geolocation){
    alert('이 브라우저에서는 현재 위치 기능을 사용할 수 없습니다.');
    return;
  }

  // 이미 추적 중이면 새 추적은 만들지 않음.
  // 사용자가 버튼을 다시 눌렀을 때만 현재 위치로 지도를 이동함.
  if(locationWatchId!==null){
    if(currentLocationLatLng){
      map.setCenter(currentLocationLatLng);
      locationRecenterRequested=false;
    }else{
      locationRecenterRequested=true;
    }
    statusEl.textContent='현재 위치 추적 중';
    return;
  }

  statusEl.textContent='현재 위치 확인 중...';
  locationTrackingStarted=false;
  locationRecenterRequested=true;
  currentHeading=null;
  lastMovementPosition=null;

  locationWatchId=navigator.geolocation.watchPosition(
    handleLocationUpdate,
    handleLocationError,
    {
      enableHighAccuracy:true,
      timeout:15000,
      maximumAge:1000
    }
  );
}
document.getElementById('krAirspaceToggle')?.addEventListener('change',function(){
  krAirspaceEnabled=this.checked;
  if(krAirspaceEnabled) loadKoreanAirspace();
  else refreshKoreanAirspaceVisibility();
});
document.querySelectorAll('.krAirspaceCategory').forEach(el=>{
  el.addEventListener('change',refreshKoreanAirspaceVisibility);
});

document.getElementById('floatingLocBtn')?.addEventListener('click',locateMe);
document.getElementById('menuLocBtn')?.addEventListener('click',locateMe);
document.getElementById('resetRouteStatesBtn')?.addEventListener('click',resetRouteStates);
syncPanelToggle();
updateStablePanelWidth();
updateStablePanelHeight();
window.addEventListener('resize',()=>{
  updateStablePanelWidth();
  updateStablePanelHeight();
});
renderMemoList();

// 다른 기기에서 수정·삭제된 메모가 이 기기로 돌아왔을 때 즉시 반영되도록 갱신함.
window.addEventListener('focus',()=>loadRemoteMemos());
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible') loadRemoteMemos();
});

function runBackgroundSync(){
  Promise.allSettled([
    loadRemoteMemos(),
    loadRemoteRouteStates()
  ]).catch(console.error);
}

updateScaleBar();
loadRoute().then(()=>{
  // 경로를 먼저 표시한 뒤 메모/클라우드 상태 동기화를 유휴시간에 처리함.
  if('requestIdleCallback' in window){
    requestIdleCallback(runBackgroundSync,{timeout:1500});
  }else{
    setTimeout(runBackgroundSync,300);
  }
});