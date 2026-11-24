/*
 * 세종 3D 지도 — 시간대별 조명
 * 간단한 태양 위치 공식(적위·균시차 근사)으로 세종(북위 36.5°) 기준
 * 태양 고도/방위를 계산해 건물 조명(light), 하늘(sky), 음영 방향에 반영합니다.
 */
(function () {
  'use strict';
  var SJ = (window.SJ = window.SJ || {});
  var C = SJ.config;
  var RAD = Math.PI / 180;

  function dayOfYear(d) {
    var start = Date.UTC(d.getUTCFullYear(), 0, 0);
    return Math.floor((d.getTime() - start) / 86400000);
  }

  // minutes: 현지(KST) 시각(0–1439). 반환: { altitude, azimuth } (도, 방위는 북=0 시계방향)
  function sunPosition(minutes, lat, lng, date) {
    var N = dayOfYear(date || new Date());
    var B = (360 / 365) * (N - 81) * RAD;
    var decl = 23.44 * Math.sin(B) * RAD;
    var eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    var stdMeridian = 15 * C.timezoneOffsetHours;
    var solarMin = minutes + 4 * (lng - stdMeridian) + eot;
    var H = (solarMin / 4 - 180) * RAD;
    var phi = lat * RAD;
    var sinAlt = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
    var alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
    var az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / RAD + 180;
    return { altitude: alt / RAD, azimuth: (az + 360) % 360 };
  }

  function hex(c) {
    var n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    var A = hex(a), B = hex(b);
    return '#' + [0, 1, 2].map(function (i) {
      var v = Math.round(A[i] + (B[i] - A[i]) * t);
      return (v < 16 ? '0' : '') + v.toString(16);
    }).join('');
  }
  function smooth(e0, e1, x) {
    var t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  // 하늘 색 단계: 밤 → 박명 → 노을 → 낮
  var SKY = {
    night: { sky: '#050a18', horizon: '#16223d', light: '#8ea4d8' },
    twilight: { sky: '#1d2b55', horizon: '#c9766a', light: '#e1a27f' },
    golden: { sky: '#4f78b8', horizon: '#f4b37a', light: '#ffc48a' },
    day: { sky: '#6fa8e3', horizon: '#d9ebf8', light: '#fff5e6' },
  };

  function compute(minutes, P, date) {
    if (minutes == null) minutes = SJ.lighting.nowMinutes();
    var c = C.center;
    var sun = sunPosition(minutes, c[1], c[0], date);
    var a = sun.altitude;
    var tNight = smooth(-12, -2, a); // 0 밤, 1 해 뜰 무렵
    var tGolden = smooth(-2, 6, a);
    var tDay = smooth(6, 25, a);
    function stage(key) {
      var v = mix(SKY.night[key], SKY.twilight[key], tNight);
      v = mix(v, SKY.golden[key], tGolden);
      return mix(v, SKY.day[key], tDay);
    }
    var isDark = P.id === 'dark';
    var skyColor = stage('sky');
    var horizon = stage('horizon');
    // 색이 너무 강하면 건물 높이 색상이 왜곡되므로 흰색 쪽으로 절반쯤 섞음
    var lightColor = mix(stage('light'), '#ffffff', 0.45);
    // 다크 테마는 하늘을 약간 어둡게, 안개는 지도 배경색 쪽으로
    if (isDark) { skyColor = mix(skyColor, '#05080f', 0.35); horizon = mix(horizon, P.bg, 0.3); }
    var fog = mix(horizon, P.bg, isDark ? 0.55 : 0.35);

    var up = a > -4;
    var azimuth = up ? sun.azimuth : (sun.azimuth + 180) % 360; // 밤엔 달빛 느낌으로 반대편
    // 극각을 60° 이하로 제한: 해가 낮아도 지붕이 지나치게 어두워지지 않게
    var polar = up ? Math.max(15, Math.min(60, 90 - a)) : 45;
    var intensity = up ? 0.34 + 0.26 * smooth(-4, 40, a) : 0.3;

    return {
      sun: sun,
      light: { anchor: 'map', position: [1.3, azimuth, polar], color: lightColor, intensity: +intensity.toFixed(3) },
      sky: {
        'sky-color': skyColor,
        'horizon-color': horizon,
        'fog-color': fog,
        'sky-horizon-blend': 0.6,
        'horizon-fog-blend': 0.6,
        'fog-ground-blend': 0.55,
        'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 1, 12, 0],
      },
      hillDirection: Math.round(azimuth),
      hillAltitude: Math.round(Math.max(15, Math.min(70, up ? a : 30))),
    };
  }

  function nowMinutes() {
    var d = new Date();
    var m = d.getUTCHours() * 60 + d.getUTCMinutes() + C.timezoneOffsetHours * 60;
    return ((m % 1440) + 1440) % 1440;
  }

  function fmt(minutes) {
    var h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  SJ.lighting = { compute: compute, sunPosition: sunPosition, nowMinutes: nowMinutes, fmt: fmt, mix: mix };
})();
