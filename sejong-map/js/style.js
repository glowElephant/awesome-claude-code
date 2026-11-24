/*
 * 세종 3D 지도 — 지도 스타일 생성기
 * OpenMapTiles 스키마(https://openmaptiles.org/schema/)의 레이어·속성 이름을 사용합니다.
 *   water, waterway, landcover, landuse, park, boundary, transportation,
 *   transportation_name, building, place, poi, aeroway, mountain_peak,
 *   water_name, housenumber
 * buildStyle(palette, state) 는 순수 함수로, 테마 전환 시 다시 호출되어
 * map.setStyle(..., {diff:true}) 로 부드럽게 바뀝니다.
 */
(function () {
  'use strict';
  var SJ = (window.SJ = window.SJ || {});
  var C = SJ.config;

  // ── POI 분류: OpenMapTiles poi.class → 아이콘 범주 / 한국어 이름 ─────────
  var POI = {
    food: ['restaurant', 'fast_food', 'food_court', 'bakery', 'ice_cream', 'bar', 'beer', 'pub', 'biergarten', 'alcohol_shop', 'deli', 'butcher', 'confectionery'],
    cafe: ['cafe'],
    shop: ['shop', 'grocery', 'supermarket', 'convenience', 'clothing_store', 'department_store', 'mall', 'books', 'gift', 'jewelry', 'shoe', 'florist', 'furniture', 'mobile_phone', 'stationery', 'toys', 'hairdresser', 'laundry', 'music', 'electronics', 'hardware', 'doityourself', 'garden_centre', 'optician', 'beauty', 'cosmetics', 'marketplace', 'pet', 'sports', 'outdoor', 'video'],
    edu: ['school', 'college', 'university', 'kindergarten', 'library'],
    health: ['hospital', 'clinic', 'doctors', 'dentist', 'pharmacy', 'veterinary'],
    transit: ['bus', 'railway', 'aerialway', 'ferry_terminal', 'harbor', 'entrance', 'airport', 'aerodrome'],
    culture: ['attraction', 'museum', 'art_gallery', 'theatre', 'cinema', 'castle', 'monument', 'memorial', 'artwork', 'viewpoint', 'information', 'zoo', 'aquarium', 'theme_park', 'arts_centre'],
    gov: ['town_hall', 'office', 'police', 'fire_station', 'post', 'courthouse', 'embassy', 'prison', 'community_centre', 'government'],
    money: ['bank', 'atm', 'bureau_de_change'],
    lodging: ['lodging', 'hotel', 'motel', 'hostel', 'guest_house', 'campsite', 'caravan_site'],
    nature: ['park', 'garden', 'nature_reserve', 'dog_park', 'playground', 'picnic_site', 'cemetery'],
    sport: ['stadium', 'pitch', 'sports_centre', 'swimming', 'swimming_pool', 'golf', 'fitness', 'ice_rink', 'tennis', 'water_park', 'bowling_alley', 'climbing'],
    religion: ['place_of_worship', 'religion', 'church', 'temple', 'shrine'],
    car: ['car', 'fuel', 'charging_station', 'parking', 'bicycle', 'bicycle_rental', 'bicycle_parking', 'car_rental', 'car_wash', 'motorcycle'],
  };
  SJ.poiCategories = Object.keys(POI).concat(['other']);
  SJ.poiCategoryLabels = {
    food: '음식·주점', cafe: '카페', shop: '쇼핑', edu: '교육', health: '의료', transit: '교통',
    culture: '문화·관광', gov: '공공기관', money: '금융', lodging: '숙박', nature: '공원·자연',
    sport: '체육', religion: '종교', car: '차량·자전거', other: '기타',
  };
  SJ.poiCategoryOf = function (cls, subclass) {
    for (var k in POI) if (POI[k].indexOf(subclass) >= 0) return k;
    for (var j in POI) if (POI[j].indexOf(cls) >= 0) return j;
    return 'other';
  };
  // 팝업용 한국어 분류명 (없으면 원문 표시)
  SJ.classLabelsKo = {
    restaurant: '음식점', fast_food: '패스트푸드', bakery: '제과점', ice_cream: '아이스크림', bar: '바', beer: '맥주집', pub: '펍',
    cafe: '카페', shop: '상점', grocery: '식료품점', supermarket: '슈퍼마켓', convenience: '편의점', clothing_store: '의류점',
    department_store: '백화점', mall: '쇼핑몰', books: '서점', hairdresser: '미용실', laundry: '세탁소', marketplace: '시장',
    school: '학교', college: '대학', university: '대학교', kindergarten: '유치원', library: '도서관',
    hospital: '병원', clinic: '의원', doctors: '의원', dentist: '치과', pharmacy: '약국', veterinary: '동물병원',
    bus: '버스', bus_stop: '버스 정류장', bus_station: '버스 터미널', railway: '철도', station: '역', halt: '간이역', aerialway: '삭도',
    attraction: '명소', museum: '박물관', art_gallery: '미술관', theatre: '공연장', cinema: '영화관', castle: '성곽',
    monument: '기념물', memorial: '기념비', viewpoint: '전망대', information: '안내소', zoo: '동물원', theme_park: '테마파크',
    town_hall: '시청·행정복지센터', office: '사무소', police: '경찰', fire_station: '소방서', post: '우체국', courthouse: '법원',
    community_centre: '주민센터', government: '정부기관', bank: '은행', atm: 'ATM', lodging: '숙박', hotel: '호텔', motel: '모텔',
    campsite: '캠핑장', park: '공원', garden: '정원', playground: '놀이터', cemetery: '묘지', nature_reserve: '자연보호구역',
    stadium: '경기장', pitch: '운동장', sports_centre: '체육관', swimming: '수영장', swimming_pool: '수영장', golf: '골프장', fitness: '피트니스',
    place_of_worship: '종교시설', church: '교회', temple: '사찰', car: '자동차', fuel: '주유소', charging_station: '전기차 충전소',
    parking: '주차장', bicycle: '자전거', bicycle_rental: '공공자전거 대여소', bicycle_parking: '자전거 주차장', toilets: '화장실',
    // 도로
    motorway: '고속도로', trunk: '간선도로', primary: '주요 도로', secondary: '보조 간선', tertiary: '지선 도로', minor: '소로',
    service: '진입로', track: '농로·임도', path: '보행로', busway: '버스 전용도로', footway: '보도', cycleway: '자전거 도로',
    steps: '계단', pedestrian: '보행자 도로', rail: '철도', transit: '도시철도', subway: '지하철', light_rail: '경전철',
    // 수계·토지
    river: '강', stream: '하천', canal: '운하', drain: '배수로', ditch: '도랑', lake: '호수', pond: '연못', reservoir: '저수지',
    wood: '숲', grass: '초지', farmland: '농경지', wetland: '습지', residential: '주거지', commercial: '상업지', industrial: '공업지',
    retail: '상업지', hospital_land: '병원', bridge: '교량', tunnel: '터널', ford: '여울',
    city: '시', town: '읍', village: '면·마을', suburb: '동', quarter: '동', neighbourhood: '동네', hamlet: '마을',
  };

  // ── 공통 표현식 ─────────────────────────────────────────
  var NAME = ['coalesce', ['get', 'name:ko'], ['get', 'name'], ''];
  function labelExpr(withLatin) {
    if (!withLatin) return NAME;
    return ['let', 'ko', NAME, 'en', ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name_en'], ''],
      ['case',
        ['all', ['!=', ['var', 'en'], ''], ['!=', ['var', 'en'], ['var', 'ko']]],
        ['format', ['var', 'ko'], {}, '\n', {}, ['var', 'en'], { 'font-scale': 0.78 }],
        ['format', ['var', 'ko'], {}]]];
  }
  SJ.labelExpr = labelExpr;
  SJ.heightExpr = ['coalesce', ['get', 'render_height'], C.defaultBuildingHeight];
  SJ.baseExpr = ['coalesce', ['get', 'render_min_height'], 0];

  function z(stops, base) {
    var e = ['interpolate', ['exponential', base || 1.5], ['zoom']];
    stops.forEach(function (s) { e.push(s[0], s[1]); });
    return e;
  }
  function zl(stops) {
    var e = ['interpolate', ['linear'], ['zoom']];
    stops.forEach(function (s) { e.push(s[0], s[1]); });
    return e;
  }

  // 도로 폭 표 (px) — Z 는 줌 단계
  var Z = [6, 10, 12, 14, 16, 18, 20];
  var ROAD_W = {
    motorway: [0.6, 1.6, 2.6, 4.2, 9, 22, 56],
    trunk: [0.5, 1.4, 2.4, 4, 8.5, 21, 52],
    primary: [0.3, 1.1, 2, 3.6, 8, 20, 48],
    secondary: [0.1, 0.8, 1.6, 3, 7, 17, 42],
    tertiary: [0, 0.5, 1.2, 2.5, 6, 15, 38],
    busway: [0, 0.4, 1, 2.2, 5.5, 14, 34],
    minor: [0, 0, 0.6, 1.6, 4.5, 12, 30],
    service: [0, 0, 0.2, 0.9, 2.6, 7, 18],
  };
  var CASING_EXTRA = [0.2, 0.5, 0.8, 1.2, 1.8, 2.6, 4];
  var ROAD_CLASSES = Object.keys(ROAD_W);

  function roadWidth(extra, mult) {
    var e = ['interpolate', ['exponential', 1.5], ['zoom']];
    Z.forEach(function (zz, i) {
      var m = ['match', ['get', 'class']];
      ROAD_CLASSES.forEach(function (c) {
        var w = ROAD_W[c][i] * (mult || 1);
        m.push(c, +(w + (w > 0 ? extra[i] : 0)).toFixed(2));
      });
      m.push(0);
      e.push(zz, ['*', m, ['case', ['==', ['get', 'ramp'], 1], 0.75, 1]]);
    });
    return e;
  }
  var NO_EXTRA = Z.map(function () { return 0; });
  var ROAD_SORT = ['match', ['get', 'class'], 'motorway', 9, 'trunk', 8, 'primary', 7, 'secondary', 6, 'tertiary', 5, 'busway', 4, 'minor', 3, 'service', 2, 1];

  function roadColor(P) {
    return ['match', ['get', 'class'],
      'motorway', P.motorway, 'trunk', P.trunk, 'primary', P.primary, 'secondary', P.secondary,
      'tertiary', P.tertiary, 'busway', P.busway, 'minor', P.minor, 'service', P.service, P.minor];
  }

  function brunnelFilter(group) {
    var b = ['coalesce', ['get', 'brunnel'], ''];
    if (group === 'tunnel') return ['==', b, 'tunnel'];
    if (group === 'bridge') return ['==', b, 'bridge'];
    return ['!', ['in', b, ['literal', ['tunnel', 'bridge']]]];
  }
  function isLine() { return ['==', ['geometry-type'], 'LineString']; }

  // ── 건물 색 ──────────────────────────────────────────
  function rampExpr(P) {
    var e = ['interpolate', ['linear'], SJ.heightExpr];
    P.buildingRamp.forEach(function (s) { e.push(s[0], s[1]); });
    return e;
  }
  SJ.buildingColor = function (P, mode) {
    if (mode === 'solid') return P.buildingSolid;
    if (mode === 'osm') {
      return ['case', ['has', 'colour'], ['to-color', ['get', 'colour'], P.buildingSolid], rampExpr(P)];
    }
    return rampExpr(P);
  };

  function vis(on) { return on ? 'visible' : 'none'; }

  // POI 아이콘 이미지 이름 표현식
  function poiIconExpr() {
    var m = ['match', ['coalesce', ['get', 'subclass'], '']];
    var seen = {};
    Object.keys(POI).forEach(function (cat) {
      POI[cat].forEach(function (c) { if (!seen[c]) { seen[c] = 1; m.push(c, 'sj-poi-' + cat); } });
    });
    var m2 = ['match', ['coalesce', ['get', 'class'], '']];
    var seen2 = {};
    Object.keys(POI).forEach(function (cat) {
      POI[cat].forEach(function (c) { if (!seen2[c]) { seen2[c] = 1; m2.push(c, 'sj-poi-' + cat); } });
    });
    m2.push('sj-poi-other');
    m.push(m2);
    return m;
  }

  // 레이어 ID 그룹 (토글용)
  SJ.layerGroups = {
    labels: [], // 아래에서 채움
    poi: ['label-poi'],
    housenumber: ['label-housenumber'],
    adminLines: ['admin-8', 'admin-6', 'admin-4'],
    hillshade: ['hillshade'],
    relief: ['color-relief'],
  };
  SJ.FIRST_LABEL_LAYER = 'label-waterway';

  SJ.buildStyle = function (P, S) {
    var F = C.fontRegular, FB = C.fontBold;
    var light = SJ.lighting ? SJ.lighting.compute(S.timeMin, P) : null;
    var layers = [];
    var add = function (l) { layers.push(l); return l; };

    add({ id: 'background', type: 'background', paint: { 'background-color': P.land } });

    // ── 토지 이용 ──
    add({ id: 'landuse', type: 'fill', source: 'omt', 'source-layer': 'landuse',
      filter: ['!', ['in', ['get', 'class'], ['literal', ['suburb', 'quarter', 'neighbourhood']]]],
      paint: {
        'fill-color': ['match', ['get', 'class'],
          'residential', P.residential, 'garages', P.residential,
          'commercial', P.commercial, 'retail', P.commercial,
          'industrial', P.industrial, 'quarry', P.industrial,
          'school', P.education, 'university', P.education, 'college', P.education, 'kindergarten', P.education, 'library', P.education,
          'hospital', P.hospital, 'cemetery', P.cemetery, 'military', P.military,
          'stadium', P.sport, 'pitch', P.sport, 'playground', P.sport, 'track', P.sport, 'theme_park', P.sport, 'zoo', P.sport,
          'railway', P.railwayLand, 'bus_station', P.railwayLand,
          P.residential],
        'fill-opacity': zl([[8, 0.5], [12, 0.85], [15, 1]]),
      } });
    add({ id: 'landcover', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      paint: {
        'fill-color': ['match', ['get', 'class'],
          'wood', P.wood, 'forest', P.wood, 'grass', P.grass, 'farmland', P.farmland, 'wetland', P.wetland,
          'sand', P.sand, 'rock', P.rock, 'ice', P.rock, P.grass],
        'fill-opacity': ['match', ['get', 'class'], 'wood', 0.95, 'farmland', 0.8, 0.85],
        'fill-antialias': false,
      } });
    add({ id: 'landuse-sport-outline', type: 'line', source: 'omt', 'source-layer': 'landuse', minzoom: 15,
      filter: ['in', ['get', 'class'], ['literal', ['pitch', 'track', 'stadium']]],
      paint: { 'line-color': P.parkOutline, 'line-width': 1, 'line-opacity': 0.6 } });
    add({ id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': P.park, 'fill-opacity': zl([[8, 0.5], [13, 0.85]]) } });
    add({ id: 'park-outline', type: 'line', source: 'omt', 'source-layer': 'park', minzoom: 12,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'line-color': P.parkOutline, 'line-width': zl([[12, 0.5], [16, 1.5]]), 'line-opacity': 0.7 } });

    // ── 지형 음영 ──
    add({ id: 'color-relief', type: 'color-relief', source: 'dem-shade',
      layout: { visibility: vis(S.relief) },
      paint: {
        'color-relief-color': (function () {
          var e = ['interpolate', ['linear'], ['elevation']];
          P.relief.forEach(function (s) { e.push(s[0], s[1]); });
          return e;
        })(),
        'color-relief-opacity': 0.55,
      } });
    add({ id: 'hillshade', type: 'hillshade', source: 'dem-shade',
      layout: { visibility: vis(S.hillshade) },
      paint: {
        'hillshade-exaggeration': P.id === 'dark' ? 0.5 : 0.4,
        'hillshade-shadow-color': P.shadow,
        'hillshade-highlight-color': P.highlight,
        'hillshade-accent-color': P.accentShade,
        'hillshade-illumination-anchor': 'map',
        'hillshade-illumination-direction': light ? light.hillDirection : 315,
        'hillshade-illumination-altitude': light ? light.hillAltitude : 45,
      } });

    // ── 물 ──
    add({ id: 'waterway-tunnel', type: 'line', source: 'omt', 'source-layer': 'waterway', minzoom: 14,
      filter: ['==', ['get', 'brunnel'], 'tunnel'],
      paint: { 'line-color': P.waterLine, 'line-width': z([[14, 0.8], [18, 3]]), 'line-dasharray': [3, 3], 'line-opacity': 0.6 } });
    add({ id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway',
      filter: ['!=', ['coalesce', ['get', 'brunnel'], ''], 'tunnel'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': P.waterLine,
        'line-width': ['interpolate', ['exponential', 1.4], ['zoom'],
          9, ['match', ['get', 'class'], 'river', 1, 'canal', 0.8, 0.2],
          13, ['match', ['get', 'class'], 'river', 2.5, 'canal', 2, 'stream', 1, 0.6],
          17, ['match', ['get', 'class'], 'river', 10, 'canal', 7, 'stream', 3.5, 2]],
        'line-opacity': ['case', ['==', ['get', 'intermittent'], 1], 0.5, 1],
      } });
    add({ id: 'water-shadow', type: 'line', source: 'omt', 'source-layer': 'water', minzoom: 12,
      filter: ['!=', ['coalesce', ['get', 'brunnel'], ''], 'tunnel'],
      paint: { 'line-color': P.waterShadow, 'line-width': zl([[12, 0.6], [17, 3]]), 'line-blur': 2, 'line-opacity': 0.8 } });
    add({ id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water',
      filter: ['!=', ['coalesce', ['get', 'brunnel'], ''], 'tunnel'],
      paint: {
        'fill-color': P.water,
        'fill-opacity': ['case', ['==', ['get', 'intermittent'], 1], 0.55, 1],
      } });
    add({ id: 'water-outline', type: 'line', source: 'omt', 'source-layer': 'water', minzoom: 13,
      filter: ['!=', ['coalesce', ['get', 'brunnel'], ''], 'tunnel'],
      paint: { 'line-color': P.waterLine, 'line-width': zl([[13, 0.4], [18, 1.2]]), 'line-opacity': 0.8 } });

    // ── 공항·부두 ──
    add({ id: 'aeroway-area', type: 'fill', source: 'omt', 'source-layer': 'aeroway', minzoom: 11,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': P.aeroway, 'fill-opacity': 0.9 } });
    add({ id: 'aeroway-line', type: 'line', source: 'omt', 'source-layer': 'aeroway', minzoom: 11,
      filter: ['all', isLine(), ['in', ['get', 'class'], ['literal', ['runway', 'taxiway']]]],
      paint: { 'line-color': P.aeroway, 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'],
        11, ['match', ['get', 'class'], 'runway', 3, 0.5], 17, ['match', ['get', 'class'], 'runway', 60, 12]] } });
    add({ id: 'pier', type: 'fill', source: 'omt', 'source-layer': 'transportation', minzoom: 13,
      filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'class'], 'pier']],
      paint: { 'fill-color': P.pier } });
    add({ id: 'pedestrian-area', type: 'fill', source: 'omt', 'source-layer': 'transportation', minzoom: 14,
      filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['in', ['get', 'class'], ['literal', ['path', 'minor', 'service']]]],
      paint: { 'fill-color': P.tunnelFill, 'fill-opacity': 0.6 } });

    // ── 도로·철도 (터널 → 지상 → 교량) ──
    ['tunnel', 'surface', 'bridge'].forEach(function (g) {
      var bf = brunnelFilter(g);
      var pre = g === 'surface' ? 'road' : g;
      var tunnel = g === 'tunnel', bridge = g === 'bridge';

      // 보행로·자전거길·계단·농로
      add({ id: pre + '-path', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 14,
        filter: ['all', isLine(), bf, ['==', ['get', 'class'], 'path'],
          ['!', ['in', ['coalesce', ['get', 'subclass'], ''], ['literal', ['cycleway', 'steps']]]]],
        paint: { 'line-color': P.path, 'line-width': zl([[14, 0.6], [16, 1.2], [18, 2.2], [20, 4]]),
          'line-dasharray': [2, 1.5], 'line-opacity': tunnel ? 0.5 : 0.9 } });
      add({ id: pre + '-cycleway', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 13,
        filter: ['all', isLine(), bf, ['==', ['get', 'class'], 'path'], ['==', ['get', 'subclass'], 'cycleway']],
        paint: { 'line-color': P.cycleway, 'line-width': zl([[13, 0.6], [16, 1.6], [18, 3], [20, 5]]),
          'line-dasharray': [3, 1], 'line-opacity': tunnel ? 0.5 : 0.95 } });
      add({ id: pre + '-steps', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 15,
        filter: ['all', isLine(), bf, ['==', ['get', 'subclass'], 'steps']],
        paint: { 'line-color': P.steps, 'line-width': zl([[15, 1.5], [18, 4], [20, 7]]), 'line-dasharray': [0.4, 0.4] } });
      if (!tunnel) {
        add({ id: pre + '-track', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 13,
          filter: ['all', isLine(), bf, ['==', ['get', 'class'], 'track']],
          paint: { 'line-color': P.track, 'line-width': zl([[13, 0.6], [16, 1.5], [18, 3]]), 'line-dasharray': [3, 2] } });
      }

      // 교량 외곽(난간 느낌)
      if (bridge) {
        add({ id: 'bridge-outline', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 13,
          filter: ['all', isLine(), bf, ['in', ['get', 'class'], ['literal', ROAD_CLASSES]]],
          layout: { 'line-join': 'round', 'line-sort-key': ROAD_SORT },
          paint: { 'line-color': P.bridgeCasing, 'line-width': roadWidth(CASING_EXTRA.map(function (x) { return x * 2.2; })), 'line-opacity': 0.9 } });
      }
      // 도로 외곽선
      add({ id: pre + '-casing', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: tunnel ? 12 : 5,
        filter: ['all', isLine(), bf, ['in', ['get', 'class'], ['literal', ROAD_CLASSES]]],
        layout: { 'line-cap': tunnel ? 'butt' : 'round', 'line-join': 'round', 'line-sort-key': ROAD_SORT },
        paint: Object.assign({
          'line-color': P.roadCasing,
          'line-width': roadWidth(CASING_EXTRA),
          'line-opacity': zl([[5, 0], [7, 0.6], [11, 1]]),
        }, tunnel ? { 'line-dasharray': [0.6, 0.4] } : {}) });
      // 도로 본선
      add({ id: pre + '-fill', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: tunnel ? 12 : 5,
        filter: ['all', isLine(), bf, ['in', ['get', 'class'], ['literal', ROAD_CLASSES]]],
        layout: { 'line-cap': tunnel ? 'butt' : 'round', 'line-join': 'round', 'line-sort-key': ROAD_SORT },
        paint: {
          'line-color': tunnel ? P.tunnelFill : roadColor(P),
          'line-width': roadWidth(NO_EXTRA),
          'line-opacity': tunnel ? 0.75 : 1,
        } });
      // 공사 중 도로
      if (!tunnel) {
        add({ id: pre + '-construction', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 13,
          filter: ['all', isLine(), bf, ['in', ['get', 'class'], ['literal',
            ['motorway_construction', 'trunk_construction', 'primary_construction', 'secondary_construction',
              'tertiary_construction', 'minor_construction', 'service_construction', 'path_construction', 'busway_construction']]]],
          paint: { 'line-color': P.construction, 'line-width': zl([[13, 1], [16, 3], [18, 8]]), 'line-dasharray': [2, 2] } });
      }
      // 철도
      var railF = ['all', isLine(), bf, ['in', ['get', 'class'], ['literal', ['rail', 'transit']]]];
      add({ id: pre + '-rail', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 8,
        filter: railF,
        paint: Object.assign({ 'line-color': P.rail, 'line-width': zl([[8, 0.6], [12, 1.2], [16, 2.6], [19, 4]]),
          'line-opacity': tunnel ? 0.45 : 1 }, tunnel ? { 'line-dasharray': [2, 2] } : {}) });
      if (!tunnel) {
        add({ id: pre + '-rail-ticks', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 13,
          filter: railF,
          paint: { 'line-color': P.railTick, 'line-width': zl([[13, 0.8], [16, 1.6], [19, 2.6]]), 'line-dasharray': [0.25, 4] } });
      }
    });
    add({ id: 'ferry', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 10,
      filter: ['all', isLine(), ['==', ['get', 'class'], 'ferry']],
      paint: { 'line-color': P.ferry, 'line-width': 1.2, 'line-dasharray': [3, 2] } });
    add({ id: 'road-oneway', type: 'symbol', source: 'omt', 'source-layer': 'transportation', minzoom: 16,
      filter: ['all', isLine(), ['in', ['get', 'oneway'], ['literal', [1, -1]]],
        ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'busway']]]],
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 120, 'icon-image': 'sj-oneway',
        'icon-rotate': ['case', ['==', ['get', 'oneway'], -1], 180, 0], 'icon-size': zl([[16, 0.6], [19, 1]]),
        'icon-rotation-alignment': 'map', 'icon-padding': 2 },
      paint: { 'icon-opacity': 0.75 } });

    // ── 행정 경계 (타일 내장) ──
    add({ id: 'admin-8', type: 'line', source: 'omt', 'source-layer': 'boundary', minzoom: 11,
      filter: ['all', ['>=', ['get', 'admin_level'], 7], ['<=', ['get', 'admin_level'], 10], ['!=', ['get', 'maritime'], 1]],
      layout: { visibility: vis(S.adminLines), 'line-join': 'round' },
      paint: { 'line-color': P.boundary8, 'line-width': zl([[11, 0.6], [16, 1.6]]), 'line-dasharray': [1, 2], 'line-opacity': 0.8 } });
    add({ id: 'admin-6', type: 'line', source: 'omt', 'source-layer': 'boundary', minzoom: 8,
      filter: ['all', ['in', ['get', 'admin_level'], ['literal', [5, 6]]], ['!=', ['get', 'maritime'], 1]],
      layout: { visibility: vis(S.adminLines), 'line-join': 'round' },
      paint: { 'line-color': P.boundary6, 'line-width': zl([[8, 0.8], [16, 2]]), 'line-dasharray': [3, 2], 'line-opacity': 0.85 } });
    add({ id: 'admin-4', type: 'line', source: 'omt', 'source-layer': 'boundary',
      filter: ['all', ['<=', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
      layout: { visibility: vis(S.adminLines), 'line-join': 'round' },
      paint: { 'line-color': P.boundary4, 'line-width': zl([[6, 1], [16, 3]]), 'line-dasharray': [4, 2, 1, 2], 'line-opacity': 0.9 } });

    // ── 건물 ──
    var bcol = SJ.buildingColor(P, S.colorMode);
    add({ id: 'building-flat', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 13,
      layout: { visibility: vis(S.buildings === 'flat') },
      paint: { 'fill-color': bcol, 'fill-outline-color': P.buildingFlatOutline, 'fill-opacity': zl([[13, 0.6], [15, 1]]) } });
    add({ id: 'building-3d', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 13,
      filter: ['!=', ['get', 'hide_3d'], true],
      layout: { visibility: vis(S.buildings === '3d') },
      paint: {
        'fill-extrusion-color': bcol,
        'fill-extrusion-height': zl([[13, 0], [13.6, SJ.heightExpr]]),
        'fill-extrusion-base': zl([[13, 0], [13.6, SJ.baseExpr]]),
        'fill-extrusion-opacity': 0.93,
        'fill-extrusion-vertical-gradient': true,
      } });

    // ── 라벨 ──
    var halo = { 'text-halo-color': P.halo, 'text-halo-width': 1.4, 'text-halo-blur': 0.4 };
    var LBL = labelExpr(S.latin);
    var showLabels = vis(S.labels);
    var labels = [];
    var addL = function (l) { l.layout = l.layout || {}; if (!('visibility' in l.layout)) l.layout.visibility = showLabels; labels.push(l.id); return add(l); };

    addL({ id: 'label-waterway', type: 'symbol', source: 'omt', 'source-layer': 'waterway', minzoom: 12,
      filter: ['!=', NAME, ''],
      layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': F, 'text-size': zl([[12, 10], [17, 13]]),
        'text-letter-spacing': 0.1, 'symbol-spacing': 350, 'text-max-angle': 30 },
      paint: Object.assign({ 'text-color': P.textWater }, halo) });
    addL({ id: 'label-park', type: 'symbol', source: 'omt', 'source-layer': 'park', minzoom: 13,
      filter: ['!=', NAME, ''],
      layout: { 'text-field': LBL, 'text-font': F, 'text-size': zl([[13, 10.5], [17, 13]]), 'text-max-width': 7,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 99] },
      paint: Object.assign({ 'text-color': P.textPark }, halo) });
    addL({ id: 'label-water', type: 'symbol', source: 'omt', 'source-layer': 'water_name', minzoom: 10,
      filter: ['!=', NAME, ''],
      layout: { 'text-field': LBL, 'text-font': F, 'text-size': zl([[10, 11], [16, 15]]), 'text-max-width': 7 },
      paint: Object.assign({ 'text-color': P.textWater }, halo) });
    addL({ id: 'label-road', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 13,
      filter: ['all', ['!=', NAME, ''], ['step', ['zoom'],
        ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]], 15, true]],
      layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': F,
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 16, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 13, 12], 19, 15],
        'text-max-angle': 35, 'symbol-spacing': 280, 'text-padding': 4,
        'symbol-sort-key': ['-', 10, ROAD_SORT] },
      paint: Object.assign({ 'text-color': P.textRoad }, halo) });
    addL({ id: 'label-road-shield', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 10,
      filter: ['all', ['has', 'ref'], ['<=', ['coalesce', ['get', 'ref_length'], 3], 6],
        ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]]],
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 500, 'text-field': ['get', 'ref'], 'text-font': FB,
        'text-size': 10, 'text-rotation-alignment': 'viewport', 'icon-rotation-alignment': 'viewport',
        'icon-image': ['match', ['get', 'class'], 'motorway', 'sj-shield-motorway', 'sj-shield-road'],
        'icon-text-fit': 'both', 'icon-text-fit-padding': [2, 4, 2, 4] },
      paint: { 'text-color': '#ffffff' } });
    addL({ id: 'label-housenumber', type: 'symbol', source: 'omt', 'source-layer': 'housenumber', minzoom: 17,
      layout: { visibility: vis(S.labels && S.housenumbers), 'text-field': ['to-string', ['get', 'housenumber']], 'text-font': F, 'text-size': 10, 'text-padding': 2 },
      paint: { 'text-color': P.housenumber, 'text-halo-color': P.halo, 'text-halo-width': 1 } });
    addL({ id: 'label-poi', type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom: 13,
      filter: ['all', ['!=', NAME, ''], ['step', ['zoom'],
        ['<=', ['coalesce', ['get', 'rank'], 99], 3], 15, ['<=', ['coalesce', ['get', 'rank'], 99], 14],
        16, ['<=', ['coalesce', ['get', 'rank'], 99], 30], 17, true]],
      layout: { visibility: vis(S.labels && S.poi),
        'icon-image': poiIconExpr(), 'icon-size': zl([[13, 0.75], [17, 1]]),
        'text-field': LBL, 'text-font': F, 'text-size': zl([[13, 10.5], [18, 12.5]]), 'text-max-width': 8,
        'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': 0.9, 'text-justify': 'auto',
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 99], 'text-optional': true, 'icon-padding': 3 },
      paint: Object.assign({ 'text-color': P.textMuted }, halo) });
    addL({ id: 'label-peak', type: 'symbol', source: 'omt', 'source-layer': 'mountain_peak', minzoom: 10,
      filter: ['all', ['!=', NAME, ''], ['!', ['in', ['coalesce', ['get', 'class'], 'peak'], ['literal', ['saddle', 'cliff', 'ridge', 'arete']]]]],
      layout: { 'icon-image': 'sj-peak', 'icon-size': 0.8, 'icon-anchor': 'bottom',
        'text-field': ['case', ['has', 'ele'],
          ['format', NAME, {}, '\n', {}, ['concat', ['to-string', ['round', ['to-number', ['get', 'ele']]]], ' m'], { 'font-scale': 0.82 }],
          ['format', NAME, {}]],
        'text-font': F, 'text-size': zl([[10, 10], [15, 12.5]]), 'text-anchor': 'top', 'text-offset': [0, 0.2],
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 99], 'text-optional': true },
      paint: Object.assign({ 'text-color': P.textPark }, halo) });
    addL({ id: 'label-airport', type: 'symbol', source: 'omt', 'source-layer': 'aerodrome_label', minzoom: 10,
      filter: ['!=', NAME, ''],
      layout: { 'text-field': LBL, 'text-font': F, 'text-size': 12 },
      paint: Object.assign({ 'text-color': P.textMuted }, halo) });
    addL({ id: 'label-place-minor', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 13,
      filter: ['all', ['!=', NAME, ''], ['in', ['get', 'class'], ['literal', ['neighbourhood', 'hamlet', 'isolated_dwelling', 'quarter']]]],
      layout: { 'text-field': LBL, 'text-font': F, 'text-size': zl([[13, 11], [17, 14]]), 'text-max-width': 7,
        'text-letter-spacing': 0.04, 'symbol-sort-key': ['coalesce', ['get', 'rank'], 99], 'text-padding': 6 },
      paint: Object.assign({ 'text-color': P.textMuted }, halo) });
    addL({ id: 'label-place-suburb', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 10.5,
      filter: ['all', ['!=', NAME, ''], ['in', ['get', 'class'], ['literal', ['suburb', 'village', 'island']]]],
      layout: { 'text-field': LBL, 'text-font': F, 'text-size': zl([[10.5, 11.5], [15, 15]]), 'text-max-width': 7,
        'text-letter-spacing': 0.06, 'symbol-sort-key': ['coalesce', ['get', 'rank'], 99], 'text-padding': 8 },
      paint: Object.assign({ 'text-color': P.text }, halo) });
    addL({ id: 'label-place-town', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 8.5,
      filter: ['all', ['!=', NAME, ''], ['==', ['get', 'class'], 'town']],
      layout: { 'text-field': LBL, 'text-font': FB, 'text-size': zl([[9, 12.5], [14, 17]]), 'text-max-width': 7,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 99] },
      paint: Object.assign({ 'text-color': P.text }, halo, { 'text-halo-width': 1.8 }) });
    addL({ id: 'label-place-city', type: 'symbol', source: 'omt', 'source-layer': 'place', maxzoom: 14,
      filter: ['all', ['!=', NAME, ''], ['in', ['get', 'class'], ['literal', ['city', 'state', 'province']]]],
      layout: { 'text-field': LBL, 'text-font': FB, 'text-size': zl([[8, 14], [12, 22]]), 'text-max-width': 8,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 99] },
      paint: Object.assign({ 'text-color': P.placeCity }, halo, { 'text-halo-width': 2 }) });

    SJ.layerGroups.labels = labels;

    var style = {
      version: 8,
      name: '세종 3D 지도 (' + P.label + ')',
      glyphs: C.glyphsUrl,
      sources: {
        omt: { type: 'vector', url: C.tileJsonUrl, attribution: C.attribution.tiles },
        'dem-shade': { type: 'raster-dem', tiles: C.demTiles, encoding: C.demEncoding, tileSize: 256, maxzoom: C.demMaxZoom, attribution: C.attribution.dem },
        'dem-terrain': { type: 'raster-dem', tiles: C.demTiles, encoding: C.demEncoding, tileSize: 256, maxzoom: C.demMaxZoom, attribution: C.attribution.dem },
      },
      layers: layers,
    };
    if (light) {
      style.light = light.light;
      style.sky = light.sky;
    }
    if (S.terrain) style.terrain = { source: 'dem-terrain', exaggeration: S.exaggeration };
    return style;
  };
})();
