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

  function make(id, P) {
    if (id.indexOf('sj-poi-') === 0) return poiIcon(id.slice(7), P);
    switch (id) {
      case 'sj-peak': return peakIcon(P);
      case 'sj-oneway': return onewayIcon(P);
      case 'sj-shield-motorway': return shieldIcon('#2c5aa0', '#ffffff');
      case 'sj-shield-road': return shieldIcon('#3d7f5f', '#ffffff');
      case 'sj-bus': return busStopIcon(P);
      case 'sj-bike': return bikeIcon(P);
    }
    return null;
  }

  SJ.icons = {
    ids: function () {
      return SJ.poiCategories.map(function (c) { return 'sj-poi-' + c; })
        .concat(['sj-peak', 'sj-oneway', 'sj-shield-motorway', 'sj-shield-road', 'sj-bus', 'sj-bike']);
    },
    make: make,
    // 지도에 없는 이미지를 요청받았을 때
    onMissing: function (map, id, P) {
      var r = make(id, P);
      if (r && !map.hasImage(id)) map.addImage(id, r.data, r.opts);
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
