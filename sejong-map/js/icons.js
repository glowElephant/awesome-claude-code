/*
 * 세종 3D 지도 — 아이콘
 * 외부 스프라이트 없이 캔버스로 아이콘을 그려 map.addImage 로 등록합니다.
 * (스타일이 다시 로드되어 이미지가 없으면 'styleimagemissing' 에서 다시 만듭니다.)
 */
(function () {
  'use strict';
  var SJ = (window.SJ = window.SJ || {});
  var PR = 2; // 고해상도 픽셀 비율

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w * PR; c.height = h * PR;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.scale(PR, PR);
    g.lineCap = 'round'; g.lineJoin = 'round';
    return { c: c, g: g, w: w, h: h };
  }
  function out(k) { return k.g.getImageData(0, 0, k.c.width, k.c.height); }

  // 범주별 픽토그램 (원 안에 흰색)
  var PICTO = {
    food: function (g) { // 포크·나이프
      g.beginPath(); g.moveTo(8.5, 6); g.lineTo(8.5, 18); g.moveTo(6.8, 6); g.lineTo(6.8, 10); g.moveTo(10.2, 6); g.lineTo(10.2, 10);
      g.moveTo(6.8, 10); g.quadraticCurveTo(8.5, 12, 10.2, 10); g.stroke();
      g.beginPath(); g.moveTo(15.5, 18); g.lineTo(15.5, 6); g.quadraticCurveTo(18, 8, 17.5, 12.5); g.lineTo(15.5, 12.5); g.stroke();
    },
    cafe: function (g) {
      g.beginPath(); g.moveTo(6, 9); g.lineTo(16, 9); g.lineTo(15, 17); g.lineTo(7, 17); g.closePath(); g.fill();
      g.beginPath(); g.arc(16.5, 12, 2.2, -Math.PI / 2, Math.PI / 2); g.stroke();
      g.beginPath(); g.moveTo(9, 5); g.lineTo(9, 7); g.moveTo(12, 5); g.lineTo(12, 7); g.stroke();
    },
    shop: function (g) {
      g.beginPath(); g.rect(6.5, 10, 11, 8); g.fill();
      g.beginPath(); g.arc(12, 10, 3, Math.PI, 0); g.stroke();
    },
    edu: function (g) { // 펼친 책
      g.beginPath(); g.moveTo(12, 8); g.lineTo(5.5, 6.5); g.lineTo(5.5, 16.5); g.lineTo(12, 18); g.lineTo(18.5, 16.5); g.lineTo(18.5, 6.5); g.closePath(); g.fill();
      g.save(); g.globalCompositeOperation = 'destination-out'; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(12, 8.5); g.lineTo(12, 17.5); g.stroke(); g.restore();
    },
    health: function (g) {
      g.fillRect(10, 6, 4, 12); g.fillRect(6, 10, 12, 4);
    },
    transit: function (g) { // 버스 정면
      g.beginPath(); roundRect(g, 6.5, 5.5, 11, 12, 2.2); g.fill();
      g.save(); g.globalCompositeOperation = 'destination-out';
      g.fillRect(8, 7.5, 8, 4.5); g.beginPath(); g.arc(9, 14.8, 1, 0, 7); g.arc(15, 14.8, 1, 0, 7); g.fill(); g.restore();
      g.fillRect(7.5, 17, 2, 2); g.fillRect(14.5, 17, 2, 2);
    },
    culture: function (g) { star(g, 12, 12.3, 6.5, 2.8, 5); },
    gov: function (g) {
      g.beginPath(); g.moveTo(5.5, 9.5); g.lineTo(12, 5.5); g.lineTo(18.5, 9.5); g.closePath(); g.fill();
      g.fillRect(6, 16.5, 12, 2);
      g.fillRect(7.3, 10.5, 1.8, 5.5); g.fillRect(11.1, 10.5, 1.8, 5.5); g.fillRect(14.9, 10.5, 1.8, 5.5);
    },
    money: function (g) {
      g.font = 'bold 12px Pretendard, "Malgun Gothic", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('₩', 12, 12.5);
    },
    lodging: function (g) { // 침대
      g.fillRect(5.5, 12, 13, 3.5); g.fillRect(5.5, 8, 1.8, 10); g.fillRect(16.7, 13, 1.8, 5);
      g.beginPath(); g.arc(9.6, 10.3, 1.7, 0, 7); g.fill(); g.fillRect(12, 9.2, 6.5, 2.6);
    },
    nature: function (g) { // 나무
      g.beginPath(); g.moveTo(12, 4.8); g.lineTo(17.5, 13); g.lineTo(6.5, 13); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(12, 8); g.lineTo(18.5, 16.5); g.lineTo(5.5, 16.5); g.closePath(); g.fill();
      g.fillRect(11, 16, 2, 3);
    },
    sport: function (g) {
      g.beginPath(); g.arc(12, 12, 6, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(6.5, 10); g.quadraticCurveTo(12, 13, 17.5, 10); g.moveTo(12, 6); g.lineTo(12, 18); g.stroke();
    },
    religion: function (g) {
      g.beginPath(); g.moveTo(12, 5); g.lineTo(16, 10); g.lineTo(8, 10); g.closePath(); g.fill();
      g.fillRect(8.8, 10, 6.4, 8); g.beginPath(); g.moveTo(5.5, 13.5); g.lineTo(18.5, 13.5); g.stroke();
    },
    car: function (g) {
      g.beginPath(); g.moveTo(6, 15); g.lineTo(6, 12); g.lineTo(8.3, 8.5); g.lineTo(15.7, 8.5); g.lineTo(18, 12); g.lineTo(18, 15); g.closePath(); g.fill();
      g.beginPath(); g.arc(8.8, 15.6, 1.8, 0, 7); g.arc(15.2, 15.6, 1.8, 0, 7); g.fill();
    },
    other: function (g) { g.beginPath(); g.arc(12, 12, 3.2, 0, 7); g.fill(); },
  };

  function roundRect(g, x, y, w, h, r) {
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function star(g, cx, cy, R, r, n) {
    g.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var a = (Math.PI / n) * i - Math.PI / 2, rr = i % 2 ? r : R;
      g[i ? 'lineTo' : 'moveTo'](cx + rr * Math.cos(a), cy + rr * Math.sin(a));
    }
    g.closePath(); g.fill();
  }

  function poiIcon(cat, P) {
    var k = canvas(24, 24), g = k.g;
    g.beginPath(); g.arc(12, 12, 10.5, 0, 7);
    g.fillStyle = P.poi[cat] || P.poi.other; g.fill();
    g.lineWidth = 1.5; g.strokeStyle = P.poiStroke; g.stroke();
    g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineWidth = 1.6;
    (PICTO[cat] || PICTO.other)(g);
    return { data: out(k), opts: { pixelRatio: PR } };
  }

  function peakIcon(P) {
    var k = canvas(16, 14), g = k.g;
    g.beginPath(); g.moveTo(8, 1.5); g.lineTo(15, 12.5); g.lineTo(1, 12.5); g.closePath();
    g.fillStyle = P.textPark; g.fill(); g.lineWidth = 1.4; g.strokeStyle = P.halo; g.stroke();
    return { data: out(k), opts: { pixelRatio: PR } };
  }

  function onewayIcon(P) {
    var k = canvas(18, 10), g = k.g;
    g.strokeStyle = P.oneway; g.fillStyle = P.oneway; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(2, 5); g.lineTo(12, 5); g.stroke();
    g.beginPath(); g.moveTo(16.5, 5); g.lineTo(11, 1.5); g.lineTo(11, 8.5); g.closePath(); g.fill();
    return { data: out(k), opts: { pixelRatio: PR } };
  }

  // 늘어나는 도로 번호 방패 (icon-text-fit)
  function shieldIcon(fill, stroke) {
    var k = canvas(20, 18), g = k.g;
    g.beginPath(); roundRect(g, 1, 1, 18, 16, 4);
    g.fillStyle = fill; g.fill(); g.lineWidth = 1.5; g.strokeStyle = stroke; g.stroke();
    return { data: out(k), opts: { pixelRatio: PR, stretchX: [[5 * PR, 15 * PR]], stretchY: [[5 * PR, 13 * PR]], content: [4 * PR, 3 * PR, 16 * PR, 15 * PR] } };
  }

  function busStopIcon(P) {
    var k = canvas(20, 20), g = k.g;
    g.beginPath(); roundRect(g, 1.5, 1.5, 17, 17, 4);
    g.fillStyle = P.poi.transit; g.fill(); g.lineWidth = 1.4; g.strokeStyle = P.poiStroke; g.stroke();
    g.fillStyle = '#fff'; g.save(); g.translate(-2, -2); PICTO.transit(g); g.restore();
    return { data: out(k), opts: { pixelRatio: PR } };
  }
  function bikeIcon(P) {
    var k = canvas(20, 20), g = k.g;
    g.beginPath(); g.arc(10, 10, 8.5, 0, 7);
    g.fillStyle = P.cycleway; g.fill(); g.lineWidth = 1.4; g.strokeStyle = P.poiStroke; g.stroke();
    g.strokeStyle = '#fff'; g.lineWidth = 1.3;
    g.beginPath(); g.arc(6.3, 12, 2.4, 0, 7); g.arc(13.7, 12, 2.4, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(6.3, 12); g.lineTo(9, 7.5); g.lineTo(12.5, 7.5); g.lineTo(13.7, 12); g.moveTo(9, 7.5); g.lineTo(10, 12); g.lineTo(12.5, 7.5); g.stroke();
    return { data: out(k), opts: { pixelRatio: PR } };
  }

  // ── 외벽(창문) 무늬 ─────────────────────────────────
  // 32×32 (css px) 한 장에 여러 층·창을 그려 반복 무늬가 덜 티 나게 함. 밤에는 일부 창에 불.
  function hexToRgb(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mixc(a, b, t) {
    var A = hexToRgb(a), B = hexToRgb(b);
    return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(A[i] + (B[i] - A[i]) * t); }).join(',') + ')';
  }
  function rampAt(P, h) {
    var r = P.buildingRamp;
    for (var i = 1; i < r.length; i++) if (h <= r[i][0]) {
      var t = (h - r[i - 1][0]) / (r[i][0] - r[i - 1][0]);
      return SJ.lighting.mix(r[i - 1][1], r[i][1], t);
    }
    return r[r.length - 1][1];
  }
  var STYLES = {
    // [열, 행, 창 너비 비율, 창 높이 비율, 커튼월 여부, 가로 띠]
    low: [2, 3, 0.42, 0.42, 0, 0],
    small: [3, 4, 0.5, 0.48, 0, 0],
    mid: [4, 5, 0.55, 0.5, 0, 0],
    high: [6, 6, 0.42, 0.6, 0, 0],
    tower: [4, 8, 0.86, 0.8, 1, 0],
    res: [4, 5, 0.6, 0.45, 0, 1],
    shop: [3, 4, 0.8, 0.62, 1, 0],
    band: [2, 3, 0.85, 0.22, 0, 0],
    sparse: [2, 2, 0.35, 0.35, 0, 0],
  };
  var CLASS_STYLE = { h0: 'low', h1: 'small', h2: 'mid', h3: 'high', h4: 'tower' };
  var CLASS_H = { h0: 5, h1: 17, h2: 37, h3: 70, h4: 130 };
  var USE_STYLE = { res: 'res', com: 'shop', pub: 'high', edu: 'small', med: 'high', ind: 'sparse', rel: 'sparse', tra: 'band', oth: 'small' };
  function hash(i, j, k) { var t = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return t - Math.floor(t); }

  // 확대 단계별 무늬: 한 칸 = 1개 층(약 3.7 m) × 창 1칸. 지도 배율이 2배가 될 때마다 칸 수를 절반으로 줄여
  // 벽에 보이는 창 줄 수가 실제 층수와 맞도록 합니다. [이미지 크기(px), 한 변의 칸 수]
  var ZBANDS = { 16: [32, 8], 17: [32, 4], 18: [64, 4], 19: [128, 4] };
  function facade(styleKey, wall, P, night, seed, zb) {
    var Z = ZBANDS[zb] || ZBANDS[17], W = Z[0];
    var S = STYLES[styleKey], k = canvas(W, W), g = k.g;
    var cols = Z[1], rows = Z[1], cw = W / cols, rh = W / rows;
    var wallC = night ? mixc(wall, '#05070c', P.id === 'dark' ? 0.55 : 0.6) : wall;
    g.fillStyle = wallC; g.fillRect(0, 0, W, W);
    // 층 구분선
    g.fillStyle = night ? 'rgba(0,0,0,0.25)' : mixc(wall, P.frame, 0.25);
    for (var r0 = 0; r0 < rows; r0++) g.fillRect(0, r0 * rh + rh - 0.6, W, 0.6);
    if (S[5]) { // 발코니 띠
      g.fillStyle = night ? 'rgba(255,255,255,0.06)' : mixc(wall, '#ffffff', 0.25);
      for (var r1 = 0; r1 < rows; r1++) g.fillRect(0, r1 * rh + rh * 0.72, W, rh * 0.12);
    }
    var ww = cw * S[2], wh = rh * S[3];
    for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) {
      var x = i * cw + (cw - ww) / 2, y = j * rh + (rh - wh) * 0.4;
      var col;
      if (night) {
        var h = hash(i, j, seed);
        col = h < 0.38 ? P.lit : h < 0.46 ? mixc(P.lit, '#ffffff', 0.4) : P.glassNight;
      } else {
        col = mixc(wall, P.glass, S[4] ? 0.6 : 0.5);
        if (hash(i, j, seed) < 0.15) col = mixc(wall, P.glass, 0.7); // 반사 차이
      }
      g.fillStyle = col;
      g.fillRect(x, y, ww, wh);
    }
    if (S[4]) { // 커튼월 멀리언
      g.fillStyle = night ? 'rgba(0,0,0,0.5)' : mixc(wall, P.frame, 0.45);
      for (var m = 0; m <= cols; m++) g.fillRect(m * cw - 0.4, 0, 0.8, W);
    }
    return { data: out(k), opts: { pixelRatio: PR } };
  }
  function facadeFor(id, P) {
    var night = !!SJ.icons.night;
    var zm = /-z(\d+)$/.exec(id), zb = zm ? +zm[1] : 17;
    if (zm) id = id.slice(0, zm.index);
    if (id.indexOf('sj-fac-u-') === 0) {
      var cat = id.slice(9);
      return facade(USE_STYLE[cat] || 'small', P.buildingUse[cat] || P.buildingSolid, P, night, cat.charCodeAt(0), zb);
    }
    if (id === 'sj-fac-solid') return facade('mid', P.buildingSolid, P, night, 3, zb);
    var cls = id.slice(7);
    return facade(CLASS_STYLE[cls] || 'mid', rampAt(P, CLASS_H[cls] || 30), P, night, cls.charCodeAt(1), zb);
  }
  function facadeIds() {
    var base = ['sj-fac-solid'], ids = [];
    ['h0', 'h1', 'h2', 'h3', 'h4'].forEach(function (c) { base.push('sj-fac-' + c); });
    (SJ.useCategories || []).forEach(function (c) { base.push('sj-fac-u-' + c); });
    base.forEach(function (b) { Object.keys(ZBANDS).forEach(function (z) { ids.push(b + '-z' + z); }); });
    return ids;
  }

  function crossingIcon() {
    var k = canvas(14, 14), g = k.g;
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (var i = 0; i < 4; i++) g.fillRect(1 + i * 3.4, 1, 2, 12);
    return { data: out(k), opts: { pixelRatio: PR } };
  }
  function entranceIcon(P) {
    var k = canvas(12, 12), g = k.g;
    g.beginPath(); g.moveTo(6, 10.5); g.lineTo(1.5, 3); g.lineTo(10.5, 3); g.closePath();
    g.fillStyle = P.accent; g.fill(); g.lineWidth = 1.2; g.strokeStyle = P.halo; g.stroke();
    return { data: out(k), opts: { pixelRatio: PR } };
  }

  function make(id, P) {
    if (id.indexOf('sj-poi-') === 0) return poiIcon(id.slice(7), P);
    if (id.indexOf('sj-fac-') === 0) return facadeFor(id, P);
    switch (id) {
      case 'sj-peak': return peakIcon(P);
      case 'sj-oneway': return onewayIcon(P);
      case 'sj-shield-motorway': return shieldIcon('#2c5aa0', '#ffffff');
      case 'sj-shield-road': return shieldIcon('#3d7f5f', '#ffffff');
      case 'sj-bus': return busStopIcon(P);
      case 'sj-bike': return bikeIcon(P);
      case 'sj-crossing': return crossingIcon();
      case 'sj-entrance': return entranceIcon(P);
    }
    return null;
  }

  SJ.icons = {
    ids: function () {
      return SJ.poiCategories.map(function (c) { return 'sj-poi-' + c; })
        .concat(['sj-peak', 'sj-oneway', 'sj-shield-motorway', 'sj-shield-road', 'sj-bus', 'sj-bike', 'sj-crossing', 'sj-entrance'])
        .concat(facadeIds());
    },
    make: make,
    // 지도에 없는 이미지를 요청받았을 때
    onMissing: function (map, id, P) {
      var r = make(id, P);
      if (r && !map.hasImage(id)) map.addImage(id, r.data, r.opts);
    },
    night: false,
    // 밤/낮이 바뀌면 외벽 무늬만 다시 그림 (등록된 것만)
    setNight: function (map, P, night) {
      if (SJ.icons.night === night) return false;
      SJ.icons.night = night;
      facadeIds().forEach(function (id) {
        if (!map.hasImage(id)) return;
        var r = make(id, P);
        map.updateImage(id, r.data);
      });
      return true;
    },
    // 테마가 바뀌면 이미 등록된 이미지를 새 색으로 교체
    refresh: function (map, P) {
      SJ.icons.ids().forEach(function (id) {
        var r = make(id, P);
        if (!r) return;
        if (map.hasImage(id)) map.removeImage(id);
        map.addImage(id, r.data, r.opts);
      });
    },
    poiIconDataUrl: function (cat, P) {
      var r = poiIcon(cat, P), c = document.createElement('canvas');
      c.width = r.data.width; c.height = r.data.height;
      c.getContext('2d').putImageData(r.data, 0, 0);
      return c.toDataURL();
    },
  };
})();
