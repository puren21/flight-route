
// Flight Route usability improvements — 2026-09-23
(() => {
  'use strict';

  const IMPROVEMENT_VERSION='2026.09.23-1';
  let followLocationEnabled=false;
  let pendingNearbySearch=false;

  function metersBetween(lat1,lng1,lat2,lng2){
    const R=6371000;
    const toRad=v=>v*Math.PI/180;
    const p1=toRad(lat1), p2=toRad(lat2);
    const dp=toRad(lat2-lat1), dl=toRad(lng2-lng1);
    const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }

  function pointSegmentDistanceMeters(lat,lng,a,b){
    const latRad=lat*Math.PI/180;
    const mx=111320*Math.cos(latRad);
    const my=110540;
    const ax=(a.getLng()-lng)*mx;
    const ay=(a.getLat()-lat)*my;
    const bx=(b.getLng()-lng)*mx;
    const by=(b.getLat()-lat)*my;
    const vx=bx-ax, vy=by-ay;
    const denom=vx*vx+vy*vy;
    let t=denom>0 ? -(ax*vx+ay*vy)/denom : 0;
    t=Math.max(0,Math.min(1,t));
    const px=ax+vx*t;
    const py=ay+vy*t;
    return Math.hypot(px,py);
  }

  function routeDistanceMeters(entry,loc){
    let best=Infinity;
    const lat=loc.getLat();
    const lng=loc.getLng();

    (entry?.lines||[]).forEach(line=>{
      let path=[];
      try{ path=line.getPath?.()||[]; }catch(e){ path=[]; }
      if(!Array.isArray(path) || !path.length) return;

      if(path.length===1){
        best=Math.min(best,metersBetween(lat,lng,path[0].getLat(),path[0].getLng()));
        return;
      }

      for(let i=0;i<path.length-1;i++){
        best=Math.min(best,pointSegmentDistanceMeters(lat,lng,path[i],path[i+1]));
      }
    });

    return best;
  }

  function focusRouteKey(key){
    const entry=routeIndex.get(String(key));
    if(!entry?.bounds) return false;
    try{
      map.setBounds(entry.bounds);
      window.setTimeout(()=>{
        try{ map.setLevel(Math.max(1,map.getLevel()-1)); }catch(e){}
      },40);
      return true;
    }catch(e){
      console.error('가까운 경로 이동 오류',e);
      return false;
    }
  }

  function formatDistance(meters){
    if(!Number.isFinite(meters)) return '-';
    if(meters>=1000){
      const km=meters/1000;
      return (km>=10?km.toFixed(1):km.toFixed(2)).replace(/\.0+$/,'')+' km';
    }
    return Math.round(meters)+' m';
  }

  function renderNearbyRoutes(){
    const box=document.getElementById('nearbyRouteResults');
    if(!box) return;

    if(!currentLocationLatLng){
      pendingNearbySearch=true;
      box.hidden=false;
      box.innerHTML='<div class="diagnostic-panel">현재 위치를 확인하는 중입니다.</div>';
      locateMe();
      return;
    }

    if(!routeIndex.size){
      box.hidden=false;
      box.innerHTML='<div class="diagnostic-panel">비행경로 데이터를 불러오는 중입니다.</div>';
      return;
    }

    pendingNearbySearch=false;
    const ranked=[...routeIndex.entries()]
      .map(([key,entry])=>({key,distance:routeDistanceMeters(entry,currentLocationLatLng)}))
      .filter(item=>Number.isFinite(item.distance))
      .sort((a,b)=>a.distance-b.distance)
      .slice(0,3);

    box.innerHTML='';
    box.hidden=false;

    if(!ranked.length){
      box.innerHTML='<div class="diagnostic-panel">가까운 경로를 계산할 수 없습니다.</div>';
      return;
    }

    ranked.forEach((item,index)=>{
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='nearby-route-item';
      btn.innerHTML='<strong>가까운 경로 '+(index+1)+' · '+String(item.key)+'</strong>'+
        '<span class="nearby-route-distance">'+formatDistance(item.distance)+'</span>';
      btn.addEventListener('click',()=>{
        focusRouteKey(item.key);
      });
      box.appendChild(btn);
    });
  }

  function syncFollowButton(){
    const btn=document.getElementById('followLocBtn');
    if(!btn) return;
    btn.classList.toggle('active',followLocationEnabled);
    btn.setAttribute('aria-pressed',followLocationEnabled?'true':'false');
    btn.textContent=followLocationEnabled?'위치 따라가기 켬':'위치 따라가기';
  }

  document.getElementById('followLocBtn')?.addEventListener('click',()=>{
    followLocationEnabled=!followLocationEnabled;
    syncFollowButton();

    if(followLocationEnabled){
      if(currentLocationLatLng){
        map.setCenter(currentLocationLatLng);
      }
      locateMe();
      statusEl.textContent='위치 따라가기 켬 · 지도를 움직여도 다음 GPS 갱신 시 현재 위치로 이동합니다.';
    }else{
      statusEl.textContent='위치 따라가기 끔 · 자유롭게 지도를 탐색할 수 있습니다.';
    }
  });

  document.getElementById('nearbyRouteBtn')?.addEventListener('click',renderNearbyRoutes);

  // Existing location updates remain untouched; follow mode adds only optional recentering.
  const originalHandleLocationUpdate=handleLocationUpdate;
  handleLocationUpdate=function(position){
    originalHandleLocationUpdate(position);

    if(followLocationEnabled){
      const lat=Number(position?.coords?.latitude);
      const lng=Number(position?.coords?.longitude);
      if(Number.isFinite(lat) && Number.isFinite(lng)){
        map.setCenter(new kakao.maps.LatLng(lat,lng));
      }
    }

    if(pendingNearbySearch){
      window.setTimeout(renderNearbyRoutes,80);
    }

    refreshDiagnostics();
  };

  function collectBackup(){
    const storage={};
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(key && key.startsWith('flightRoute')){
        storage[key]=localStorage.getItem(key);
      }
    }
    return {
      type:'flight-route-backup',
      version:1,
      createdAt:new Date().toISOString(),
      storage
    };
  }

  document.getElementById('exportSettingsBtn')?.addEventListener('click',()=>{
    try{
      const backup=collectBackup();
      const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;
      const d=new Date();
      const stamp=d.getFullYear()+
        String(d.getMonth()+1).padStart(2,'0')+
        String(d.getDate()).padStart(2,'0');
      a.download='비행경로_설정백업_'+stamp+'.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      statusEl.textContent='설정·메모 백업 파일을 저장했습니다.';
    }catch(e){
      console.error(e);
      statusEl.textContent='설정 내보내기에 실패했습니다.';
    }
  });

  const importInput=document.getElementById('importSettingsFile');
  document.getElementById('importSettingsBtn')?.addEventListener('click',()=>importInput?.click());

  importInput?.addEventListener('change',async()=>{
    const file=importInput.files?.[0];
    if(!file) return;
    try{
      const data=JSON.parse(await file.text());
      if(data?.type!=='flight-route-backup' || !data.storage || typeof data.storage!=='object'){
        throw new Error('올바른 비행경로 백업 파일이 아닙니다.');
      }

      Object.entries(data.storage).forEach(([key,value])=>{
        if(!String(key).startsWith('flightRoute')) return;
        if(typeof value!=='string') return;
        localStorage.setItem(key,value);
      });

      statusEl.textContent='설정을 가져왔습니다. 새로고침합니다.';
      setTimeout(()=>location.reload(),300);
    }catch(e){
      console.error(e);
      alert('설정 가져오기 실패: '+(e?.message||'파일을 확인해 주세요.'));
    }finally{
      importInput.value='';
    }
  });

  function diagnosticRows(){
    const gps=currentLocationLatLng
      ? currentLocationLatLng.getLat().toFixed(5)+', '+currentLocationLatLng.getLng().toFixed(5)
      : '대기';
    const airspace=krAirspaceEnabled
      ? (krAirspaceLoaded?'표시 중':'불러오는 중')
      : '꺼짐';
    const mapMode=(typeof satelliteMapEnabled!=='undefined' && satelliteMapEnabled)?'영상':'지도';

    return [
      ['버전',IMPROVEMENT_VERSION],
      ['경로 번호',routeIndex.size+'개'],
      ['경로 선',routePolylines.length+'개'],
      ['GPS',gps],
      ['위치 따라가기',followLocationEnabled?'켬':'끔'],
      ['장애물공역',airspace],
      ['배경지도',mapMode],
      ['온라인',navigator.onLine?'연결':'오프라인']
    ];
  }

  function refreshDiagnostics(){
    const panel=document.getElementById('diagnosticPanel');
    if(!panel || panel.hidden) return;
    panel.innerHTML=diagnosticRows()
      .map(([k,v])=>'<div class="diagnostic-line"><span>'+k+'</span><strong>'+v+'</strong></div>')
      .join('');
  }

  function renderDiagnostics(){
    const panel=document.getElementById('diagnosticPanel');
    const btn=document.getElementById('diagnosticBtn');
    if(!panel || !btn) return;
    const opening=panel.hidden;
    panel.hidden=!opening;
    btn.setAttribute('aria-expanded',opening?'true':'false');
    btn.querySelector('.utility-chevron')?.replaceChildren(document.createTextNode(opening?'‹':'›'));
    if(opening) refreshDiagnostics();
  }

  document.getElementById('diagnosticBtn')?.addEventListener('click',renderDiagnostics);
  window.addEventListener('online',refreshDiagnostics);
  window.addEventListener('offline',refreshDiagnostics);

  syncFollowButton();
})();
