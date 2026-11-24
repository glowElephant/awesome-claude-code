/*
 * 세종 3D 지도 — 앱 진입점: 지도 생성, UI 연결, 상호작용
 */
(function () {
  'use strict';
  var SJ = (window.SJ = window.SJ || {});
  var C = SJ.config, U = SJ.util, esc = U.esc;
  var $ = function (id) { return document.getElementById(id); };

  var loadingEl = $('loading'), loadingText = $('loading-text'), statusEl = $('status');
  function fatal(msg) {
    loadingEl.classList.add('err');
    loadingText.textContent = msg;
    statusEl.textContent = msg; statusEl.classList.add('err');
  }
  function setStatus(msg, isErr) {
    statusEl.textContent = msg;
    statusEl.classList.toggle('err', !!isErr);
  }
  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  SJ.toast = toast;

  if (!window.maplibregl) {
    fatal('지도 라이브러리(MapLibre GL JS)를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침하세요.');
    return;
  }

  // ── 상태 (저장값 → URL 해시 순으로 덮어씀) ─────────────
  var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  var S = SJ.state = Object.assign({
    theme: prefersLight ? 'light' : 'dark',
    buildings: '3d', colorMode: 'height',
    labels: true, poi: true, latin: false, housenumbers: true,
    boundary: true, adminLines: true,
    hillshade: true, relief: false, terrain: false, exaggeration: 1.5,
    places: true, bldDetail: true, facade: true, detailCover: null,
    timeMin: null,
  }, SJ.store.get('sj.settings.v1', {}));
  S.timeMin = SJ.lighting.nowMinutes();
  S.detailCover = null;
  var ovFromHash = [];

  function readHash() {
    var parts = location.hash.replace(/^#/, '').split('&');
    parts.forEach(function (p) {
      var kv = p.split('='), k = kv[0], v = decodeURIComponent(kv[1] || '');
      if (!v) return;
      switch (k) {
        case 'th': if (SJ.themes[v]) S.theme = v; break;
        case 'bd': if (/^(3d|flat|off)$/.test(v)) S.buildings = v; break;
        case 'bc': if (/^(height|osm|solid|use)$/.test(v)) S.colorMode = v; break;
        case 'pl': S.places = v === '1'; break;
        case 'bdt': S.bldDetail = v === '1'; break;
        case 'fc': S.facade = v === '1'; break;
        case 'tr': S.terrain = v === '1'; break;
        case 'ex': var x = parseFloat(v); if (x >= 1 && x <= 3) S.exaggeration = x; break;
        case 'hs': S.hillshade = v === '1'; break;
        case 'rf': S.relief = v === '1'; break;
        case 'lb': S.labels = v === '1'; break;
        case 'tm': var m = parseInt(v, 10); if (m >= 0 && m < 1440) S.timeMin = m; break;
        case 'ov': ovFromHash = v.split(',').filter(function (id) { return SJ.overpass.defs[id]; }); break;
      }
    });
  }
  readHash();
  var hasMapHash = /(^|[#&])map=/.test(location.hash);

  function saveState() {
    var keep = {};
    ['theme', 'buildings', 'colorMode', 'labels', 'poi', 'latin', 'housenumbers', 'boundary', 'adminLines', 'hillshade', 'relief', 'terrain', 'exaggeration', 'places', 'bldDetail', 'facade']
      .forEach(function (k) { keep[k] = S[k]; });
    SJ.store.set('sj.settings.v1', keep);
    writeHash();
  }
  function writeHash() {
    var parts = location.hash.replace(/^#/, '').split('&').filter(function (p) { return /^map=/.test(p); });
    var ov = Object.keys(SJ.overpass.defs).filter(SJ.overpass.isEnabled);
    parts.push('th=' + S.theme, 'bd=' + S.buildings, 'bc=' + S.colorMode, 'tr=' + (S.terrain ? 1 : 0),
      'ex=' + S.exaggeration, 'hs=' + (S.hillshade ? 1 : 0), 'rf=' + (S.relief ? 1 : 0), 'lb=' + (S.labels ? 1 : 0), 'tm=' + S.timeMin,
      'pl=' + (S.places ? 1 : 0), 'bdt=' + (S.bldDetail ? 1 : 0), 'fc=' + (S.facade ? 1 : 0));
    if (ov.length) parts.push('ov=' + ov.join(','));
    history.replaceState(history.state, '', location.href.replace(/(#.*)?$/, '#' + parts.join('&')));
  }

  SJ.palette = function () { return SJ.themes[S.theme]; };
  function applyThemeChrome() {
    document.documentElement.setAttribute('data-theme', S.theme);
    var meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', SJ.palette().bg);
  }
  applyThemeChrome();

  // ── 지도 생성 ───────────────────────────────────────
  var map;
  try {
    map = new maplibregl.Map({
      container: 'map',
      style: SJ.buildStyle(SJ.palette(), S),
      center: C.center, zoom: 10.6, pitch: 50, bearing: -15,
      minZoom: C.minZoom, maxZoom: C.maxZoom, maxPitch: 85,
      maxBounds: C.maxBounds,
      hash: 'map',
      attributionControl: false,
      localIdeographFontFamily: C.localIdeographFontFamily,
      fadeDuration: 200,
      // 내장 컨트롤 툴팁 한국어화
      locale: {
        'NavigationControl.ZoomIn': '확대', 'NavigationControl.ZoomOut': '축소', 'NavigationControl.ResetBearing': '북쪽으로 초기화 (드래그하여 기울이기)',
        'FullscreenControl.Enter': '전체 화면', 'FullscreenControl.Exit': '전체 화면 종료',
        'GeolocateControl.FindMyLocation': '내 위치', 'GeolocateControl.LocationNotAvailable': '위치를 사용할 수 없습니다',
        'AttributionControl.ToggleAttribution': '저작권 정보', 'AttributionControl.MapFeedback': '지도 피드백',
        'ScaleControl.Meters': 'm', 'ScaleControl.Kilometers': 'km', 'Map.Title': '지도', 'Popup.Close': '팝업 닫기', 'Marker.Title': '지도 표식',
      },
    });
  } catch (err) {
    console.error(err);
    fatal('이 브라우저에서 WebGL 지도를 만들 수 없습니다. 하드웨어 가속을 켜거나 다른 브라우저를 사용해 보세요.');
    return;
  }
  SJ.map = window.sejongMap = map;
  SJ.overlays.map = map;

  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: true }), 'top-right');
  map.addControl(new maplibregl.FullscreenControl(), 'top-right');
  map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false, showAccuracyCircle: true }), 'top-right');
  map.on('styleimagemissing', function (e) {
    if (e.id && e.id.indexOf('sj-') === 0) SJ.icons.onMissing(map, e.id, SJ.palette());
  });

  // ── 오류 처리 ──────────────────────────────────────
  var errShown = {};
  map.on('error', function (e) {
    var err = e && e.error;
    console.warn('[지도]', e.sourceId || '', err && err.message ? err.message : err);
    var src = e && e.sourceId;
    var key = src && src.indexOf('dem') === 0 ? 'dem' : src === 'omt' ? 'omt' : 'other';
    if (errShown[key]) return;
    errShown[key] = true;
    if (key === 'dem') setStatus('지형(고도) 데이터를 일부 불러오지 못했습니다.', true);
    else if (key === 'omt') setStatus('일부 지도 타일을 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 새로고침하세요.', true);
  });
  var slowTimer = setTimeout(function () {
    if (!map.loaded()) loadingText.textContent = '지도 서버 응답이 늦습니다… 계속 기다리는 중입니다.';
  }, 12000);

  // ── 오버레이: 마우스 강조 / 선택 ─────────────────────
  SJ.overlays.define('rt-hover', {
    before: SJ.FIRST_LABEL_LAYER,
    layers: function (P) {
      return [
        { id: 'hover-building', type: 'fill-extrusion', filter: ['==', ['get', 'mode'], '3d'],
          paint: { 'fill-extrusion-color': ['case', ['==', ['get', 'sel'], 1], P.buildingSelect, P.buildingHover],
            'fill-extrusion-height': ['+', ['get', 'h'], 0.3], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-opacity': 0.85 } },
        { id: 'hover-flat', type: 'fill', filter: ['==', ['get', 'mode'], 'flat'],
          paint: { 'fill-color': ['case', ['==', ['get', 'sel'], 1], P.buildingSelect, P.buildingHover], 'fill-opacity': 0.75 } },
        { id: 'hover-line', type: 'line', filter: ['==', ['get', 'mode'], 'line'],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': ['case', ['==', ['get', 'sel'], 1], P.buildingSelect, P.buildingHover], 'line-width': 6, 'line-opacity': 0.55 } },
      ];
    },
  });
  var hoverFeat = null, selectFeat = null;
  function hoverData() {
    var f = [];
    if (selectFeat) f.push(selectFeat);
    if (hoverFeat) f.push(hoverFeat);
    SJ.overlays.setData('rt-hover', { type: 'FeatureCollection', features: f });
  }
  function toHighlight(feat, sel) {
    var layer = feat.layer.id, g = feat.geometry;
    if (!g) return null;
    var p = feat.properties || {};
    if (/^dt-(bld|roof)/.test(layer) && p.h != null) return { type: 'Feature', geometry: g, properties: { mode: '3d', sel: sel ? 1 : 0, h: +p.h, b: +(p.b || 0) } };
    if (layer === 'building-3d-facade' || layer === 'building-roof') layer = 'building-3d';
    if (layer === 'building-3d') return { type: 'Feature', geometry: g, properties: { mode: '3d', sel: sel ? 1 : 0, h: +(p.render_height || C.defaultBuildingHeight), b: +(p.render_min_height || 0) } };
    if (layer === 'building-flat') return { type: 'Feature', geometry: g, properties: { mode: 'flat', sel: sel ? 1 : 0 } };
    if (/LineString/.test(g.type)) return { type: 'Feature', geometry: g, properties: { mode: 'line', sel: sel ? 1 : 0 } };
    return null;
  }

  // ── 팝업 ───────────────────────────────────────────
  var popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '300px', offset: 12, focusAfterOpen: false });
  popup.on('close', function () { if (selectFeat) { selectFeat = null; hoverData(); } });
  SJ.openPopup = function (lngLat, html) {
    popup.setLngLat(lngLat).setHTML(html).addTo(map);
  };
  function dl(rows) {
    var h = rows.filter(function (r) { return r[1] !== '' && r[1] != null; })
      .map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');
    return h ? '<dl>' + h + '</dl>' : '';
  }
  function ko(v) { return SJ.classLabelsKo[v] || v || ''; }
  function osmLinkAt(ll) {
    return '<a href="https://www.openstreetmap.org/?mlat=' + ll.lat.toFixed(6) + '&mlon=' + ll.lng.toFixed(6) + '#map=19/' + ll.lat.toFixed(6) + '/' + ll.lng.toFixed(6) + '" target="_blank" rel="noopener">OpenStreetMap 에서 보기</a>';
  }
  function coordText(ll) { return ll.lat.toFixed(5) + '°N, ' + ll.lng.toFixed(5) + '°E'; }
  function nameOf(p) { return p['name:ko'] || p.name || ''; }

  function nearby(point, layers, px) {
    var ls = layers.filter(function (l) { return map.getLayer(l); });
    if (!ls.length) return [];
    return map.queryRenderedFeatures([[point.x - px, point.y - px], [point.x + px, point.y + px]], { layers: ls });
  }

  function buildingPopup(f, e) {
    var p = f.properties || {};
    var h = p.render_height != null ? +p.render_height : null;
    var b = +(p.render_min_height || 0);
    var area = SJ.geo.polygonArea(f.geometry);
    var hn = nearby(e.point, ['label-housenumber'], 30)[0];
    var poi = nearby(e.point, ['label-poi'], 24)[0];
    var title = poi ? nameOf(poi.properties) : '건물';
    var rows = [
      ['높이', h != null ? h.toFixed(h < 10 ? 1 : 0) + ' m' : '정보 없음'],
      ['시작 높이', b ? b.toFixed(1) + ' m' : ''],
      ['추정 층수', h != null && h - b > 2 ? '약 ' + Math.max(1, Math.round((h - b) / C.storeyHeight)) + '층' : ''],
      ['바닥 면적', area > 1 ? '약 ' + U.fmtArea(area) : ''],
      ['번지', hn ? hn.properties.housenumber : ''],
      ['색상(OSM)', p.colour || ''],
      ['위치', coordText(e.lngLat)],
    ];
    return '<h3>' + esc(title) + '</h3>' + (poi ? '<p class="pp-type">건물 · ' + esc(ko(poi.properties.subclass || poi.properties.class)) + '</p>' : '') +
      dl(rows) + osmLinkAt(e.lngLat) +
      '<p class="pp-note">층수는 높이 ÷ ' + C.storeyHeight + ' m 로 추정한 값입니다. 면적은 화면에 보이는 타일 범위 기준입니다.</p>';
  }
  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
    return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : '';
  }
  function tagsOf(p) { try { return JSON.parse(p.tg || '{}'); } catch (e) { return {}; } }
  var SRC_NOTE = '<p class="pp-note">출처: OpenStreetMap 기여자. 한국 상호·시설 정보는 지도 앱보다 빠진 곳이 많을 수 있습니다.</p>';
  function placePopup(f, e) {
    var p = f.properties || {}, t = tagsOf(p);
    var web = safeUrl(t.website || t['contact:website']);
    var phone = t.phone || t['contact:phone'] || '';
    var cat = p.cat || 'other';
    return '<h3>' + esc(p.name) + '</h3><p class="pp-type">' + esc(SJ.poiCategoryLabels[cat] || '') + (p.ko ? ' · ' + esc(p.ko) : '') + '</p>' +
      dl([['영문', t['name:en'] || ''], ['층', p.level || ''], ['주소', SJ.addrOf(t)], ['전화', phone], ['영업시간', t.opening_hours || ''],
        ['브랜드', t['brand:ko'] || t.brand || ''], ['운영', t.operator || ''], ['음식', t.cuisine || ''], ['설명', t.description || '']]) +
      (phone ? '<a href="tel:' + esc(phone.replace(/[^0-9+]/g, '')) + '">전화 걸기</a> · ' : '') +
      (web ? '<a href="' + esc(web) + '" target="_blank" rel="noopener nofollow">웹사이트</a> · ' : '') +
      '<a href="https://www.openstreetmap.org/' + esc(p.oid) + '" target="_blank" rel="noopener">OSM 객체 보기</a>' + SRC_NOTE;
  }
  function detailBuildingFeature(f) {
    if (f.properties.kind === 'building' || f.properties.kind === 'part') return f;
    var d = SJ.overlays.get('rt-dt-bld').data.features, oid = f.properties.oid;
    for (var i = 0; i < d.length; i++) if (d[i].properties.oid === oid && (d[i].properties.kind === 'building' || d[i].properties.kind === 'part')) return d[i];
    return f;
  }
  function detailBuildingPopup(f0, e) {
    var f = detailBuildingFeature(f0), p = f.properties || {}, t = tagsOf(p);
    var levels = t['building:levels'], under = t['building:levels:underground'];
    var hNote = p.hsrc === 'height' ? 'OSM height' : p.hsrc === 'levels' ? '층수×3 m 추정' : '정보 없음, 기본값';
    var inside = SJ.detail.placesInside(f.geometry).slice(0, 12);
    var list = inside.length ? '<p class="pp-muted">입점 ' + inside.length + (inside.length >= 12 ? '+' : '') + '곳: ' +
      inside.map(function (x) { return esc(x.properties.name) + (x.properties.level ? '(' + esc(x.properties.level) + '층)' : ''); }).join(', ') + '</p>' : '';
    var area = SJ.geo.polygonArea(f.geometry);
    return '<h3>' + esc(p.name || SJ.btypeKo(p.btype) || '건물') + '</h3><p class="pp-type">' + esc(SJ.useLabels[p.cat] || '') +
      (p.btype ? ' · ' + esc(SJ.btypeKo(p.btype)) : '') + (p.kind === 'part' ? ' (건물 일부)' : '') + '</p>' +
      dl([['높이', p.h + ' m (' + hNote + ')'], ['시작 높이', +p.b ? p.b + ' m' : ''], ['지상 층수', levels ? levels + '층' : ''], ['지하 층수', under ? under + '층' : ''],
        ['지붕', SJ.roofKo(p.roof)], ['외벽 색', t['building:colour'] || ''], ['외벽 재질', t['building:material'] || ''],
        ['바닥 면적', area > 1 ? '약 ' + U.fmtArea(area) : ''], ['주소', SJ.addrOf(t)], ['준공', t.start_date || ''], ['위치', coordText(e.lngLat)]]) +
      list + '<a href="https://www.openstreetmap.org/' + esc(p.oid) + '" target="_blank" rel="noopener">OSM 객체 보기</a>' +
      '<p class="pp-note">출처: OpenStreetMap 기여자 (건물 상세)</p>';
  }
  function smallPointPopup(f, e) {
    var p = f.properties, t = tagsOf(p);
    var title = p.kind === 'entrance' ? (p.name || '출입구') : '횡단보도';
    return '<h3>' + esc(title) + '</h3>' + dl([['종류', p.kind === 'entrance' ? (t.entrance === 'main' ? '주 출입구' : t.entrance === 'yes' ? '출입구' : t.entrance || '') : (t.crossing || '')],
      ['휠체어', t.wheelchair === 'yes' ? '가능' : t.wheelchair === 'no' ? '불가' : ''], ['위치', coordText(e.lngLat)]]) +
      '<a href="https://www.openstreetmap.org/' + esc(p.oid) + '" target="_blank" rel="noopener">OSM 객체 보기</a>';
  }
  function poiPopup(f, e) {
    var p = f.properties || {};
    var rich = f.geometry && f.geometry.type === 'Point' ? SJ.detail.findPlace(nameOf(p), f.geometry.coordinates) : null;
    if (rich) return placePopup(rich, e);
    var cat = SJ.poiCategoryOf(p.class, p.subclass);
    var en = p['name:en'] || p['name:latin'] || '';
    return '<h3>' + esc(nameOf(p)) + '</h3><p class="pp-type">' + esc(SJ.poiCategoryLabels[cat]) + ' · ' + esc(ko(p.subclass || p.class)) + '</p>' +
      dl([['영문', en !== nameOf(p) ? en : ''], ['층', p.level != null ? p.level : ''], ['위치', coordText(e.lngLat)]]) + osmLinkAt(e.lngLat);
  }
  function roadPopup(f, e) {
    var p = f.properties || {};
    var names = nearby(e.point, ['label-road', 'label-road-shield'], 14)[0];
    var np = names ? names.properties : {};
    var oneway = p.oneway === 1 ? '예' : p.oneway === -1 ? '예(역방향)' : '';
    return '<h3>' + esc(nameOf(np) || ko(p.subclass || p.class)) + '</h3><p class="pp-type">' + esc(ko(p.class)) + (p.subclass && p.subclass !== p.class ? ' · ' + esc(ko(p.subclass)) : '') + '</p>' +
      dl([['도로 번호', np.ref || ''], ['구조', p.brunnel ? ko(p.brunnel) : ''], ['일방통행', oneway], ['포장', p.surface === 'paved' ? '포장' : p.surface === 'unpaved' ? '비포장' : ''],
        ['층(layer)', p.layer || ''], ['위치', coordText(e.lngLat)]]) + osmLinkAt(e.lngLat);
  }
  function areaPopup(f, e, kind) {
    var p = f.properties || {};
    var n = nameOf(p);
    return '<h3>' + esc(n || ko(p.class) || kind) + '</h3><p class="pp-type">' + esc(kind) + (p.class ? ' · ' + esc(ko(p.class)) : '') + '</p>' +
      dl([['위치', coordText(e.lngLat)]]) + osmLinkAt(e.lngLat);
  }
  function overpassPopup(f, e) {
    var p = f.properties || {}, t = SJ.overpass.tags[p.oid] || {};
    var lid = f.layer.id;
    var title, type, rows = [];
    if (lid === 'ov-bus') { title = p.name || '버스 정류장'; type = '버스 정류장'; rows = [['정류장 번호', t.ref || t['ref:ko'] || ''], ['경유 노선', t.route_ref || ''], ['쉘터', t.shelter === 'yes' ? '있음' : t.shelter === 'no' ? '없음' : ''], ['벤치', t.bench === 'yes' ? '있음' : '']]; }
    else if (lid === 'ov-bike-rental') { title = p.name || '자전거 대여소'; type = '공공자전거 대여소'; rows = [['운영', t.operator || t.network || ''], ['거치대', t.capacity || '']]; }
    else if (/^ov-bike/.test(lid)) { title = p.name || '자전거 도로'; type = p.kind === 'track' ? '자전거 전용도로' : p.kind === 'shared' ? '자전거·보행자 겸용' : '자전거 차로'; rows = [['포장', t.surface || ''], ['일방통행', t.oneway === 'yes' ? '예' : '']]; }
    else if (/^ov-tree/.test(lid)) { title = p.name || '나무'; type = p.kind === 'tree_row' ? '가로수 줄' : '나무'; rows = [['수종', t['species:ko'] || t.species || t.genus || ''], ['높이', t.height ? t.height + ' m' : '정보 없음 (8 m 로 표시)'], ['잎 형태', t.leaf_type === 'broadleaved' ? '활엽수' : t.leaf_type === 'needleleaved' ? '침엽수' : '']]; }
    else if (/^ov-amenity/.test(lid)) { title = p.name || p.label; type = p.label; rows = [['운영', t.operator || ''], ['운영 시간', t.opening_hours || ''], ['요금', t.fee === 'yes' ? '유료' : t.fee === 'no' ? '무료' : ''], ['수용', t.capacity || '']]; }
    else if (/^ov-emd/.test(lid)) { title = p.name || '행정구역'; type = '읍·면·동'; rows = [['영문', p.name_en || ''], ['면적', p.area ? U.fmtArea(p.area) : ''], ['인구(OSM)', t.population || '']]; }
    rows.push(['위치', coordText(e.lngLat)]);
    return '<h3>' + esc(title) + '</h3><p class="pp-type">' + esc(type) + '</p>' + dl(rows) +
      (p.oid ? '<a href="https://www.openstreetmap.org/' + esc(p.oid) + '" target="_blank" rel="noopener">OSM 객체 보기</a>' : '');
  }

  var CLICK_ORDER = [
    ['dt-places', placePopup], ['dt-entrance', smallPointPopup],
    ['ov-bus', overpassPopup], ['ov-bike-rental', overpassPopup], ['ov-amenity', overpassPopup], ['label-poi', poiPopup],
    ['label-peak', function (f, e) { var p = f.properties; return '<h3>' + esc(nameOf(p)) + '</h3><p class="pp-type">산 · 봉우리</p>' + dl([['해발', p.ele != null ? Math.round(p.ele) + ' m' : ''], ['위치', coordText(e.lngLat)]]) + osmLinkAt(e.lngLat); }],
    ['ov-tree', overpassPopup], ['hover-building', null], ['dt-bld-label', detailBuildingPopup], ['dt-roof', detailBuildingPopup], ['dt-bld-cap', detailBuildingPopup],
    ['dt-bld-facade', detailBuildingPopup], ['dt-bld-3d', detailBuildingPopup],
    ['building-roof', buildingPopup], ['building-3d-facade', buildingPopup], ['building-3d', buildingPopup], ['building-flat', buildingPopup],
    ['dt-crossing', smallPointPopup],
    ['ov-bike-track', overpassPopup], ['ov-bike-lane', overpassPopup], ['ov-tree-row', overpassPopup],
    ['bridge-fill', roadPopup], ['road-fill', roadPopup], ['tunnel-fill', roadPopup], ['road-path', roadPopup], ['road-cycleway', roadPopup], ['road-rail', roadPopup], ['bridge-rail', roadPopup],
    ['ov-emd-fill', overpassPopup],
    ['water', function (f, e) { return areaPopup(f, e, '수역'); }], ['waterway', function (f, e) { return areaPopup(f, e, '하천'); }],
    ['park', function (f, e) { return areaPopup(f, e, '공원'); }],
  ];
  var BUILDING_LAYERS = ['building-3d', 'building-3d-facade', 'building-roof', 'building-flat', 'dt-bld-3d', 'dt-bld-facade', 'dt-bld-cap', 'dt-roof'];
  var HOVER_LAYERS = ['dt-places', 'dt-bld-label', 'dt-bld-cap', 'dt-roof', 'dt-bld-facade', 'dt-bld-3d', 'building-roof', 'building-3d-facade', 'building-3d', 'building-flat', 'label-poi', 'label-peak', 'ov-bus', 'ov-bike-rental', 'ov-amenity', 'ov-tree', 'ov-emd-fill', 'bridge-fill', 'road-fill'];

  function visibleLayers(list) {
    return list.filter(function (l) { return map.getLayer(l) && map.getLayoutProperty(l, 'visibility') !== 'none'; });
  }

  map.on('click', function (e) {
    if (SJ.measure.active) { SJ.measure.add(e.lngLat); return; }
    var layers = visibleLayers(CLICK_ORDER.map(function (c) { return c[0]; }));
    var feats = map.queryRenderedFeatures([[e.point.x - 3, e.point.y - 3], [e.point.x + 3, e.point.y + 3]], { layers: layers });
    if (!feats.length) { popup.remove(); return; }
    var best = null, fn = null, rank = 1e9;
    feats.forEach(function (f) {
      for (var i = 0; i < CLICK_ORDER.length; i++) {
        if (CLICK_ORDER[i][0] === f.layer.id && CLICK_ORDER[i][1] && i < rank) { rank = i; best = f; fn = CLICK_ORDER[i][1]; }
      }
    });
    if (!best) return;
    selectFeat = toHighlight(best, true);
    hoverData();
    SJ.openPopup(e.lngLat, fn(best, e));
  });

  // 마우스 강조 (requestAnimationFrame 으로 제한)
  var hoverPending = null, emdHover = '';
  map.on('mousemove', function (e) {
    updateCoord(e.lngLat);
    if (hoverPending) { hoverPending = e; return; }
    hoverPending = e;
    requestAnimationFrame(function () {
      var ev = hoverPending; hoverPending = null;
      if (!ev || map.isMoving() || SJ.measure.active) return;
      var layers = visibleLayers(HOVER_LAYERS);
      var feats = layers.length ? map.queryRenderedFeatures(ev.point, { layers: layers }) : [];
      var f = feats[0];
      map.getCanvas().style.cursor = f ? 'pointer' : '';
      var h = f && BUILDING_LAYERS.indexOf(f.layer.id) >= 0 ? toHighlight(f, false) : null;
      if (h || hoverFeat) { hoverFeat = h; hoverData(); }
      var emd = feats.filter(function (x) { return x.layer.id === 'ov-emd-fill'; })[0];
      var oid = emd ? emd.properties.oid : '';
      if (oid !== emdHover && map.getLayer('ov-emd-hover')) { emdHover = oid; map.setFilter('ov-emd-hover', ['==', ['get', 'oid'], oid]); }
    });
  });
  map.getCanvas().addEventListener('mouseleave', function () {
    if (hoverFeat) { hoverFeat = null; hoverData(); }
  });

  // ── 좌표·시점 표시 ──────────────────────────────────
  var lastLL = null;
  function updateCoord(ll) {
    lastLL = ll;
    var txt = ll.lat.toFixed(5) + '°N ' + ll.lng.toFixed(5) + '°E';
    if (map.getTerrain()) {
      var el = map.queryTerrainElevation(ll);
      if (el != null) txt += ' · 고도 ' + Math.round(el / (S.exaggeration || 1)) + ' m';
    }
    $('readout-coord').textContent = txt;
  }
  function updateView() {
    $('readout-view').textContent = '줌 ' + map.getZoom().toFixed(1) + ' · 기울기 ' + Math.round(map.getPitch()) + '° · 방위 ' + Math.round((map.getBearing() + 360) % 360) + '°';
  }
  map.on('move', updateView);
  // 마우스가 없는 기기(터치)에서는 화면 중심 좌표를 표시
  var noHover = window.matchMedia && window.matchMedia('(hover: none)').matches;
  if (noHover) map.on('moveend', function () { updateCoord(map.getCenter()); });
  $('readout-coord').addEventListener('click', function () {
    if (!lastLL) return;
    copy(lastLL.lat.toFixed(6) + ', ' + lastLL.lng.toFixed(6), '좌표를 복사했습니다');
  });
  function copy(text, okMsg) {
    var done = function () { toast(okMsg); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { window.prompt('복사하세요', text); });
    } else {
      window.prompt('아래 내용을 복사하세요', text);
    }
  }

  // ── 레이어 토글 ────────────────────────────────────
  function setVis(ids, on) {
    ids.forEach(function (id) { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); });
  }
  function applyLabels() {
    setVis(SJ.layerGroups.labels.filter(function (id) { return id !== 'label-poi' && id !== 'label-housenumber'; }), S.labels);
    setVis(['label-poi'], S.labels && S.poi);
    setVis(['label-housenumber'], S.labels && S.housenumbers);
    setVis(['dt-places'], S.labels && S.places);
    setVis(['dt-bld-label'], S.labels);
  }
  function applyBuildings() {
    restyle();
    hoverFeat = null; selectFeat = null; hoverData();
  }
  function applyBoundary() {
    SJ.overlays.setVisible('rt-sejong', S.boundary);
    SJ.overlays.setVisible('rt-sejong-mask', S.boundary);
  }
  function applyTerrain() {
    if (S.terrain) map.setTerrain({ source: 'dem-terrain', exaggeration: S.exaggeration });
    else map.setTerrain(null);
  }
  // 스타일 전체 재생성 (테마·색상·영문 병기) — diff 로 바뀐 부분만 적용
  function restyle() {
    var P = SJ.palette();
    var style = SJ.overlays.inject(SJ.buildStyle(P, S), P);
    map.setStyle(style, { diff: true });
    try { SJ.icons.refresh(map, P); } catch (e) { /* 스타일 재로딩 중이면 styleimagemissing 에서 처리 */ }
    applyThemeChrome();
    renderLegend();
    renderPlaces();
  }
  SJ.restyle = restyle;

  function bindCheck(id, key, fn) {
    var el = $(id);
    el.checked = !!S[key];
    el.addEventListener('change', function () { S[key] = el.checked; fn(); saveState(); });
  }
  bindCheck('chk-labels', 'labels', applyLabels);
  bindCheck('chk-poi', 'poi', applyLabels);
  bindCheck('chk-housenumbers', 'housenumbers', applyLabels);
  bindCheck('chk-latin', 'latin', restyle);
  bindCheck('chk-boundary', 'boundary', applyBoundary);
  bindCheck('chk-admin', 'adminLines', function () { setVis(SJ.layerGroups.adminLines, S.adminLines); });
  bindCheck('chk-hillshade', 'hillshade', function () { setVis(['hillshade'], S.hillshade); });
  bindCheck('chk-relief', 'relief', function () { setVis(['color-relief'], S.relief); });
  bindCheck('chk-terrain', 'terrain', function () {
    applyTerrain();
    if (S.terrain && map.getPitch() < 40) map.easeTo({ pitch: 60, duration: 1000 });
  });

  function bindRadio(name, key, fn) {
    var els = document.querySelectorAll('input[name=' + name + ']');
    Array.prototype.forEach.call(els, function (el) {
      el.checked = el.value === S[key];
      el.addEventListener('change', function () { if (el.checked) { S[key] = el.value; fn(); saveState(); } });
    });
  }
  function syncRadio(name, value) {
    Array.prototype.forEach.call(document.querySelectorAll('input[name=' + name + ']'), function (el) { el.checked = el.value === value; });
  }
  bindRadio('bmode', 'buildings', applyBuildings);
  bindRadio('bcolor', 'colorMode', applyBuildings);
  bindCheck('chk-facade', 'facade', applyBuildings);
  bindCheck('chk-bld-detail', 'bldDetail', function () { SJ.detail.setEnabled(map, 'buildings', S.bldDetail); applyBuildings(); });
  bindCheck('chk-places', 'places', function () { SJ.detail.setEnabled(map, 'places', S.places); applyLabels(); });

  var exag = $('rng-exag');
  exag.value = S.exaggeration; $('out-exag').textContent = S.exaggeration.toFixed(1) + '×';
  exag.addEventListener('input', function () {
    S.exaggeration = +exag.value;
    $('out-exag').textContent = S.exaggeration.toFixed(1) + '×';
    if (S.terrain) applyTerrain();
  });
  exag.addEventListener('change', saveState);

  // ── 범례 ───────────────────────────────────────────
  function renderLegend() {
    var P = SJ.palette(), useMode = S.colorMode === 'use';
    $('legend').classList.toggle('off', S.buildings === 'off' || S.colorMode === 'solid' || S.colorMode === 'osm');
    $('legend-bar').hidden = useMode; $('legend-ticks').hidden = useMode;
    var sw = $('legend-use');
    sw.hidden = !useMode;
    if (useMode) {
      sw.innerHTML = SJ.useCategories.map(function (c) {
        return '<span><i style="background:' + P.buildingUse[c] + '"></i>' + esc(SJ.useLabels[c]) + '</span>';
      }).join('');
    }
    var ramp = P.buildingRamp, max = ramp[ramp.length - 1][0];
    $('legend-bar').style.background = 'linear-gradient(to right,' + ramp.map(function (s) { return s[1] + ' ' + (s[0] / max * 100).toFixed(1) + '%'; }).join(',') + ')';
    $('legend-ticks').innerHTML = [0, 20, 40, 70, 110, 160].map(function (v) {
      return '<span style="left:' + (v / max * 100) + '%">' + v + (v === max ? 'm+' : '') + '</span>';
    }).join('');
  }
  renderLegend();

  // ── 시간·조명 ──────────────────────────────────────
  var timeEl = $('rng-time');
  var lightRaf = 0;
  function applyLight() {
    lightRaf = 0;
    var L = SJ.lighting.compute(S.timeMin, SJ.palette());
    SJ.icons.setNight(map, SJ.palette(), L.sun.altitude < -4);
    map.setLight(L.light);
    map.setSky(L.sky);
    if (map.getLayer('hillshade')) {
      map.setPaintProperty('hillshade', 'hillshade-illumination-direction', L.hillDirection);
      map.setPaintProperty('hillshade', 'hillshade-illumination-altitude', L.hillAltitude);
    }
    $('out-time').textContent = SJ.lighting.fmt(S.timeMin);
    var a = L.sun.altitude;
    $('sun-info').textContent = a > -0.8
      ? '태양 고도 ' + a.toFixed(0) + '° · 방위 ' + L.sun.azimuth.toFixed(0) + '° (오늘 날짜, 세종 기준 계산)'
      : '해가 진 시간입니다 (태양 고도 ' + a.toFixed(0) + '°)';
  }
  function setTime(m, save) {
    S.timeMin = ((Math.round(m) % 1440) + 1440) % 1440;
    timeEl.value = S.timeMin;
    if (!lightRaf) lightRaf = requestAnimationFrame(applyLight);
    if (save) writeHash();
  }
  timeEl.value = S.timeMin;
  timeEl.addEventListener('input', function () { stopDayCycle(); setTime(+timeEl.value, false); });
  timeEl.addEventListener('change', function () { writeHash(); });
  $('btn-now').addEventListener('click', function () { stopDayCycle(); setTime(SJ.lighting.nowMinutes(), true); });
  var dayTimer = null;
  function stopDayCycle() {
    if (!dayTimer) return;
    clearInterval(dayTimer); dayTimer = null;
    $('btn-daycycle').setAttribute('aria-pressed', 'false');
    writeHash();
  }
  $('btn-daycycle').addEventListener('click', function () {
    if (dayTimer) { stopDayCycle(); return; }
    $('btn-daycycle').setAttribute('aria-pressed', 'true');
    dayTimer = setInterval(function () { setTime(S.timeMin + 6, false); }, 80);
  });

  // ── 바로 가기 ──────────────────────────────────────
  var placesEl = $('places');
  function renderPlaces() {
    if (placesEl.childElementCount) return;
    C.landmarks.forEach(function (lm, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = (i < 9 ? '<span class="num">' + (i + 1) + '</span>' : '') + esc(lm.name);
      b.title = lm.name + (i < 9 ? ' (' + (i + 1) + ')' : '');
      b.addEventListener('click', function () { goLandmark(i); });
      placesEl.appendChild(b);
    });
  }
  renderPlaces();
  function goLandmark(i) {
    var lm = C.landmarks[i];
    if (!lm) return;
    stopMotion();
    setStatus(lm.name + ' 위치를 찾는 중…');
    SJ.resolveLandmark(lm).then(function (res) {
      map.flyTo({ center: res.center, zoom: lm.zoom, pitch: 62, bearing: lm.bearing, duration: 2800, essential: true });
      setStatus(res.source === 'approx'
        ? lm.name + ': 검색에 실패해 대략적인 위치로 이동했습니다.'
        : lm.name + ' (OSM 검색 결과 위치)', res.source === 'approx');
    }).catch(function (err) {
      setStatus(lm.name + ': ' + SJ.net.errorText(err, '위치 검색'), true);
    });
  }
  function flyHome() {
    stopMotion();
    map.fitBounds(SJ.boundary.bounds, { padding: fitPadding(), pitch: 45, bearing: -15, duration: 2000 });
  }
  function fitPadding() {
    if (window.innerWidth <= 720) return { top: 50, bottom: 90, left: 20, right: 20 };
    return { top: 40, bottom: 40, left: 340, right: 60 };
  }
  $('btn-home').addEventListener('click', flyHome);

  // ── 검색 ───────────────────────────────────────────
  var resultsEl = $('search-results');
  $('search-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var q = $('search-input').value.trim();
    if (!q) return;
    var btn = $('search-btn');
    btn.disabled = true;
    resultsEl.hidden = false;
    resultsEl.innerHTML = '<li class="r-empty">검색 중…</li>';
    SJ.search(q).then(function (list) {
      if (!list.length) { resultsEl.innerHTML = '<li class="r-empty">세종시 안에서 "' + esc(q) + '" 검색 결과가 없습니다.</li>'; return; }
      resultsEl.innerHTML = '';
      list.forEach(function (r, i) {
        var li = document.createElement('li'), b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = '<span class="r-name">' + esc(r.name) + '</span><span class="r-meta">' + esc([r.type, r.address].filter(Boolean).join(' · ')) + '</span>';
        b.addEventListener('click', function () { stopMotion(); SJ.showSearchResult(map, r); if (window.innerWidth <= 720) collapse(true); });
        li.appendChild(b); resultsEl.appendChild(li);
        if (i === 0) SJ.showSearchResult(map, r);
      });
    }).catch(function (err) {
      resultsEl.innerHTML = '<li class="r-empty">' + esc(err && err.message && !err.status && !err.timeout && err.message.indexOf('잠시') === 0 ? err.message : SJ.net.errorText(err, '검색')) + '</li>';
    }).then(function () { btn.disabled = false; });
  });
  $('search-input').addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { $('search-input').blur(); resultsEl.hidden = true; }
    if (e.key === 'ArrowDown') { var f = resultsEl.querySelector('button'); if (f) { e.preventDefault(); f.focus(); } }
  });
  resultsEl.addEventListener('keydown', function (e) {
    var bs = Array.prototype.slice.call(resultsEl.querySelectorAll('button')), i = bs.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && i < bs.length - 1) { e.preventDefault(); bs[i + 1].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? bs[i - 1] : $('search-input')).focus(); }
  });

  // ── Overpass 레이어 UI ─────────────────────────────
  var ovList = $('ov-list');
  Object.keys(SJ.overpass.defs).forEach(function (id) {
    var d = SJ.overpass.defs[id];
    var wrap = document.createElement('div');
    wrap.className = 'ov-item';
    wrap.innerHTML = '<label class="row"><span>' + esc(d.label) + (d.minZoom ? ' <small class="hint">줌 ' + d.minZoom + '+</small>' : '') +
      '</span><input type="checkbox" id="ov-' + id + '"></label><span class="ov-status" id="ov-st-' + id + '"></span>';
    ovList.appendChild(wrap);
    wrap.querySelector('input').addEventListener('change', function (e) {
      SJ.overpass.setEnabled(map, id, e.target.checked);
      writeHash();
    });
  });
  SJ.overpass.onStatus = function (id, text, kind) {
    var el = $('ov-st-' + id);
    if (!el) return;
    el.textContent = text;
    el.className = 'ov-status ' + (kind || '');
  };

  // ── 측정 ───────────────────────────────────────────
  var M = SJ.measure;
  function measureUI() {
    $('btn-measure').setAttribute('aria-pressed', M.active ? 'true' : 'false');
    $('btn-measure-close').setAttribute('aria-pressed', M.closed ? 'true' : 'false');
    $('measure-box').hidden = !M.active && !M.points.length;
    var n = M.points.length;
    var txt = n < 2 ? (M.active ? '지도를 클릭해 지점을 추가하세요. 더블클릭 또는 Enter 로 끝냅니다.' : '')
      : '총 거리 <strong>' + U.fmtDist(M.total() + (M.closed && n > 2 ? SJ.geo.distance(M.points[n - 1], M.points[0]) : 0)) + '</strong> · 지점 ' + n + '개';
    if (M.closed && n > 2) txt += '<br>면적 <strong>' + U.fmtArea(M.area()) + '</strong>';
    $('measure-text').innerHTML = txt;
    drawProfile();
  }
  function drawProfile() {
    var svg = $('profile'), pt = $('profile-text');
    var prof = M.points.length > 1 ? M.profile(map, S.exaggeration) : null;
    if (!prof) {
      svg.hidden = true;
      pt.hidden = M.points.length < 2;
      pt.textContent = '3D 지형을 켜면 고도 단면이 표시됩니다.';
      return;
    }
    var min = Infinity, max = -Infinity;
    prof.forEach(function (p) { min = Math.min(min, p.e); max = Math.max(max, p.e); });
    var span = Math.max(10, max - min), total = prof[prof.length - 1].d || 1;
    var pts = prof.map(function (p) { return (p.d / total * 240).toFixed(1) + ',' + (66 - (p.e - min) / span * 60).toFixed(1); });
    var accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    svg.innerHTML = '<polygon points="0,70 ' + pts.join(' ') + ' 240,70" fill="' + accent + '" fill-opacity="0.25"/>' +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + accent + '" stroke-width="1.5" vector-effect="non-scaling-stroke"/>';
    svg.hidden = false; pt.hidden = false;
    pt.textContent = '고도 단면: 최저 ' + Math.round(min) + ' m · 최고 ' + Math.round(max) + ' m (지형 타일 해상도 기준 근사)';
  }
  M.onChange = measureUI;
  function toggleMeasure() {
    if (M.active) { M.stop(); } else { stopMotion(); popup.remove(); M.start(map); }
    measureUI();
  }
  $('btn-measure').addEventListener('click', toggleMeasure);
  $('btn-measure-clear').addEventListener('click', function () { M.clear(); if (!M.active) $('measure-box').hidden = true; });
  $('btn-measure-undo').addEventListener('click', function () { M.undo(); });
  $('btn-measure-close').addEventListener('click', function () { M.closed = !M.closed; M.update(); });
  map.on('dblclick', function () { if (M.active) { M.stop(); measureUI(); } });
  map.on('idle', function () { if (M.points.length > 1 && map.getTerrain() && $('profile').hidden) drawProfile(); });

  // ── 자동 회전 / 투어 ────────────────────────────────
  SJ.orbit.onChange = function () { $('btn-orbit').setAttribute('aria-pressed', SJ.orbit.active ? 'true' : 'false'); };
  SJ.tour.onChange = function () {
    var b = $('btn-tour');
    b.setAttribute('aria-pressed', SJ.tour.active ? 'true' : 'false');
    b.firstChild.nodeValue = SJ.tour.active ? '투어 중지 ' : '투어 시작 ';
  };
  SJ.tour.onCaption = function (name, i, n, src) {
    var c = $('caption');
    if (!name) { c.hidden = true; return; }
    c.hidden = false;
    c.innerHTML = esc(name) + '<small>' + i + ' / ' + n + (src === 'approx' ? ' · 대략적 위치' : '') + ' · Esc 로 중지</small>';
  };
  function stopMotion() { SJ.orbit.stop(); SJ.tour.stop(); }
  $('btn-orbit').addEventListener('click', function () { if (SJ.orbit.active) SJ.orbit.stop(); else { SJ.tour.stop(); SJ.orbit.start(map); } });
  $('btn-tour').addEventListener('click', function () { if (SJ.tour.active) SJ.tour.stop(); else SJ.tour.start(map); });
  // 사용자가 직접 조작하면 자동 카메라 중지
  ['mousedown', 'touchstart', 'wheel'].forEach(function (ev) {
    map.getCanvasContainer().addEventListener(ev, function () { if (SJ.orbit.active || SJ.tour.active) stopMotion(); }, { passive: true });
  });

  // ── 공유 / 저장 ─────────────────────────────────────
  function share() { writeHash(); copy(location.href, '현재 화면 링크를 복사했습니다'); }
  $('btn-share').addEventListener('click', share);
  function shot() {
    setStatus('화면을 저장하는 중…');
    SJ.screenshot(map, '세종특별자치시 3D 지도').then(function (name) { setStatus(name + ' 로 저장했습니다.'); toast('이미지를 저장했습니다'); },
      function (err) { console.warn(err); setStatus('화면 저장에 실패했습니다.', true); });
  }
  $('btn-shot').addEventListener('click', shot);

  // ── 테마 ───────────────────────────────────────────
  function toggleTheme() {
    S.theme = S.theme === 'dark' ? 'light' : 'dark';
    restyle();
    themeIcon();
    saveState();
    toast(SJ.palette().label + ' 테마');
  }
  function themeIcon() {
    var b = $('btn-theme'), dark = S.theme === 'dark';
    b.innerHTML = dark
      ? '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="4" fill="currentColor"/><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6L16 16M4 16l1.4-1.4M14.6 5.4L16 4"/></g></svg>'
      : '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M15.5 12.8A6.5 6.5 0 0 1 7.2 4.5a6.5 6.5 0 1 0 8.3 8.3z" fill="currentColor"/></svg>';
    b.setAttribute('aria-label', dark ? '라이트 테마로 전환 (D)' : '다크 테마로 전환 (D)');
    b.title = b.getAttribute('aria-label');
  }
  themeIcon();
  $('btn-theme').addEventListener('click', toggleTheme);

  // ── 패널 접기 (휴대폰) ─────────────────────────────
  var panel = $('panel'), collapseBtn = $('btn-collapse');
  function collapse(on) {
    panel.classList.toggle('collapsed', on);
    collapseBtn.setAttribute('aria-expanded', on ? 'false' : 'true');
    collapseBtn.setAttribute('aria-label', on ? '패널 펼치기' : '패널 접기');
  }
  collapseBtn.addEventListener('click', function () { collapse(!panel.classList.contains('collapsed')); });
  if (window.innerWidth <= 720) collapse(true);

  // ── 도움말 / 단축키 ────────────────────────────────
  var help = $('help');
  function openHelp() { if (help.showModal) { if (!help.open) help.showModal(); } else help.setAttribute('open', ''); }
  $('btn-help').addEventListener('click', openHelp);

  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) && e.target.type !== 'checkbox' && e.target.type !== 'radio' && e.target.type !== 'range') return;
    if (help.open) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key;
    if (k === 'Escape') {
      if (M.active) { M.stop(); measureUI(); }
      stopMotion(); popup.remove(); resultsEl.hidden = true;
      return;
    }
    if (k === 'Enter' && M.active && e.target === map.getCanvas()) { M.stop(); measureUI(); return; }
    if (k === 'Backspace' && M.active) { e.preventDefault(); M.undo(); return; }
    var handled = true;
    switch (k.toLowerCase()) {
      case '/': $('search-input').focus(); if (panel.classList.contains('collapsed')) collapse(false); break;
      case '?': openHelp(); break;
      case 'h': openHelp(); break;
      case 'c': flyHome(); break;
      case 'b': S.buildings = { '3d': 'flat', flat: 'off', off: '3d' }[S.buildings]; syncRadio('bmode', S.buildings); applyBuildings(); saveState(); toast('건물: ' + { '3d': '3D', flat: '평면', off: '끄기' }[S.buildings]); break;
      case 't': $('chk-terrain').click(); toast('3D 지형 ' + (S.terrain ? '켜짐' : '꺼짐')); break;
      case 'l': $('chk-labels').click(); toast('라벨 ' + (S.labels ? '켜짐' : '꺼짐')); break;
      case 'd': toggleTheme(); break;
      case 'm': toggleMeasure(); break;
      case 'r': $('btn-orbit').click(); break;
      case 'p': $('btn-tour').click(); break;
      case 's': shot(); break;
      case 'u': share(); break;
      case 'n': map.easeTo({ bearing: 0, pitch: 0, duration: 800 }); break;
      case '[': stopDayCycle(); setTime(S.timeMin - 30, true); break;
      case ']': stopDayCycle(); setTime(S.timeMin + 30, true); break;
      default:
        if (/^[1-9]$/.test(k)) goLandmark(+k - 1); else handled = false;
    }
    if (handled) e.preventDefault();
  });

  // ── 상세 데이터 상태 표시 (작고 방해되지 않게) ───────────
  var pillTimer;
  function detailPill(c) {
    var el = $('detail-pill');
    clearTimeout(pillTimer);
    if (!c.wanted) { el.hidden = true; return; }
    el.hidden = false;
    el.classList.toggle('err', c.failed > 0 && !c.loading);
    if (c.loading) el.textContent = '상호·건물 정보 불러오는 중 ' + c.loaded + '/' + c.wanted;
    else if (c.failed) el.textContent = '일부 구역 정보를 못 불러옴 · ' + (c.backoff > 0 ? Math.ceil(c.backoff / 1000) + '초 뒤 ' : '잠시 뒤 ') + '재시도';
    else { el.textContent = '상호·건물 정보 ' + c.loaded + '/' + c.wanted + ' 구역'; pillTimer = setTimeout(function () { el.hidden = true; }, 2500); }
  }

  // ── 로드 완료 ──────────────────────────────────────
  map.on('load', function () {
    clearTimeout(slowTimer);
    loadingEl.classList.add('done');
    setTimeout(function () { loadingEl.hidden = true; }, 600);
    if (!errShown.omt) setStatus('우클릭 드래그(모바일: 두 손가락)로 회전·기울이기, 건물·장소를 클릭하면 정보가 표시됩니다. 단축키는 ? 키.');
    updateView();
    if (noHover) updateCoord(map.getCenter());
    writeHash();
    if (window.innerWidth <= 720) {
      var attrib = document.querySelector('.maplibregl-ctrl-attrib');
      if (attrib) attrib.classList.remove('maplibregl-compact-show'); // 좁은 화면에서는 ⓘ 로 접어 둠
    }
    applyLight();
    applyBuildings();
    if (!hasMapHash) map.fitBounds(C.fallbackBounds, { padding: fitPadding(), pitch: 45, bearing: -15, duration: 0 });
    SJ.loadBoundary().then(function () {
      applyBoundary();
      if (!hasMapHash) flyHome();
      if (SJ.boundary.area) $('btn-home').title = '세종시 면적 약 ' + U.fmtArea(SJ.boundary.area) + ' (OSM 경계 기준)';
    }).catch(function (err) {
      console.warn('세종시 경계 로드 실패:', err);
      $('chk-boundary').disabled = true;
      setStatus('세종시 경계를 불러오지 못해 대략적인 범위를 사용합니다. (' + SJ.net.errorText(err, '경계 요청') + ')', true);
    });
    SJ.overpass.attach(map);
    SJ.detail.onCover = function () {
      var f = SJ.tileBuildingFilter(S);
      SJ.BUILDING_TILE_LAYERS.forEach(function (id) { if (map.getLayer(id)) map.setFilter(id, f); });
    };
    SJ.detail.onStatus = detailPill;
    SJ.detail.setEnabled(map, 'places', S.places, true);
    SJ.detail.setEnabled(map, 'buildings', S.bldDetail, true);
    SJ.detail.attach(map);
    ovFromHash.forEach(function (id) { var el = $('ov-' + id); if (el) { el.checked = true; SJ.overpass.setEnabled(map, id, true); } });
    if (location.protocol === 'file:') console.info('[세종 3D 지도] file:// 로 열었습니다. 일부 브라우저는 file:// 에서 Referer 를 보내지 않아 Nominatim 이 요청을 거부할 수 있습니다.');
  });

  window.addEventListener('hashchange', function () { readHash(); });
})();
