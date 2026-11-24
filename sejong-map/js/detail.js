/*
 * 세종 3D 지도 — 거리 수준 상세 데이터 (상호·시설명, 건물 상세)
 *
 * 구조
 *  - 셀(cell): 줌 15 타일 격자 한 칸(약 1 km²) 단위로 요청·캐시합니다.
 *  - 공급자(provider): 셀 하나의 데이터를 가져오는 함수. 지금은 Overpass(OSM) 하나뿐이며,
 *    SJ.detail.providers 에 같은 형태({ fetch(layerId, bbox, ctl) → Promise<features> })를 추가하면
 *    다른 출처(예: 키가 필요한 상용 API)를 꽂을 수 있습니다.
 *  - 캐시: 메모리 + IndexedDB(최대 CACHE_MAX 셀, 7일). IndexedDB 를 못 쓰면 메모리만 사용.
 *  - Overpass 요청은 SJ.net.overpass 큐 하나로 모든 레이어가 공유합니다(동시에 1개, 간격·백오프).
 *    화면에서 벗어난 셀은 차례가 와도 요청하지 않고, 진행 중이면 취소합니다.
 */
(function () {
  'use strict';
  var SJ = (window.SJ = window.SJ || {});
  var C = SJ.config;

  var CELL_Z = 15;
  var CACHE_VERSION = 'v1';
  var CACHE_MAX = 120;
  var CACHE_TTL = 7 * 24 * 3600 * 1000;
  var MARGIN_DEG = 0.0006; // 셀 경계에 걸친 건물을 온전히 받기 위한 여유(약 60 m)

  // ── 셀 계산 ─────────────────────────────────────────
  function lng2x(lng) { return Math.floor((lng + 180) / 360 * Math.pow(2, CELL_Z)); }
  function lat2y(lat) {
    var r = lat * Math.PI / 180;
    return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, CELL_Z));
  }
  function x2lng(x) { return x / Math.pow(2, CELL_Z) * 360 - 180; }
  function y2lat(y) { var n = Math.PI - 2 * Math.PI * y / Math.pow(2, CELL_Z); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); }
  function cellBox(x, y) { return [x2lng(x), y2lat(y + 1), x2lng(x + 1), y2lat(y)]; } // [서, 남, 동, 북]

  // 화면 중심 주변(반경 제한)의 셀 목록, 가까운 순
  function wantedCells(map) {
    var b = map.getBounds(), c = map.getCenter();
    var phone = window.innerWidth <= 720;
    var rM = phone ? 600 : 850;
    var dLat = rM / 111320, dLng = rM / (111320 * Math.cos(c.lat * Math.PI / 180));
    var w = Math.max(b.getWest(), c.lng - dLng), e = Math.min(b.getEast(), c.lng + dLng);
    var s = Math.max(b.getSouth(), c.lat - dLat), n = Math.min(b.getNorth(), c.lat + dLat);
    var out = [];
    for (var x = lng2x(w); x <= lng2x(e); x++) {
      for (var y = lat2y(n); y <= lat2y(s); y++) {
        var bx = cellBox(x, y);
        var cx = (bx[0] + bx[2]) / 2, cy = (bx[1] + bx[3]) / 2;
        out.push({ key: CELL_Z + '/' + x + '/' + y, box: bx, d: Math.hypot((cx - c.lng) * Math.cos(c.lat * Math.PI / 180), cy - c.lat) });
      }
    }
    out.sort(function (a, b2) { return a.d - b2.d; });
    return out.slice(0, phone ? 4 : 6);
  }

  // ── IndexedDB 캐시 ───────────────────────────────────
  var idb = null;
  var idbReady = new Promise(function (resolve) {
    try {
      if (!window.indexedDB) return resolve(null);
      var req = indexedDB.open('sejong-map-cells', 1);
      req.onupgradeneeded = function () {
        var st = req.result.createObjectStore('cells', { keyPath: 'k' });
        st.createIndex('t', 't');
      };
      req.onsuccess = function () { idb = req.result; resolve(idb); };
      req.onerror = function () { resolve(null); };
      req.onblocked = function () { resolve(null); };
    } catch (e) { resolve(null); }
  });
  function idbGet(k) {
    return idbReady.then(function (db) {
      if (!db) return null;
      return new Promise(function (res) {
        try {
          var r = db.transaction('cells').objectStore('cells').get(k);
          r.onsuccess = function () {
            var v = r.result;
            res(v && v.ver === CACHE_VERSION && Date.now() - v.t < CACHE_TTL ? v.data : null);
          };
          r.onerror = function () { res(null); };
        } catch (e) { res(null); }
      });
    });
  }
  function idbPut(k, data) {
    idbReady.then(function (db) {
      if (!db) return;
      try {
        var tx = db.transaction('cells', 'readwrite'), st = tx.objectStore('cells');
        st.put({ k: k, t: Date.now(), ver: CACHE_VERSION, data: data });
        var cnt = st.count();
        cnt.onsuccess = function () {
          var extra = cnt.result - CACHE_MAX;
          if (extra <= 0) return;
          var cur = st.index('t').openCursor();
          cur.onsuccess = function () {
            var c = cur.result;
            if (c && extra-- > 0) { c.delete(); c.continue(); }
          };
        };
      } catch (e) { /* 저장 실패는 무시 (메모리 캐시만 사용) */ }
    });
  }

  // ── 태그 해석 도우미 ─────────────────────────────────
  function num(v) {
    if (v == null) return null;
    var m = String(v).replace(',', '.').match(/-?\d+(\.\d+)?/);
    if (!m) return null;
    var n = parseFloat(m[0]);
    if (/ft|'/.test(String(v))) n *= 0.3048;
    return isFinite(n) ? n : null;
  }
  var r6 = function (v) { return Math.round(v * 1e6) / 1e6; };
  function ring(geom) { return geom.map(function (g) { return [r6(g.lon), r6(g.lat)]; }); }
  function closed(r) { return r.length >= 4 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]; }
  var KEEP_TAGS = /^(name|name:ko|name:en|brand|brand:ko|operator|shop|amenity|office|craft|tourism|leisure|healthcare|cuisine|phone|contact:phone|contact:website|website|opening_hours|level|addr:.*|building.*|height|min_height|roof:.*|description|wheelchair|emergency|denomination|religion|start_date|entrance|crossing.*|ref|population)$/;
  function slimTags(t) {
    var o = {};
    for (var k in t) if (KEEP_TAGS.test(k)) o[k] = String(t[k]).slice(0, 200);
    return o;
  }
  function addrOf(t) {
    if (t['addr:full']) return t['addr:full'];
    var parts = [t['addr:city'], t['addr:district'], t['addr:suburb'], t['addr:street'] || t['addr:place'], t['addr:housenumber']].filter(Boolean);
    return parts.join(' ');
  }
  SJ.addrOf = addrOf;

  // 건물 용도 범주
  var USE = {
    res: ['apartments', 'residential', 'house', 'detached', 'semidetached_house', 'terrace', 'dormitory', 'bungalow', 'villa', 'farm'],
    com: ['commercial', 'retail', 'office', 'hotel', 'supermarket', 'kiosk', 'mall', 'shop'],
    pub: ['government', 'public', 'civic', 'townhall', 'fire_station', 'police', 'library', 'community_centre', 'post_office', 'courthouse', 'museum'],
    edu: ['school', 'university', 'college', 'kindergarten'],
    med: ['hospital', 'clinic'],
    ind: ['industrial', 'warehouse', 'factory', 'manufacture', 'service', 'storage_tank', 'barn', 'greenhouse'],
    rel: ['church', 'temple', 'chapel', 'mosque', 'cathedral', 'shrine', 'religious', 'monastery'],
    tra: ['train_station', 'transportation', 'parking', 'garage', 'garages', 'carport', 'hangar'],
  };
  SJ.useCategories = ['res', 'com', 'pub', 'edu', 'med', 'ind', 'rel', 'tra', 'oth'];
  SJ.useLabels = { res: '주거', com: '상업·업무', pub: '공공', edu: '교육', med: '의료', ind: '산업·창고', rel: '종교', tra: '교통·주차', oth: '기타·미상' };
  var BTYPE_KO = {
    apartments: '아파트', residential: '주거', house: '단독주택', detached: '단독주택', terrace: '연립주택', dormitory: '기숙사',
    commercial: '상업', retail: '상가', office: '업무', hotel: '호텔', supermarket: '대형마트', government: '관공서', public: '공공',
    civic: '공공', school: '학교', university: '대학', college: '대학', kindergarten: '유치원', hospital: '병원', clinic: '의원',
    industrial: '산업', warehouse: '창고', factory: '공장', church: '교회', temple: '사찰', religious: '종교', train_station: '역사',
    transportation: '교통시설', parking: '주차', garage: '차고', garages: '차고', yes: '건물(용도 미상)', roof: '지붕 구조물',
    fire_station: '소방서', police: '경찰', library: '도서관', museum: '박물관', greenhouse: '온실', service: '설비', farm: '농가',
  };
  SJ.btypeKo = function (v) { return BTYPE_KO[v] || v || ''; };
  var ROOF_KO = { flat: '평지붕', gabled: '박공지붕', hipped: '모임지붕', pyramidal: '피라미드형', dome: '돔', skillion: '외쪽지붕', round: '아치형', gambrel: '맞배 꺾임지붕', mansard: '망사드', 'half-hipped': '반모임지붕', onion: '양파형' };
  SJ.roofKo = function (v) { return ROOF_KO[v] || v || ''; };
  function useOf(t) {
    var v = t.building || t['building:part'];
    for (var k in USE) if (USE[k].indexOf(v) >= 0) return k;
    var a = t.amenity || '';
    if (/school|college|university|kindergarten/.test(a)) return 'edu';
    if (/hospital|clinic|doctors/.test(a)) return 'med';
    if (/townhall|police|fire_station|library|courthouse|post_office/.test(a) || t.office === 'government') return 'pub';
    if (a === 'place_of_worship') return 'rel';
    if (t.shop || t.office) return 'com';
    return 'oth';
  }

  // ── 건물 상세 파서 ───────────────────────────────────
  var STOREY = 3.0;
  function buildingFeatures(elements) {
    var bld = [], parts = [], pts = [];
    function push(el, coords) {
      var t = el.tags || {};
      var isPart = !!t['building:part'] && !t.building;
      var levels = num(t['building:levels']);
      var minLevel = num(t['building:min_level']);
      var roofH = num(t['roof:height']);
      var roofLv = num(t['roof:levels']);
      var shape = t['roof:shape'] || '';
      if (roofH == null && roofLv != null) roofH = roofLv * STOREY;
      var height = num(t.height);
      var est = 0, src = 'height';
      var top;
      if (height != null) top = height;
      else if (levels != null) { top = levels * STOREY + (roofH || 0); src = 'levels'; }
      else { top = C.defaultBuildingHeight; est = 1; src = 'default'; }
      var hasRoof = shape && shape !== 'flat';
      if (hasRoof && roofH == null) roofH = Math.min(3, top * 0.3);
      var wallTop = hasRoof ? Math.max(1, top - roofH) : top;
      var base = num(t.min_height);
      if (base == null && minLevel != null) base = minLevel * STOREY;
      base = base || 0;
      if (wallTop <= base) wallTop = base + 1;
      var oid = el.type + '/' + el.id;
      var props = {
        kind: isPart ? 'part' : 'building', oid: oid,
        name: t['name:ko'] || t.name || t['addr:housename'] || '',
        btype: t['building:part'] && isPart ? t['building:part'] : (t.building || ''),
        cat: useOf(t), h: Math.round(wallTop * 10) / 10, b: Math.round(base * 10) / 10, est: est, hsrc: src,
        colour: t['building:colour'] || t.colour || '', roofColour: t['roof:colour'] || '', roof: shape,
        tg: JSON.stringify(slimTags(t)),
      };
      var geom = coords.length === 1 ? { type: 'Polygon', coordinates: coords[0] } : { type: 'MultiPolygon', coordinates: coords };
      var f = { type: 'Feature', properties: props, geometry: geom };
      (isPart ? parts : bld).push(f);
      if (hasRoof) roofTiers(f, roofH, wallTop);
    }
    var roofs = [];
    function roofTiers(f, roofH, wallTop) {
      var g = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates[0];
      var outer = g[0], cx = 0, cy = 0;
      for (var i = 0; i < outer.length - 1; i++) { cx += outer[i][0]; cy += outer[i][1]; }
      cx /= outer.length - 1; cy /= outer.length - 1;
      var shape = f.properties.roof;
      var tiers = shape === 'skillion' ? [[0.92, 0.5]] : shape === 'dome' || shape === 'onion' || shape === 'round' ? [[0.85, 0.45], [0.6, 0.8], [0.3, 1]] : [[0.75, 0.5], [0.4, 1]];
      var prev = wallTop;
      tiers.forEach(function (tr) {
        var sc = tr[0];
        var r = outer.map(function (p) { return [r6(cx + (p[0] - cx) * sc), r6(cy + (p[1] - cy) * sc)]; });
        var top = wallTop + roofH * tr[1];
        roofs.push({ type: 'Feature', properties: { kind: 'roof', oid: f.properties.oid, h: Math.round(top * 10) / 10, b: Math.round(prev * 10) / 10, roofColour: f.properties.roofColour, cat: f.properties.cat },
          geometry: { type: 'Polygon', coordinates: [r] } });
        prev = top;
      });
    }
    elements.forEach(function (el) {
      var t = el.tags || {};
      if (el.type === 'way' && el.geometry && (t.building || t['building:part'])) {
        var r = ring(el.geometry);
        if (closed(r)) push(el, [[r]]);
      } else if (el.type === 'relation' && el.members && (t.building || t['building:part'])) {
        var outer = [], inner = [];
        el.members.forEach(function (m) {
          if (m.type !== 'way' || !m.geometry) return;
          (m.role === 'inner' ? inner : outer).push(ring(m.geometry));
        });
        var os = SJ.overpass._stitch(outer), is = SJ.overpass._stitch(inner);
        if (!os.length) return;
        var polys = os.map(function (o) { return [o]; });
        is.forEach(function (h) { for (var i = 0; i < polys.length; i++) if (SJ.geo.inside(h[0], { type: 'Polygon', coordinates: [polys[i][0]] })) { polys[i].push(h); break; } });
        push(el, polys);
      } else if (el.type === 'node' && (t.entrance || t.highway === 'crossing' || t.crossing)) {
        pts.push({ type: 'Feature', properties: { kind: t.entrance ? 'entrance' : 'crossing', oid: 'node/' + el.id, name: t['name:ko'] || t.name || t.ref || '',
          tg: JSON.stringify(slimTags(t)) }, geometry: { type: 'Point', coordinates: [r6(el.lon), r6(el.lat)] } });
      }
    });
    // 부분(building:part)이 있는 건물 외곽은 3D 로 그리지 않음 (OSM Simple 3D Buildings 규칙)
    if (parts.length) {
      var pp = parts.map(function (p) { var lp = SJ.geo.labelPoint(p.geometry); return lp; });
      bld.forEach(function (b) {
        var bb = SJ.geo.bbox(b.geometry);
        for (var i = 0; i < pp.length; i++) {
          var q = pp[i];
          if (q && q[0] >= bb[0][0] && q[0] <= bb[1][0] && q[1] >= bb[0][1] && q[1] <= bb[1][1] && SJ.geo.inside(q, b.geometry)) {
            b.properties.hasParts = 1;
            // 외곽의 이름·주소 정보를 위해 높이는 부분 중 최고값으로
            break;
          }
        }
      });
    }
    var all = bld.concat(parts);
    if (all.length > 3500) all = all.slice(0, 3500);
    var labels = [];
    bld.forEach(function (b) {
      if (!b.properties.name) return;
      var lp = SJ.geo.labelPoint(b.geometry);
      if (lp) labels.push({ type: 'Feature', properties: { kind: 'label', oid: b.properties.oid, name: b.properties.name, cat: b.properties.cat, area: Math.round(SJ.geo.polygonArea(b.geometry)) }, geometry: { type: 'Point', coordinates: lp } });
    });
    return all.concat(roofs.slice(0, 1500), labels, pts.slice(0, 800));
  }

  // ── 상호·시설명 파서 ─────────────────────────────────
  var PLACE_KEYS = ['shop', 'amenity', 'office', 'craft', 'tourism', 'leisure', 'healthcare'];
  var KEY_KO = { shop: '상점', amenity: '편의시설', office: '사무실', craft: '공방·수리', tourism: '관광', leisure: '여가', healthcare: '의료' };
  function placeKind(t) {
    for (var i = 0; i < PLACE_KEYS.length; i++) if (t[PLACE_KEYS[i]]) return [PLACE_KEYS[i], t[PLACE_KEYS[i]]];
    return ['', ''];
  }
  function placeCategory(t) {
    var k = placeKind(t), key = k[0], v = k[1];
    if (key === 'healthcare') return 'health';
    var c = SJ.poiCategoryOf(v, v);
    if (c !== 'other') return c;
    if (key === 'shop' || key === 'craft') return 'shop';
    if (key === 'office') return v === 'government' ? 'gov' : 'other';
    if (key === 'tourism') return v === 'hotel' || v === 'motel' || v === 'guest_house' ? 'lodging' : 'culture';
    if (key === 'leisure') return /park|garden|playground/.test(v) ? 'nature' : 'sport';
    return 'other';
  }
  SJ.placeTypeKo = function (t) {
    var k = placeKind(t);
    return SJ.classLabelsKo[k[1]] || KEY_KO[k[0]] || '';
  };
  // out geom 결과에서 way/relation 의 중심(외곽 상자 중앙)
  function geomCenter(el) {
    var pts = el.geometry || [];
    if (!pts.length && el.members) el.members.forEach(function (m) { if (m.geometry) pts = pts.concat(m.geometry); });
    if (!pts.length) return null;
    var w = 999, s = 999, e = -999, n = -999;
    pts.forEach(function (g) { if (!g) return; w = Math.min(w, g.lon); e = Math.max(e, g.lon); s = Math.min(s, g.lat); n = Math.max(n, g.lat); });
    return { lon: (w + e) / 2, lat: (s + n) / 2 };
  }
  function placeFeatures(elements) {
    var out = [];
    elements.forEach(function (el) {
      var t = el.tags || {};
      var name = t['name:ko'] || t.name;
      if (!name || !placeKind(t)[0]) return; // 결합 요청이라 건물 등 다른 요소도 섞여 옴
      var ctr = el.center || geomCenter(el);
      var lon = el.lon != null ? el.lon : ctr && ctr.lon;
      var lat = el.lat != null ? el.lat : ctr && ctr.lat;
      if (lon == null) return;
      out.push({ type: 'Feature', properties: {
        kind: 'place', oid: el.type + '/' + el.id, name: name, cat: placeCategory(t), ko: SJ.placeTypeKo(t),
        level: t.level || t['addr:floor'] || '', tg: JSON.stringify(slimTags(t)),
      }, geometry: { type: 'Point', coordinates: [r6(lon), r6(lat)] } });
    });
    return out.slice(0, 800);
  }

  // ── 공급자 ──────────────────────────────────────────
  var QUERIES = {
    places: function (b) {
      return PLACE_KEYS.map(function (k) { return 'nwr["name"]["' + k + '"](' + b + ');'; }).join('');
    },
    buildings: function (b) {
      return 'way["building"](' + b + ');way["building:part"](' + b + ');rel["building"]["type"="multipolygon"](' + b + ');' +
        'node["entrance"](' + b + ');node["highway"="crossing"](' + b + ');';
    },
  };
  var PARSE = { places: placeFeatures, buildings: buildingFeatures };

  // 공급자 인터페이스: fetch(layerIds, box, ctl) → Promise<{ layerId: features[] }>
  // 셀 하나에 필요한 레이어를 한 번의 요청으로 받습니다.
  var providers = {
    overpass: {
      label: 'OpenStreetMap (Overpass API)',
      fetch: function (ids, box, ctl) {
        var m = MARGIN_DEG;
        var b = [box[1] - m, box[0] - m, box[3] + m, box[2] + m].map(function (v) { return v.toFixed(5); }).join(',');
        var q = '[out:json][timeout:25];(' + ids.map(function (id) { return QUERIES[id](b); }).join('') + ');out geom qt;';
        return SJ.net.overpass(C.overpassUrls[0], {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: 'data=' + encodeURIComponent(q),
          signal: ctl.signal, shouldRun: ctl.shouldRun,
        }).then(function (json) {
          var els = (json && json.elements) || [], out = {};
          ids.forEach(function (id) { out[id] = PARSE[id](els); });
          return out;
        });
      },
    },
  };

  // ── 지도 레이어 정의 ─────────────────────────────────
  function zl(stops) { var e = ['interpolate', ['linear'], ['zoom']]; stops.forEach(function (x) { e.push(x[0], x[1]); }); return e; }
  SJ.overlays.define('rt-dt-places', {
    before: 'label-poi',
    source: { attribution: C.attribution.overpass },
    layers: function (P) {
      var S = SJ.state || {}, NAME = ['get', 'name'];
      var catColor = ['match', ['get', 'cat']];
      SJ.poiCategories.slice(0, -1).forEach(function (c) { catColor.push(c, P.poi[c]); });
      catColor.push(P.poi.other);
      return [{ id: 'dt-places', type: 'symbol', minzoom: 15.5,
        filter: ['!=', ['get', 'dup'], 1],
        layout: { visibility: S.labels === false ? 'none' : 'visible',
          'icon-image': ['concat', 'sj-poi-', ['get', 'cat']], 'icon-size': zl([[15.5, 0.7], [18, 0.9]]),
          'text-field': ['step', ['zoom'], ['format', NAME, {}], 17,
            ['case', ['!=', ['get', 'ko'], ''], ['format', NAME, {}, '\n', {}, ['get', 'ko'], { 'font-scale': 0.78, 'text-color': catColor }], ['format', NAME, {}]]],
          'text-font': C.fontRegular, 'text-size': zl([[15.5, 10.5], [18, 12]]), 'text-max-width': 8,
          'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': 0.85, 'text-justify': 'auto',
          'icon-optional': true, 'text-padding': 1, 'icon-padding': 1,
          'symbol-sort-key': ['match', ['get', 'cat'], 'other', 50, 'shop', 20, 10] },
        paint: { 'text-color': P.text, 'text-halo-color': P.halo, 'text-halo-width': 1.4, 'text-halo-blur': 0.4 } }];
    },
  });
  SJ.overlays.define('rt-dt-bld', {
    before: SJ.FIRST_LABEL_LAYER,
    source: { attribution: C.attribution.overpass },
    layers: function (P) {
      var S = SJ.state || {}, b3 = S.buildings === '3d', fac = SJ.facadeOn(S);
      var isB = ['all', ['in', ['get', 'kind'], ['literal', ['building', 'part']]], ['!=', ['get', 'hasParts'], 1]];
      var col = SJ.detailColor(P, S);
      var plain = { id: 'dt-bld-3d', type: 'fill-extrusion', minzoom: 15, filter: isB,
        layout: { visibility: b3 ? 'visible' : 'none' },
        paint: { 'fill-extrusion-color': col, 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'b'],
          'fill-extrusion-opacity': 0.95, 'fill-extrusion-vertical-gradient': true } };
      plain.maxzoom = fac ? SJ.FACADE_Z : 24;
      return [
        plain,
        { id: 'dt-bld-facade', type: 'fill-extrusion', minzoom: SJ.FACADE_Z, filter: isB,
          layout: { visibility: b3 && fac ? 'visible' : 'none' },
          paint: { 'fill-extrusion-pattern': SJ.facadePattern(S, ['get', 'h'], true), 'fill-extrusion-height': ['get', 'h'],
            'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-opacity': 0.95 } },
        { id: 'dt-bld-cap', type: 'fill-extrusion', minzoom: SJ.FACADE_Z, filter: isB,
          layout: { visibility: b3 && fac ? 'visible' : 'none' },
          paint: { 'fill-extrusion-color': col, 'fill-extrusion-height': ['+', ['get', 'h'], 0.4], 'fill-extrusion-base': ['get', 'h'], 'fill-extrusion-opacity': 0.95 } },
        { id: 'dt-roof', type: 'fill-extrusion', minzoom: 15, filter: ['==', ['get', 'kind'], 'roof'],
          layout: { visibility: b3 ? 'visible' : 'none' },
          paint: { 'fill-extrusion-color': ['case', ['!=', ['coalesce', ['get', 'roofColour'], ''], ''], ['to-color', ['get', 'roofColour'], P.roof], P.roof],
            'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-opacity': 0.97 } },
        { id: 'dt-crossing', type: 'symbol', minzoom: 17, filter: ['==', ['get', 'kind'], 'crossing'],
          layout: { 'icon-image': 'sj-crossing', 'icon-size': zl([[17, 0.6], [19, 1]]), 'icon-allow-overlap': true, 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map' } },
        { id: 'dt-entrance', type: 'symbol', minzoom: 17.5, filter: ['==', ['get', 'kind'], 'entrance'],
          layout: { 'icon-image': 'sj-entrance', 'icon-size': 0.8, 'icon-allow-overlap': true } },
      ];
    },
  });

  // 건물 이름은 다른 라벨과 겨룰 수 있게 라벨 층(동네 이름 아래)에 따로 둠
  SJ.overlays.define('rt-dt-bldlabel', {
    before: 'label-place-minor',
    layers: function (P) {
      var S = SJ.state || {};
      return [
        { id: 'dt-bld-label', type: 'symbol', minzoom: 16, filter: ['==', ['get', 'kind'], 'label'],
          layout: { visibility: S.labels === false ? 'none' : 'visible',
            'text-field': ['get', 'name'], 'text-font': C.fontBold, 'text-size': zl([[16, 10.5], [18, 13]]), 'text-max-width': 7,
            'symbol-sort-key': ['-', ['get', 'area']], 'text-padding': 2 },
          paint: { 'text-color': P.buildingLabel, 'text-halo-color': P.halo, 'text-halo-width': 1.6 } },
      ];
    },
  });

  // ── 레이어 상태 ─────────────────────────────────────
  var LAYERS = {
    places: { label: '상호·시설명', minZoom: 16, provider: 'overpass', overlay: 'rt-dt-places' },
    buildings: { label: '건물 상세', minZoom: 16, provider: 'overpass', overlay: 'rt-dt-bld' },
  };
  var st = {};
  Object.keys(LAYERS).forEach(function (id) {
    st[id] = { enabled: false, cells: new Map(), wanted: new Set(), inflight: new Map() };
  });

  function publish(id) {
    var s = st[id], seen = new Set(), feats = [];
    s.cells.forEach(function (c) {
      if (c.status !== 'loaded') return;
      c.features.forEach(function (f) {
        var key = f.properties.kind + '|' + f.properties.oid + '|' + (f.properties.kind === 'roof' ? f.properties.h : '');
        if (seen.has(key)) return;
        seen.add(key);
        feats.push(f);
      });
    });
    if (id === 'places') dedup(feats);
    if (id === 'buildings') {
      var labels = feats.filter(function (f) { return f.properties.kind === 'label'; });
      feats = feats.filter(function (f) { return f.properties.kind !== 'label'; });
      SJ.overlays.setData('rt-dt-bldlabel', { type: 'FeatureCollection', features: labels });
    }
    SJ.overlays.setData(LAYERS[id].overlay, { type: 'FeatureCollection', features: feats });
    if (id === 'buildings') updateCover();
    emit();
  }

  // 건물 상세가 로드된 셀(건물이 1개 이상) → 타일 건물 숨김 영역
  function updateCover() {
    var s = st.buildings, polys = [];
    if (s.enabled) {
      s.cells.forEach(function (c) {
        if (c.status === 'loaded' && c.nBld > 0) {
          var b = c.box;
          polys.push([[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]]);
        }
      });
    }
    var geom = polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
    var prev = JSON.stringify(SJ.state.detailCover || null);
    if (prev === JSON.stringify(geom)) return;
    SJ.state.detailCover = geom;
    if (SJ.detail.onCover) SJ.detail.onCover(geom);
  }

  // 타일 POI 와 같은 이름(공백·대소문자 무시)이 60 m 안에 있으면 중복으로 표시(숨김)
  function norm(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }
  function dedup(feats) {
    var map = SJ.map;
    if (!map || !map.getSource('omt')) return 0;
    var tile = [];
    try { tile = map.querySourceFeatures('omt', { sourceLayer: 'poi' }); } catch (e) { tile = []; }
    var idx = new Map();
    tile.forEach(function (f) {
      var n = norm(f.properties['name:ko'] || f.properties.name);
      if (!n || !f.geometry || f.geometry.type !== 'Point') return;
      if (!idx.has(n)) idx.set(n, []);
      idx.get(n).push(f.geometry.coordinates);
    });
    var n = 0;
    feats.forEach(function (f) {
      var list = idx.get(norm(f.properties.name));
      var dup = 0;
      if (list) for (var i = 0; i < list.length; i++) if (SJ.geo.distance(list[i], f.geometry.coordinates) < 60) { dup = 1; break; }
      f.properties.dup = dup;
      n += dup;
    });
    SJ.detail.lastDupCount = n;
    return n;
  }

  function counts() {
    var r = { loading: 0, failed: 0, loaded: 0, wanted: 0, backoff: SJ.net.overpass.backoffRemaining() };
    Object.keys(st).forEach(function (id) {
      var s = st[id];
      if (!s.enabled) return;
      s.wanted.forEach(function (k) {
        r.wanted++;
        var c = s.cells.get(k);
        if (!c || c.status === 'loading' || c.status === 'queued') r.loading++;
        else if (c.status === 'failed') r.failed++;
        else r.loaded++;
      });
    });
    return r;
  }
  function emit() { if (SJ.detail.onStatus) SJ.detail.onStatus(counts()); }

  function finish(id, e, feats, fromCache) {
    e.status = 'loaded';
    e.features = feats;
    e.fromCache = fromCache;
    e.nBld = feats.filter(function (f) { return f.properties.kind === 'building' || f.properties.kind === 'part'; }).length;
    if (fromCache) SJ.detail.cacheHits++;
    publish(id);
  }

  // 셀 하나: 캐시 확인 후, 남은 레이어를 공급자에게 한 번에 요청
  function loadCell(map, ids, cell) {
    var k = cell.key, entries = {};
    ids.forEach(function (id) {
      entries[id] = { status: 'queued', box: cell.box, features: [], nBld: 0, at: Date.now() };
      st[id].cells.set(k, entries[id]);
    });
    Promise.all(ids.map(function (id) { return idbGet(id + '|' + k); })).then(function (cached) {
      var need = [];
      ids.forEach(function (id, i) { if (cached[i]) finish(id, entries[id], cached[i], true); else need.push(id); });
      if (!need.length) return;
      var wanted = function () { return need.some(function (id) { return st[id].enabled && st[id].wanted.has(k); }); };
      var ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      need.forEach(function (id) { entries[id].status = 'loading'; st[id].inflight.set(k, ac); });
      emit();
      var prov = providers[LAYERS[need[0]].provider];
      prov.fetch(need, cell.box, { signal: ac && ac.signal, shouldRun: wanted }).then(function (res) {
        failStreak = 0;
        need.forEach(function (id) {
          st[id].inflight.delete(k);
          finish(id, entries[id], res[id] || [], false);
          idbPut(id + '|' + k, res[id] || []);
        });
      }).catch(function (err) {
        var real = !(err && (err.skipped || err.aborted));
        if (real) failStreak++;
        // 연속 실패 시 8초 → 16초 → … 최대 2분 간격으로 늦춰 공개 서버에 부담을 주지 않습니다.
        var wait = Math.max(Math.min(120000, 8000 * Math.pow(2, Math.max(0, failStreak - 1))), SJ.net.overpass.backoffRemaining() + 1000);
        need.forEach(function (id) {
          st[id].inflight.delete(k);
          if (err && (err.skipped || err.aborted)) { st[id].cells.delete(k); return; }
          entries[id].status = 'failed';
          entries[id].err = err;
          entries[id].retryAt = Date.now() + wait;
        });
        if (!(err && (err.skipped || err.aborted))) {
          console.info('[상세 데이터] ' + k + ' 실패:', err && err.message);
          clearTimeout(retryTimer);
          retryTimer = setTimeout(function () { update(map); }, wait + 50);
        }
        emit();
      });
    });
  }
  var retryTimer = null, failStreak = 0;

  function update(map) {
    var z = map.getZoom(), cellsById = {}, all = {};
    Object.keys(LAYERS).forEach(function (id) {
      var s = st[id], d = LAYERS[id];
      if (!s.enabled) { s.wanted = new Set(); return; }
      var cells = z >= d.minZoom ? wantedCells(map) : [];
      s.wanted = new Set(cells.map(function (c) { return c.key; }));
      // 화면 밖으로 벗어난 진행 중 요청 취소
      s.inflight.forEach(function (ac, k) { if (!s.wanted.has(k) && ac && !anyWants(k)) ac.abort(); });
      cells.forEach(function (c) {
        var e = s.cells.get(c.key);
        if (e && (e.status === 'loaded' || e.status === 'loading' || e.status === 'queued')) return;
        if (e && e.status === 'failed' && Date.now() < e.retryAt) return;
        (cellsById[c.key] = cellsById[c.key] || []).push(id);
        all[c.key] = c;
      });
      // 메모리 정리: 셀이 너무 많으면 먼 셀부터 버림 (IndexedDB 에는 남음)
      if (s.cells.size > 40) {
        var c0 = map.getCenter(), arr = [];
        s.cells.forEach(function (e, k) { arr.push([k, Math.hypot((e.box[0] + e.box[2]) / 2 - c0.lng, (e.box[1] + e.box[3]) / 2 - c0.lat)]); });
        arr.sort(function (a, b) { return b[1] - a[1]; });
        arr.slice(0, s.cells.size - 30).forEach(function (a) { if (!s.wanted.has(a[0])) s.cells.delete(a[0]); });
        publish(id);
      }
    });
    Object.keys(cellsById).forEach(function (k) { loadCell(map, cellsById[k], all[k]); });
    emit();
  }
  function anyWants(k) { return Object.keys(st).some(function (id) { return st[id].enabled && st[id].wanted.has(k); }); }

  SJ.detail = {
    providers: providers,
    layers: LAYERS,
    cacheHits: 0,
    lastDupCount: 0,
    onStatus: null,
    onCover: null,
    cellOf: function (lng, lat) { return { x: lng2x(lng), y: lat2y(lat) }; },
    cellBox: cellBox,
    setEnabled: function (map, id, on, noUpdate) {
      st[id].enabled = on;
      if (!on) {
        st[id].inflight.forEach(function (ac) { if (ac) ac.abort(); });
        st[id].wanted = new Set();
      }
      SJ.overlays.setVisible(LAYERS[id].overlay, on);
      if (id === 'buildings') SJ.overlays.setVisible('rt-dt-bldlabel', on);
      if (id === 'buildings') updateCover();
      if (noUpdate) return;
      if (on) update(map); else emit();
    },
    isEnabled: function (id) { return st[id].enabled; },
    attach: function (map) {
      var run = SJ.util.debounce(function () { update(map); }, 700);
      map.on('moveend', run);
      // 타일 POI 가 새로 로드되면 중복 판정을 다시
      var redo = SJ.util.debounce(function () {
        if (!st.places.enabled || !SJ.overlays.get('rt-dt-places').active) return;
        var before = SJ.detail.lastDupCount;
        var data = SJ.overlays.get('rt-dt-places').data;
        if (dedup(data.features) !== before) SJ.overlays.setData('rt-dt-places', data);
      }, 800);
      map.on('idle', redo);
      update(map);
    },
    // 클릭한 타일 POI 와 같은 OSM 상호 찾기 (풍부한 팝업용)
    findPlace: function (name, ll) {
      var d = SJ.overlays.get('rt-dt-places').data.features, n = norm(name);
      for (var i = 0; i < d.length; i++) if (norm(d[i].properties.name) === n && SJ.geo.distance(d[i].geometry.coordinates, ll) < 60) return d[i];
      return null;
    },
    placesInside: function (geom) {
      var d = SJ.overlays.get('rt-dt-places').data.features;
      return d.filter(function (f) { return SJ.geo.inside(f.geometry.coordinates, geom); });
    },
    status: counts,
    _state: st,
  };
})();
