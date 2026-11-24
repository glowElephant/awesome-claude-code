/*
 * 세종 3D 지도 — 공통 도구
 *  SJ.store    : localStorage 안전 래퍼 (사생활 보호 모드 등에서 실패해도 동작)
 *  SJ.net      : 요청 간격을 지키는 직렬 요청 큐 (Nominatim/Overpass 이용 정책)
 *  SJ.geo      : 거리·면적·포함 판정 등 간단한 지리 계산
 *  SJ.overlays : 실행 중 추가되는 GeoJSON 레이어 관리 (테마 전환 시 다시 주입)
 *  SJ.util     : HTML 이스케이프 등
 */
(function () {
  'use strict';
  var SJ = (window.SJ = window.SJ || {});

  // ── 저장소 ────────────────────────────────────────────
  SJ.store = {
    get: function (k, def) {
      try { var v = window.localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set: function (k, v) {
      try { window.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
    },
  };

  // ── 유틸 ─────────────────────────────────────────────
  SJ.util = {
    esc: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
    debounce: function (fn, ms) {
      var t;
      return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); };
    },
    fmtDist: function (m) {
      if (m < 1000) return Math.round(m) + ' m';
      return (m / 1000).toFixed(m < 10000 ? 2 : 1) + ' km';
    },
    fmtArea: function (m2) {
      if (m2 < 10000) return Math.round(m2).toLocaleString('ko-KR') + ' m²';
      if (m2 < 1e6) return (m2 / 10000).toFixed(2) + ' ha';
      return (m2 / 1e6).toFixed(2) + ' km²';
    },
  };

  // ── 직렬 요청 큐 ─────────────────────────────────────
  function makeQueue(minInterval, timeoutMs) {
    var last = 0, chain = Promise.resolve();
    return function (url, opts) {
      var run = function () {
        var wait = Math.max(0, last + minInterval - Date.now());
        return new Promise(function (r) { setTimeout(r, wait); }).then(function () {
          last = Date.now();
          var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
          var timer = ctl && setTimeout(function () { ctl.abort(); }, timeoutMs);
          var o = Object.assign({}, opts || {});
          if (ctl) o.signal = ctl.signal;
          return fetch(url, o).then(function (res) {
            clearTimeout(timer);
            if (!res.ok) { var e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
            return res.json();
          }, function (err) {
            clearTimeout(timer);
            if (err && err.name === 'AbortError') { var e2 = new Error('시간 초과'); e2.timeout = true; throw e2; }
            throw err;
          });
        });
      };
      var p = chain.then(run, run);
      chain = p.catch(function () {});
      return p;
    };
  }
  SJ.net = {
    nominatim: makeQueue(SJ.config.nominatimMinIntervalMs, 20000),
    overpass: makeQueue(SJ.config.overpassMinIntervalMs, 60000),
    // Nominatim 검색 URL 생성 (세종시 범위 안으로 제한)
    nominatimUrl: function (params) {
      var b = SJ.config.fallbackBounds;
      var p = Object.assign({
        format: 'jsonv2', 'accept-language': 'ko', countrycodes: 'kr', limit: 8,
        viewbox: [b[0][0], b[1][1], b[1][0], b[0][1]].join(','), bounded: 1,
      }, params);
      return SJ.config.nominatimUrl + '?' + Object.keys(p).filter(function (k) { return p[k] !== '' && p[k] != null; }).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(p[k]);
      }).join('&');
    },
    errorText: function (err, what) {
      if (!err) return what + '에 실패했습니다.';
      if (err.timeout) return what + ' 응답이 너무 늦습니다. 잠시 뒤 다시 시도하세요.';
      if (err.status === 429) return what + ' 서버 요청 한도를 넘었습니다. 잠시 뒤 다시 시도하세요.';
      if (err.status === 504 || err.status === 503) return what + ' 서버가 혼잡합니다. 잠시 뒤 다시 시도하세요.';
      if (err.status) return what + '에 실패했습니다 (HTTP ' + err.status + ').';
      return what + '에 실패했습니다. 네트워크 연결을 확인하세요.';
    },
  };

  // ── 지리 계산 ────────────────────────────────────────
  var R = 6371008.8, RAD = Math.PI / 180;
  function hav(a, b) {
    var dLat = (b[1] - a[1]) * RAD, dLng = (b[0] - a[0]) * RAD;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  function ringArea(ring) { // 구면 근사 (m²)
    var area = 0, n = ring.length;
    if (n < 3) return 0;
    for (var i = 0; i < n; i++) {
      var p1 = ring[i], p2 = ring[(i + 1) % n];
      area += (p2[0] - p1[0]) * RAD * (2 + Math.sin(p1[1] * RAD) + Math.sin(p2[1] * RAD));
    }
    return Math.abs(area * R * R / 2);
  }
  function inRing(pt, ring) {
    var x = pt[0], y = pt[1], inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function polys(geom) {
    if (!geom) return [];
    if (geom.type === 'Polygon') return [geom.coordinates];
    if (geom.type === 'MultiPolygon') return geom.coordinates;
    return [];
  }
  function inside(pt, geom) {
    return polys(geom).some(function (p) {
      if (!inRing(pt, p[0])) return false;
      for (var h = 1; h < p.length; h++) if (inRing(pt, p[h])) return false;
      return true;
    });
  }
  function bbox(geom) {
    var w = 180, s = 90, e = -180, n = -90;
    (function walk(c) {
      if (typeof c[0] === 'number') {
        if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1];
      } else c.forEach(walk);
    })(geom.coordinates);
    return [[w, s], [e, n]];
  }
  function segDist2(p, a, b) {
    var x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
    if (dx || dy) {
      var t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p[0] - x; dy = p[1] - y;
    return dx * dx + dy * dy;
  }
  // 라벨 위치: 폴리곤 안에서 경계와 가장 먼 점(격자 탐색 근사)
  function labelPoint(geom) {
    var P = polys(geom);
    if (!P.length) return null;
    var best = null, bestA = -1;
    P.forEach(function (p) { var a = ringArea(p[0]); if (a > bestA) { bestA = a; best = p; } });
    var bb = bbox({ coordinates: best[0] });
    var cand = null, candD = -1;
    var N = 24;
    for (var pass = 0; pass < 2; pass++) {
      var w = bb[0][0], s = bb[0][1], e = bb[1][0], n = bb[1][1];
      for (var i = 0; i <= N; i++) for (var j = 0; j <= N; j++) {
        var pt = [w + (e - w) * i / N, s + (n - s) * j / N];
        if (!inside(pt, { type: 'Polygon', coordinates: best })) continue;
        var d = Infinity;
        best.forEach(function (ring) {
          for (var k = 0; k < ring.length - 1; k++) d = Math.min(d, segDist2(pt, ring[k], ring[k + 1]));
        });
        if (d > candD) { candD = d; cand = pt; }
      }
      if (!cand) break;
      var dx = (bb[1][0] - bb[0][0]) / N, dy = (bb[1][1] - bb[0][1]) / N;
      bb = [[cand[0] - dx, cand[1] - dy], [cand[0] + dx, cand[1] + dy]];
    }
    return cand || best[0][0];
  }
  SJ.geo = {
    distance: hav,
    lineLength: function (coords) { var d = 0; for (var i = 1; i < coords.length; i++) d += hav(coords[i - 1], coords[i]); return d; },
    polygonArea: function (geom) {
      return polys(geom).reduce(function (sum, p) {
        var a = ringArea(p[0]);
        for (var h = 1; h < p.length; h++) a -= ringArea(p[h]);
        return sum + a;
      }, 0);
    },
    ringArea: ringArea,
    inside: inside,
    bbox: bbox,
    labelPoint: labelPoint,
    polys: polys,
    // 대략적인 원(다각형) — 나무 수관 등
    circle: function (c, radiusM, n) {
      var ring = [], dLat = radiusM / 111320, dLng = radiusM / (111320 * Math.cos(c[1] * RAD));
      for (var i = 0; i <= n; i++) {
        var a = (i % n) / n * Math.PI * 2;
        ring.push([c[0] + dLng * Math.cos(a), c[1] + dLat * Math.sin(a)]);
      }
      return ring;
    },
  };

  // ── 실행 중 추가 레이어 ───────────────────────────────
  // define(id, { layers(P) → [layerSpec], before: 기준 레이어 ID, source: 추가 소스 옵션 })
  var defs = {}, order = [];
  SJ.overlays = {
    map: null,
    define: function (id, def) {
      def.id = id; def.data = def.data || { type: 'FeatureCollection', features: [] };
      def.active = false; def.visible = def.visible !== false;
      if (!defs[id]) order.push(id);
      defs[id] = def;
    },
    get: function (id) { return defs[id]; },
    _layers: function (def, P) {
      return def.layers(P).map(function (l) {
        l.source = def.id;
        l.layout = l.layout || {};
        if (!def.visible) l.layout.visibility = 'none';
        return l;
      });
    },
    _sourceSpec: function (def) {
      return Object.assign({ type: 'geojson', data: def.data }, def.source || {});
    },
    setData: function (id, data) {
      var def = defs[id], map = SJ.overlays.map;
      def.data = data;
      if (!map) return;
      if (map.getSource(id)) { map.getSource(id).setData(data); return; }
      map.addSource(id, SJ.overlays._sourceSpec(def));
      var before = def.before && map.getLayer(def.before) ? def.before : undefined;
      SJ.overlays._layers(def, SJ.palette()).forEach(function (l) { map.addLayer(l, before); });
      def.active = true;
    },
    setVisible: function (id, on) {
      var def = defs[id], map = SJ.overlays.map;
      if (!def) return;
      def.visible = on;
      if (!map || !def.active) return;
      def.layers(SJ.palette()).forEach(function (l) {
        if (map.getLayer(l.id)) map.setLayoutProperty(l.id, 'visibility', on ? 'visible' : 'none');
      });
    },
    layerIds: function (id) {
      var def = defs[id];
      return def ? def.layers(SJ.palette()).map(function (l) { return l.id; }) : [];
    },
    // 새 스타일 JSON 에 활성 레이어를 끼워 넣음 (테마 전환용)
    inject: function (style, P) {
      order.forEach(function (id) {
        var def = defs[id];
        if (!def.active) return;
        style.sources[id] = SJ.overlays._sourceSpec(def);
        var ls = SJ.overlays._layers(def, P);
        var idx = -1;
        if (def.before) for (var i = 0; i < style.layers.length; i++) if (style.layers[i].id === def.before) { idx = i; break; }
        if (idx < 0) style.layers.push.apply(style.layers, ls);
        else style.layers.splice.apply(style.layers, [idx, 0].concat(ls));
      });
      return style;
    },
  };
})();
