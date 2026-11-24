/*
 * 세종 3D 지도 — 시 경계, 장소 검색, 바로 가기
 * 모두 Nominatim(OSM) 을 사용하며 요청은 SJ.net.nominatim 큐로 1초 이상 간격을 둡니다.
 * 검색은 Enter/버튼으로만 실행합니다(자동완성 없음).
 */
(function () {
  'use strict';
  var SJ = (window.SJ = window.SJ || {});
  var C = SJ.config;
  var esc = SJ.util.esc;

  // ── 오버레이 정의 ──────────────────────────────────
  SJ.overlays.define('rt-sejong-mask', {
    before: 'admin-8',
    layers: function (P) {
      return [{ id: 'sejong-mask', type: 'fill', paint: { 'fill-color': P.mask, 'fill-opacity': P.maskOpacity } }];
    },
  });
  SJ.overlays.define('rt-sejong', {
    before: 'building-flat',
    layers: function (P) {
      return [
        { id: 'sejong-outline-glow', type: 'line', layout: { 'line-join': 'round' },
          paint: { 'line-color': P.outlineGlow, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 6, 14, 14], 'line-blur': 6, 'line-opacity': 0.35 } },
        { id: 'sejong-outline', type: 'line', layout: { 'line-join': 'round' },
          paint: { 'line-color': P.outline, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.6, 14, 3], 'line-opacity': 0.95 } },
      ];
    },
  });
  SJ.overlays.define('rt-search', {
    before: SJ.FIRST_LABEL_LAYER,
    layers: function (P) {
      return [
        { id: 'search-fill', type: 'fill', filter: ['==', ['geometry-type'], 'Polygon'],
          paint: { 'fill-color': P.searchResult, 'fill-opacity': 0.14 } },
        { id: 'search-line', type: 'line', filter: ['!=', ['geometry-type'], 'Point'],
          paint: { 'line-color': P.searchResult, 'line-width': 2.5, 'line-dasharray': [2, 1] } },
        { id: 'search-point', type: 'circle', filter: ['==', ['geometry-type'], 'Point'],
          paint: { 'circle-color': P.searchResult, 'circle-radius': 7, 'circle-stroke-color': P.halo, 'circle-stroke-width': 2.5,
            'circle-pitch-alignment': 'viewport' } },
      ];
    },
  });

  SJ.boundary = { feature: null, bounds: C.fallbackBounds, source: 'fallback' };

  function polygonFeature(list) {
    var cands = (list || []).filter(function (r) {
      var g = r.geojson || r.geometry;
      return g && (g.type === 'Polygon' || g.type === 'MultiPolygon');
    });
    // 행정 경계를 우선
    cands.sort(function (a, b) {
      var sa = ((a.category || a.class || (a.properties && a.properties.category)) === 'boundary') ? 0 : 1;
      var sb = ((b.category || b.class || (b.properties && b.properties.category)) === 'boundary') ? 0 : 1;
      return sa - sb;
    });
    var r = cands[0];
    if (!r) return null;
    return { type: 'Feature', properties: { name: r.name || '세종특별자치시', display_name: r.display_name || '' }, geometry: r.geojson || r.geometry };
  }

  function applyBoundary(feature, src) {
    var world = [[110, 20], [150, 20], [150, 50], [110, 50], [110, 20]];
    var holes = SJ.geo.polys(feature.geometry).map(function (p) { return p[0]; });
    SJ.overlays.setData('rt-sejong-mask', { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [world].concat(holes) } });
    SJ.overlays.setData('rt-sejong', feature);
    SJ.boundary.feature = feature;
    SJ.boundary.bounds = SJ.geo.bbox(feature.geometry);
    SJ.boundary.source = src;
    SJ.boundary.area = SJ.geo.polygonArea(feature.geometry);
  }

  SJ.loadBoundary = function () {
    var cached = SJ.store.get('sj.boundary.v1');
    if (cached && cached.geometry) {
      applyBoundary(cached, 'cache');
      return Promise.resolve(SJ.boundary);
    }
    if (SJ.boundaryData && SJ.boundaryData.geometry) {
      applyBoundary(SJ.boundaryData, 'bundled');
      return Promise.resolve(SJ.boundary);
    }
    var url = SJ.net.nominatimUrl({ q: C.boundaryQuery, polygon_geojson: 1, polygon_threshold: 0.0002, limit: 5, bounded: 0 });
    return SJ.net.nominatim(url).then(function (list) {
      var f = polygonFeature(list);
      if (!f) throw new Error('경계 폴리곤 없음');
      applyBoundary(f, 'nominatim');
      SJ.store.set('sj.boundary.v1', f);
      return SJ.boundary;
    });
  };

  // ── 장소 검색 ──────────────────────────────────────
  var lastQuery = '', lastAt = 0;
  SJ.search = function (q) {
    q = (q || '').trim();
    if (!q) return Promise.resolve([]);
    if (q === lastQuery && Date.now() - lastAt < 1500) return Promise.reject(new Error('잠시 후 다시 시도하세요.'));
    lastQuery = q; lastAt = Date.now();
    var key = 'sj.q.' + q;
    var cached = null;
    try { cached = JSON.parse(sessionStorage.getItem(key)); } catch (e) { cached = null; }
    if (cached) return Promise.resolve(cached);
    var url = SJ.net.nominatimUrl({ q: q, polygon_geojson: 1, polygon_threshold: 0.00005 });
    return SJ.net.nominatim(url).then(function (list) {
      var out = (list || []).map(function (r) {
        return {
          name: r.name || (r.display_name || '').split(',')[0],
          address: (r.display_name || '').split(',').slice(1, 4).join(',').trim(),
          type: SJ.classLabelsKo[r.type] || r.type || '',
          lng: +r.lon, lat: +r.lat,
          bbox: r.boundingbox ? [[+r.boundingbox[2], +r.boundingbox[0]], [+r.boundingbox[3], +r.boundingbox[1]]] : null,
          geojson: r.geojson || null,
          osm: r.osm_type && r.osm_id ? r.osm_type + '/' + r.osm_id : null,
        };
      });
      try { sessionStorage.setItem(key, JSON.stringify(out)); } catch (e) { /* 무시 */ }
      return out;
    });
  };

  SJ.showSearchResult = function (map, r) {
    var feats = [{ type: 'Feature', properties: { name: r.name }, geometry: { type: 'Point', coordinates: [r.lng, r.lat] } }];
    if (r.geojson && r.geojson.type !== 'Point') feats.unshift({ type: 'Feature', properties: { name: r.name }, geometry: r.geojson });
    SJ.overlays.setData('rt-search', { type: 'FeatureCollection', features: feats });
    var small = !r.bbox || (Math.abs(r.bbox[1][0] - r.bbox[0][0]) < 0.004 && Math.abs(r.bbox[1][1] - r.bbox[0][1]) < 0.004);
    if (small) map.flyTo({ center: [r.lng, r.lat], zoom: 16.5, pitch: 60, duration: 2200, essential: true });
    else map.fitBounds(r.bbox, { padding: 60, pitch: 50, duration: 2200, maxZoom: 17 });
    var osmLink = r.osm ? '<a href="https://www.openstreetmap.org/' + esc(r.osm) + '" target="_blank" rel="noopener">OSM에서 보기</a>' : '';
    SJ.openPopup([r.lng, r.lat], '<h3>' + esc(r.name) + '</h3>' +
      (r.type ? '<p class="pp-type">' + esc(r.type) + '</p>' : '') +
      (r.address ? '<p class="pp-muted">' + esc(r.address) + '</p>' : '') + osmLink);
  };

  // ── 바로 가기(랜드마크) ───────────────────────────
  SJ.resolveLandmark = function (lm) {
    var key = 'sj.lm.v1.' + lm.query;
    var cached = SJ.store.get(key);
    if (cached) return Promise.resolve(cached);
    var url = SJ.net.nominatimUrl({ q: lm.query, limit: 1 });
    return SJ.net.nominatim(url).then(function (list) {
      var r = list && list[0];
      if (!r) throw new Error('검색 결과 없음');
      var res = { center: [+r.lon, +r.lat], source: 'nominatim' };
      SJ.store.set(key, res);
      return res;
    }).catch(function (err) {
      if (lm.approx) return { center: lm.approx, source: 'approx', error: err };
      throw err;
    });
  };
})();
