/*
 * 세종 3D 지도 — Overpass API 로 받아오는 추가 OSM 레이어
 * 사용자가 레이어를 켜고 충분히 확대했을 때만, 현재 화면 범위만 요청합니다.
 * 받은 결과는 범위별로 캐시하여 같은 곳을 다시 요청하지 않습니다.
 */
(function () {
  'use strict';
  var SJ = (window.SJ = window.SJ || {});
  var C = SJ.config;
  var A = C.attribution.overpass;

  function zl(stops) {
    var e = ['interpolate', ['linear'], ['zoom']];
    stops.forEach(function (s) { e.push(s[0], s[1]); });
    return e;
  }
  var NAME = ['coalesce', ['get', 'name'], ''];

  var AMENITY_KO = {
    toilets: '화장실', parking: '주차장', charging_station: '전기차 충전소', pharmacy: '약국', atm: 'ATM',
    drinking_water: '음수대', shelter: '쉼터', convenience: '편의점', bicycle_parking: '자전거 주차장',
  };
  var EMD_COLORS = ['#5fd0c5', '#f2a65a', '#b58cf0', '#7aa8f0', '#e98a5b', '#8fd2c0', '#d77fb3', '#e7c75a'];

  // ── 레이어 정의 ──────────────────────────────────────
  var DEFS = {
    bus: {
      label: '버스 정류장', minZoom: 14, before: 'label-poi',
      query: function (b) {
        return 'node["highway"="bus_stop"](' + b + ');node["public_transport"="platform"]["bus"="yes"](' + b + ');';
      },
      out: 'out body qt;',
      feature: function (el) {
        if (el.type !== 'node') return null;
        return pt(el, { kind: 'bus' });
      },
      layers: function (P) {
        return [{ id: 'ov-bus', type: 'symbol',
          layout: { 'icon-image': 'sj-bus', 'icon-size': zl([[14, 0.7], [17, 1]]), 'icon-allow-overlap': true,
            'text-field': ['step', ['zoom'], '', 16, NAME], 'text-font': C.fontRegular, 'text-size': 11,
            'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-optional': true, 'text-max-width': 8 },
          paint: { 'text-color': P.poi.transit, 'text-halo-color': P.halo, 'text-halo-width': 1.4 } }];
      },
    },
    bike: {
      label: '자전거 도로·대여소', minZoom: 13, before: 'building-flat',
      query: function (b) {
        return 'way["highway"="cycleway"](' + b + ');' +
          'way["cycleway"~"^(lane|track|shared_lane|opposite_lane|opposite_track)$"](' + b + ');' +
          'way["cycleway:both"~"^(lane|track)$"](' + b + ');way["cycleway:left"~"^(lane|track)$"](' + b + ');' +
          'way["cycleway:right"~"^(lane|track)$"](' + b + ');' +
          'way["highway"~"^(path|footway)$"]["bicycle"="designated"](' + b + ');' +
          'node["amenity"="bicycle_rental"](' + b + ');';
      },
      out: 'out geom qt;',
      feature: function (el) {
        var t = el.tags || {};
        if (el.type === 'node') return pt(el, { kind: 'rental' });
        if (el.type !== 'way' || !el.geometry) return null;
        var kind = t.highway === 'cycleway' || /track/.test(t.cycleway || '') ||
          /track/.test((t['cycleway:both'] || '') + (t['cycleway:left'] || '') + (t['cycleway:right'] || '')) ? 'track'
          : (t.highway === 'path' || t.highway === 'footway') ? 'shared' : 'lane';
        return line(el, { kind: kind });
      },
      layers: function (P) {
        return [
          { id: 'ov-bike-track', type: 'line', filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'kind'], 'track']],
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': P.cycleway, 'line-width': zl([[13, 1.5], [16, 3.5], [19, 7]]), 'line-opacity': 0.95 } },
          { id: 'ov-bike-lane', type: 'line', filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'kind'], 'track']],
            layout: { 'line-join': 'round' },
            paint: { 'line-color': P.cycleway, 'line-width': zl([[13, 1.2], [16, 2.6], [19, 5]]), 'line-dasharray': [1.5, 1.2], 'line-opacity': 0.9 } },
          { id: 'ov-bike-rental', type: 'symbol', filter: ['==', ['geometry-type'], 'Point'],
            layout: { 'icon-image': 'sj-bike', 'icon-size': zl([[13, 0.7], [17, 1]]), 'icon-allow-overlap': true,
              'text-field': ['step', ['zoom'], '', 16.5, NAME], 'text-font': C.fontRegular, 'text-size': 10.5,
              'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-optional': true },
            paint: { 'text-color': P.cycleway, 'text-halo-color': P.halo, 'text-halo-width': 1.3 } },
        ];
      },
    },
    trees: {
      label: '나무 (3D)', minZoom: 15, before: 'label-waterway',
      query: function (b) { return 'node["natural"="tree"](' + b + ');way["natural"="tree_row"](' + b + ');'; },
      out: 'out geom qt;',
      feature: function (el) {
        var t = el.tags || {};
        if (el.type === 'node') {
          var h = parseFloat(t.height) || 8;
          var crown = parseFloat(t.diameter_crown) || Math.max(3, Math.min(10, h * 0.55));
          var c = [el.lon, el.lat];
          return {
            type: 'Feature', id: el.id,
            properties: { oid: 'node/' + el.id, kind: 'tree', h: Math.min(h, 40), base: Math.min(h * 0.3, 3), shade: el.id % 3,
              name: t['species:ko'] || t.species || t.genus || '' },
            geometry: { type: 'Polygon', coordinates: [SJ.geo.circle(c, crown / 2, 7)] },
          };
        }
        if (el.type === 'way' && el.geometry) return line(el, { kind: 'tree_row' });
        return null;
      },
      layers: function (P) {
        return [
          { id: 'ov-tree-row', type: 'line', filter: ['==', ['geometry-type'], 'LineString'],
            layout: { 'line-cap': 'round' },
            paint: { 'line-color': P.poi.nature, 'line-width': zl([[15, 3], [19, 12]]), 'line-opacity': 0.7, 'line-blur': 1 } },
          { id: 'ov-tree', type: 'fill-extrusion', filter: ['==', ['geometry-type'], 'Polygon'],
            paint: {
              'fill-extrusion-color': ['match', ['get', 'shade'], 0, '#3f8f4f', 1, '#4f9d55', '#2f7d4a'],
              'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-opacity': 0.92,
            } },
        ];
      },
    },
    amenity: {
      label: '생활 편의시설', minZoom: 15, before: 'label-poi',
      query: function (b) {
        return 'nwr["amenity"~"^(toilets|parking|charging_station|pharmacy|atm|drinking_water|shelter|bicycle_parking)$"](' + b + ');' +
          'nwr["shop"="convenience"](' + b + ');';
      },
      out: 'out center qt;',
      feature: function (el) {
        var t = el.tags || {};
        var kind = t.shop === 'convenience' ? 'convenience' : t.amenity;
        var lon = el.lon != null ? el.lon : el.center && el.center.lon;
        var lat = el.lat != null ? el.lat : el.center && el.center.lat;
        if (lon == null) return null;
        return { type: 'Feature', id: el.id, properties: { oid: el.type + '/' + el.id, kind: kind, name: t['name:ko'] || t.name || '', label: AMENITY_KO[kind] || kind },
          geometry: { type: 'Point', coordinates: [lon, lat] } };
      },
      layers: function (P) {
        return [{ id: 'ov-amenity', type: 'circle',
          paint: {
            'circle-radius': zl([[15, 4], [18, 7]]),
            'circle-color': ['match', ['get', 'kind'],
              'toilets', '#5ab0e8', 'parking', '#6b7fd6', 'charging_station', '#3fbf7f', 'pharmacy', '#ef6b73',
              'atm', '#e7c75a', 'drinking_water', '#4fc0e0', 'shelter', '#b0a07a', 'convenience', '#d77fb3', 'bicycle_parking', P.cycleway, '#9aa6b8'],
            'circle-stroke-color': P.halo, 'circle-stroke-width': 1.5, 'circle-pitch-alignment': 'map',
          } },
        { id: 'ov-amenity-label', type: 'symbol', minzoom: 16.5,
          layout: { 'text-field': ['case', ['!=', NAME, ''], ['concat', ['get', 'label'], ' · ', NAME], ['get', 'label']],
            'text-font': C.fontRegular, 'text-size': 10.5, 'text-offset': [0, 1], 'text-anchor': 'top', 'text-max-width': 9 },
          paint: { 'text-color': P.textMuted, 'text-halo-color': P.halo, 'text-halo-width': 1.3 } }];
      },
    },
    emd: {
      label: '읍·면·동 경계·이름', minZoom: 0, cityWide: true, before: 'building-flat',
      query: function () {
        var b = C.fallbackBounds;
        var bb = [b[0][1] - 0.02, b[0][0] - 0.02, b[1][1] + 0.02, b[1][0] + 0.02].join(',');
        return 'rel["boundary"="administrative"]["admin_level"="' + C.emdAdminLevel + '"](' + bb + ');';
      },
      out: 'out geom qt;',
      feature: null, // 아래 emdFeatures 에서 처리
      layers: function (P) {
        var color = ['match', ['%', ['get', 'idx'], EMD_COLORS.length]];
        EMD_COLORS.forEach(function (c, i) { color.push(i, c); });
        color.push(EMD_COLORS[0]);
        return [
          { id: 'ov-emd-fill', type: 'fill', filter: ['==', ['geometry-type'], 'Polygon'],
            paint: { 'fill-color': color, 'fill-opacity': P.id === 'dark' ? 0.09 : 0.12 } },
          { id: 'ov-emd-hover', type: 'fill', filter: ['==', ['get', 'oid'], ''],
            paint: { 'fill-color': P.accent, 'fill-opacity': 0.22 } },
          { id: 'ov-emd-line', type: 'line', filter: ['==', ['geometry-type'], 'Polygon'],
            layout: { 'line-join': 'round' },
            paint: { 'line-color': P.boundary8, 'line-width': zl([[9, 0.8], [15, 2]]), 'line-opacity': 0.9 } },
          { id: 'ov-emd-label', type: 'symbol', filter: ['==', ['geometry-type'], 'Point'],
            layout: { 'text-field': NAME, 'text-font': C.fontBold, 'text-size': zl([[9, 11], [13, 15]]),
              'text-max-width': 6, 'text-padding': 4, 'symbol-sort-key': ['-', ['get', 'area']] },
            paint: { 'text-color': P.text, 'text-halo-color': P.halo, 'text-halo-width': 1.8, 'text-opacity': zl([[15, 1], [16.5, 0.35]]) } },
        ];
      },
    },
  };

  function pt(el, props) {
    var t = el.tags || {};
    return { type: 'Feature', id: el.id, properties: Object.assign({ oid: el.type + '/' + el.id, name: t['name:ko'] || t.name || '' }, props),
      geometry: { type: 'Point', coordinates: [el.lon, el.lat] } };
  }
  function line(el, props) {
    var t = el.tags || {};
    var coords = el.geometry.map(function (g) { return [g.lon, g.lat]; });
    if (coords.length < 2) return null;
    return { type: 'Feature', id: el.id, properties: Object.assign({ oid: el.type + '/' + el.id, name: t['name:ko'] || t.name || '' }, props),
      geometry: { type: 'LineString', coordinates: coords } };
  }

  // 관계(relation)의 외곽 way 들을 이어 붙여 다각형 고리로 만듦
  function stitch(parts) {
    var rings = [], segs = parts.filter(function (p) { return p.length > 1; }).map(function (p) { return p.slice(); });
    var key = function (c) { return c[0].toFixed(7) + ',' + c[1].toFixed(7); };
    while (segs.length) {
      var ring = segs.shift();
      var guard = 0;
      while (key(ring[0]) !== key(ring[ring.length - 1]) && guard++ < 10000) {
        var end = key(ring[ring.length - 1]), found = -1, rev = false;
        for (var i = 0; i < segs.length; i++) {
          if (key(segs[i][0]) === end) { found = i; break; }
          if (key(segs[i][segs[i].length - 1]) === end) { found = i; rev = true; break; }
        }
        if (found < 0) break;
        var s = segs.splice(found, 1)[0];
        if (rev) s.reverse();
        ring = ring.concat(s.slice(1));
      }
      if (ring.length >= 4 && key(ring[0]) === key(ring[ring.length - 1])) rings.push(ring);
    }
    return rings;
  }
  function emdFeatures(elements) {
    var out = [], idx = 0;
    var city = SJ.boundary && SJ.boundary.source !== 'fallback' ? SJ.boundary.feature : null;
    elements.forEach(function (el) {
      if (el.type !== 'relation' || !el.members) return;
      var outer = [], inner = [];
      el.members.forEach(function (m) {
        if (m.type !== 'way' || !m.geometry) return;
        var c = m.geometry.map(function (g) { return [g.lon, g.lat]; });
        (m.role === 'inner' ? inner : outer).push(c);
      });
      var outers = stitch(outer), inners = stitch(inner);
      if (!outers.length) return;
      var polys = outers.map(function (r) { return [r]; });
      inners.forEach(function (h) {
        for (var i = 0; i < polys.length; i++) if (SJ.geo.inside(h[0], { type: 'Polygon', coordinates: [polys[i][0]] })) { polys[i].push(h); break; }
      });
      var geom = polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
      var lp = SJ.geo.labelPoint(geom);
      if (city && lp && !SJ.geo.inside(lp, city.geometry)) return; // 세종시 밖 제외
      var t = el.tags || {};
      var area = SJ.geo.polygonArea(geom);
      var props = { oid: 'relation/' + el.id, name: t['name:ko'] || t.name || '', name_en: t['name:en'] || '', idx: idx++, area: Math.round(area) };
      SJ.overpass.tags[props.oid] = t;
      out.push({ type: 'Feature', id: el.id, properties: props, geometry: geom });
      if (lp) out.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: lp } });
    });
    return out;
  }

  // ── 상태·캐시 ───────────────────────────────────────
  var state = {}; // id → { enabled, features: Map, rects: [], loading }
  Object.keys(DEFS).forEach(function (id) {
    var d = DEFS[id];
    state[id] = { enabled: false, features: new Map(), rects: [], loading: false, done: false };
    SJ.overlays.define('rt-ov-' + id, { before: d.before, layers: d.layers, source: { attribution: A } });
  });

  function covered(rects, b) {
    return rects.some(function (r) { return r[0] <= b[0] && r[1] <= b[1] && r[2] >= b[2] && r[3] >= b[3]; });
  }

  // 화면 중심 주변으로 제한한 요청 범위 [서, 남, 동, 북]
  function viewBox(map) {
    var b = map.getBounds(), c = map.getCenter(), zz = map.getZoom();
    var half = Math.min(0.06, 0.018 * Math.pow(2, 15 - zz));
    var halfLng = half / Math.cos(c.lat * Math.PI / 180);
    var w = Math.max(b.getWest(), c.lng - halfLng), e = Math.min(b.getEast(), c.lng + halfLng);
    var s = Math.max(b.getSouth(), c.lat - half), n = Math.min(b.getNorth(), c.lat + half);
    // 캐시 적중률을 높이기 위해 0.005° 격자에 맞춰 바깥쪽으로 반올림
    var g = 0.005;
    return [Math.floor(w / g) * g, Math.floor(s / g) * g, Math.ceil(e / g) * g, Math.ceil(n / g) * g].map(function (v) { return +v.toFixed(4); });
  }

  function publish(id) {
    var feats = Array.from(state[id].features.values());
    SJ.overlays.setData('rt-ov-' + id, { type: 'FeatureCollection', features: feats });
    return feats.length;
  }

  function status(id, text, kind) {
    if (SJ.overpass.onStatus) SJ.overpass.onStatus(id, text, kind);
  }

  function fetchLayer(map, id) {
    var d = DEFS[id], st = state[id];
    if (!st.enabled || st.loading) return;
    var box;
    if (d.cityWide) {
      if (st.done) { status(id, publish(id) + '개 구역', 'ok'); return; }
    } else {
      if (map.getZoom() < d.minZoom) { status(id, '줌 ' + d.minZoom + ' 이상으로 확대하면 표시됩니다', 'info'); return; }
      box = viewBox(map);
      if (covered(st.rects, box)) { status(id, st.features.size + '개 표시 (캐시)', 'ok'); return; }
    }
    st.loading = true;
    status(id, '불러오는 중…', 'busy');
    var bstr = box ? [box[1], box[0], box[3], box[2]].join(',') : '';
    var q = '[out:json][timeout:25];(' + d.query(bstr) + ');' + d.out;
    var urls = C.overpassUrls;
    var attempt = function (i) {
      return SJ.net.overpass(urls[i], {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: 'data=' + encodeURIComponent(q),
      }).catch(function (err) {
        if (i + 1 < urls.length) return attempt(i + 1);
        throw err;
      });
    };
    attempt(0).then(function (json) {
      var els = (json && json.elements) || [];
      if (d.cityWide) {
        emdFeatures(els).forEach(function (f, i) { st.features.set(f.properties.oid + (f.geometry.type === 'Point' ? '#l' : '') + i, f); });
        st.done = true;
      } else {
        els.forEach(function (el) {
          var f = d.feature(el);
          if (f) { st.features.set(f.properties.oid, f); SJ.overpass.tags[f.properties.oid] = el.tags || {}; }
        });
        st.rects.push(box);
      }
      st.loading = false;
      var n = publish(id);
      status(id, d.cityWide ? (n ? Math.round(n / 2) + '개 구역' : '구역을 찾지 못했습니다') : n + '개 표시', n ? 'ok' : 'info');
      if (!d.cityWide) fetchLayer(map, id); // 이동 중 범위가 바뀌었으면 이어서
    }).catch(function (err) {
      st.loading = false;
      status(id, SJ.net.errorText(err, 'Overpass 요청'), 'err');
    });
  }

  SJ.overpass = {
    defs: DEFS,
    tags: {},
    onStatus: null,
    setEnabled: function (map, id, on) {
      state[id].enabled = on;
      SJ.overlays.setVisible('rt-ov-' + id, on);
      if (on) fetchLayer(map, id); else status(id, '', 'info');
    },
    isEnabled: function (id) { return state[id].enabled; },
    attach: function (map) {
      var run = SJ.util.debounce(function () {
        Object.keys(DEFS).forEach(function (id) { if (state[id].enabled && !DEFS[id].cityWide) fetchLayer(map, id); });
      }, 900);
      map.on('moveend', run);
    },
    layerIds: function () {
      var ids = [];
      Object.keys(DEFS).forEach(function (id) { ids = ids.concat(SJ.overlays.layerIds('rt-ov-' + id)); });
      return ids;
    },
    _stitch: stitch,
  };
})();
