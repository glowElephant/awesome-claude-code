/*
 * 세종 3D 지도 — 도구: 거리·면적 측정(고도 단면 포함), 자동 회전, 시네마틱 투어, 화면 저장
 */
(function () {
  'use strict';
  var SJ = (window.SJ = window.SJ || {});
  var U = SJ.util;

  // ── 거리 측정 ──────────────────────────────────────
  SJ.overlays.define('rt-measure', {
    before: null,
    layers: function (P) {
      return [
        { id: 'measure-fill', type: 'fill', filter: ['==', ['geometry-type'], 'Polygon'],
          paint: { 'fill-color': P.measure, 'fill-opacity': 0.15 } },
        { id: 'measure-line-casing', type: 'line', filter: ['!=', ['geometry-type'], 'Point'],
          layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': P.halo, 'line-width': 5, 'line-opacity': 0.8 } },
        { id: 'measure-line', type: 'line', filter: ['!=', ['geometry-type'], 'Point'],
          layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': P.measure, 'line-width': 2.5, 'line-dasharray': [2, 1] } },
        { id: 'measure-point', type: 'circle', filter: ['==', ['geometry-type'], 'Point'],
          paint: { 'circle-radius': 5, 'circle-color': P.measure, 'circle-stroke-color': P.halo, 'circle-stroke-width': 2, 'circle-pitch-alignment': 'viewport' } },
        { id: 'measure-label', type: 'symbol', filter: ['all', ['==', ['geometry-type'], 'Point'], ['has', 'label']],
          layout: { 'text-field': ['get', 'label'], 'text-font': SJ.config.fontBold, 'text-size': 12, 'text-offset': [0, -1.3],
            'text-allow-overlap': true, 'text-ignore-placement': true },
          paint: { 'text-color': P.measure, 'text-halo-color': P.halo, 'text-halo-width': 2 } },
      ];
    },
  });

  var M = SJ.measure = {
    active: false, points: [], closed: false, onChange: null,
    start: function (map) {
      M.active = true; M.map = map;
      map.getCanvas().style.cursor = 'crosshair';
      map.doubleClickZoom.disable();
      M.update();
    },
    stop: function () {
      if (!M.map) return;
      M.active = false;
      M.map.getCanvas().style.cursor = '';
      M.map.doubleClickZoom.enable();
      M.update();
    },
    clear: function () { M.points = []; M.closed = false; M.update(); },
    undo: function () { M.points.pop(); M.update(); },
    add: function (lngLat) { M.points.push([lngLat.lng, lngLat.lat]); M.update(); },
    total: function () { return SJ.geo.lineLength(M.points); },
    area: function () {
      if (!M.closed || M.points.length < 3) return 0;
      return SJ.geo.ringArea(M.points.concat([M.points[0]]));
    },
    update: function () {
      var f = [], pts = M.points, cum = 0;
      if (pts.length > 1) f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: M.closed ? pts.concat([pts[0]]) : pts } });
      if (M.closed && pts.length > 2) f.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts.concat([pts[0]])] } });
      pts.forEach(function (p, i) {
        if (i) cum += SJ.geo.distance(pts[i - 1], p);
        var props = {};
        if (i === pts.length - 1 && i > 0) props.label = U.fmtDist(cum);
        else if (i > 0 && pts.length > 2) props.label = U.fmtDist(cum);
        f.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: p } });
      });
      SJ.overlays.setData('rt-measure', { type: 'FeatureCollection', features: f });
      if (M.onChange) M.onChange();
    },
    // 지형이 켜져 있으면 선을 따라 고도를 샘플링 (exaggeration 으로 나눠 실제 고도)
    profile: function (map, exaggeration) {
      if (M.points.length < 2 || !map.getTerrain()) return null;
      var pts = M.points, segs = [], total = 0;
      for (var i = 1; i < pts.length; i++) { var d = SJ.geo.distance(pts[i - 1], pts[i]); segs.push(d); total += d; }
      if (!total) return null;
      var N = 60, out = [];
      for (var k = 0; k <= N; k++) {
        var target = total * k / N, acc = 0, j = 0;
        while (j < segs.length - 1 && acc + segs[j] < target) { acc += segs[j]; j++; }
        var t = segs[j] ? (target - acc) / segs[j] : 0;
        var a = pts[j], b = pts[j + 1];
        var e = map.queryTerrainElevation([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        if (e == null) return null;
        out.push({ d: target, e: e / (exaggeration || 1) });
      }
      return out;
    },
  };

  // ── 자동 회전 ──────────────────────────────────────
  var orbit = SJ.orbit = {
    active: false, onChange: null,
    start: function (map) {
      if (orbit.active) return;
      orbit.active = true; orbit.map = map;
      var step = function () {
        if (!orbit.active) return;
        map.easeTo({ bearing: map.getBearing() + 40, duration: 8000, easing: function (t) { return t; }, essential: true });
        map.once('moveend', function () { if (orbit.active) setTimeout(step, 0); });
      };
      if (map.getPitch() < 45) {
        map.easeTo({ pitch: 60, duration: 1200 });
        map.once('moveend', step);
      } else {
        step();
      }
      if (orbit.onChange) orbit.onChange();
    },
    stop: function () {
      if (!orbit.active) return;
      orbit.active = false;
      if (orbit.map) orbit.map.stop();
      if (orbit.onChange) orbit.onChange();
    },
  };

  // ── 시네마틱 투어 ───────────────────────────────────
  var tour = SJ.tour = {
    active: false, index: 0, onChange: null, onCaption: null,
    start: function (map) {
      if (tour.active) return;
      orbit.stop();
      tour.active = true; tour.index = 0; tour.map = map;
      if (tour.onChange) tour.onChange();
      tour.next();
    },
    next: function () {
      if (!tour.active) return;
      var map = tour.map, list = SJ.config.landmarks;
      if (tour.index >= list.length) { tour.stop(); return; }
      var lm = list[tour.index++];
      SJ.resolveLandmark(lm).then(function (res) {
        if (!tour.active) return;
        if (tour.onCaption) tour.onCaption(lm.name, tour.index, list.length, res.source);
        map.flyTo({ center: res.center, zoom: lm.zoom, pitch: 64, bearing: lm.bearing, duration: 5200, curve: 1.6, essential: true });
        map.once('moveend', function () {
          if (!tour.active) return;
          map.easeTo({ bearing: lm.bearing + 70, duration: 7000, easing: function (t) { return t; }, essential: true });
          map.once('moveend', function () { if (tour.active) tour.next(); });
        });
      }).catch(function () { tour.next(); });
    },
    stop: function () {
      if (!tour.active) return;
      tour.active = false;
      if (tour.map) tour.map.stop();
      if (tour.onCaption) tour.onCaption(null);
      if (tour.onChange) tour.onChange();
    },
  };

  // ── 화면 저장 (PNG) ────────────────────────────────
  SJ.screenshot = function (map, title) {
    return new Promise(function (resolve, reject) {
      map.once('render', function () {
        try {
          var src = map.getCanvas();
          var c = document.createElement('canvas');
          c.width = src.width; c.height = src.height;
          var g = c.getContext('2d');
          g.drawImage(src, 0, 0);
          var dpr = src.width / src.clientWidth || 1;
          var pad = 14 * dpr;
          g.font = '600 ' + (18 * dpr) + 'px Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
          g.textBaseline = 'top';
          var w = g.measureText(title).width;
          g.fillStyle = 'rgba(0,0,0,0.45)';
          g.fillRect(pad - 8 * dpr, pad - 6 * dpr, w + 16 * dpr, 30 * dpr);
          g.fillStyle = '#ffffff';
          g.fillText(title, pad, pad);
          var attr = '© OpenStreetMap 기여자 · © OpenMapTiles · OpenFreeMap' + (map.getTerrain() || map.getLayoutProperty('hillshade', 'visibility') === 'visible' ? ' · 지형 Mapzen/Tilezen' : '');
          g.font = (11 * dpr) + 'px Pretendard, "Malgun Gothic", sans-serif';
          var aw = g.measureText(attr).width;
          g.fillStyle = 'rgba(0,0,0,0.45)';
          g.fillRect(c.width - aw - 16 * dpr, c.height - 22 * dpr, aw + 16 * dpr, 22 * dpr);
          g.fillStyle = '#ffffff';
          g.fillText(attr, c.width - aw - 8 * dpr, c.height - 17 * dpr);
          c.toBlob(function (blob) {
            if (!blob) { reject(new Error('이미지 생성 실패')); return; }
            var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
            var name = 'sejong-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.png';
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = name;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
            resolve(name);
          }, 'image/png');
        } catch (e) { reject(e); }
      });
      map.triggerRepaint();
    });
  };
})();
