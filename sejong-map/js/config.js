/*
 * 세종 3D 지도 — 설정
 * ---------------------------------------------------------------
 * 외부 데이터 주소는 모두 이 파일에 모여 있습니다.
 * 타일 서버나 API 주소가 바뀌면 여기만 고치면 됩니다.
 */
(function () {
  'use strict';
  var SJ = (window.SJ = window.SJ || {});

  SJ.config = {
    // ── 벡터 타일 (OpenMapTiles 스키마) ─────────────────────────
    // OpenFreeMap 공개 TileJSON. 응답의 tiles/maxzoom 을 MapLibre 가 그대로 사용합니다.
    tileJsonUrl: 'https://tiles.openfreemap.org/planet',
    // 글꼴(SDF glyph PBF). 한글(가–힣)은 MapLibre 가 브라우저 글꼴로 직접 그리므로
    // 여기서는 라틴 문자·숫자·기호만 받아옵니다.
    glyphsUrl: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    fontRegular: ['Noto Sans Regular'],
    fontBold: ['Noto Sans Bold'],
    // 한글·한자를 그릴 브라우저 글꼴 (CSS font-family 목록).
    localIdeographFontFamily: "'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', 'Noto Sans CJK KR', sans-serif",

    // ── 지형 (Terrarium 인코딩 DEM PNG) ───────────────────────
    demTiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    demEncoding: 'terrarium',
    demMaxZoom: 14,

    // ── 검색 / 경계 (Nominatim) ─────────────────────────────
    nominatimUrl: 'https://nominatim.openstreetmap.org/search',
    nominatimMinIntervalMs: 1100, // 이용 정책: 초당 1회 이하
    boundaryQuery: '세종특별자치시',

    // ── 추가 OSM 데이터 (Overpass API) ─────────────────────
    overpassUrls: ['https://overpass-api.de/api/interpreter'],
    overpassMinIntervalMs: 1000,
    // 대한민국 OSM 관례상 읍·면·동 = admin_level 8 (틀리면 여기서 수정)
    emdAdminLevel: '8',

    // ── 저작권 표기 ────────────────────────────────────────
    attribution: {
      tiles: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
        '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> ' +
        '데이터 <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap 기여자</a>',
      dem: '지형 <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">Mapzen/Tilezen Terrain Tiles (AWS Open Data)</a>',
      nominatim: '검색 <a href="https://nominatim.org/" target="_blank" rel="noopener">Nominatim</a>',
      overpass: '추가 데이터 <a href="https://overpass-api.de/" target="_blank" rel="noopener">Overpass API</a> (ODbL)',
    },

    // ── 지도 범위 ────────────────────────────────────────
    // 세종특별자치시를 넉넉히 감싸는 범위 [서, 남, 동, 북] — 경계 폴리곤을 못 받았을 때 사용
    fallbackBounds: [[127.02, 36.39], [127.43, 36.75]],
    maxBounds: [[126.55, 36.05], [127.9, 37.1]],
    center: [127.265, 36.53],
    minZoom: 8.5,
    maxZoom: 19.5,
    timezoneOffsetHours: 9, // KST

    // ── 바로 가기 ────────────────────────────────────────
    // 이름으로 Nominatim 검색을 먼저 시도하고, 실패하면 approx(대략 좌표)를 사용합니다.
    // approx 가 null 인 곳은 검색에 성공해야만 이동합니다.
    // ※ approx 값은 정밀 좌표가 아닌 대략적인 추정치입니다.
    landmarks: [
      { name: '정부세종청사', query: '정부세종청사', approx: [127.265, 36.5045], zoom: 15.6, bearing: -20 },
      { name: '세종호수공원', query: '세종호수공원', approx: [127.2725, 36.4985], zoom: 15.2, bearing: 30 },
      { name: '세종시청', query: '세종특별자치시청', approx: [127.289, 36.4801], zoom: 16, bearing: 10 },
      { name: '금강보행교', query: '금강보행교', approx: [127.2855, 36.4765], zoom: 15.6, bearing: 150 },
      { name: '국립세종수목원', query: '국립세종수목원', approx: [127.2805, 36.4975], zoom: 15.4, bearing: -40 },
      { name: '국립세종도서관', query: '국립세종도서관', approx: null, zoom: 16.2, bearing: 20 },
      { name: '대통령기록관', query: '대통령기록관', approx: null, zoom: 16.2, bearing: -10 },
      { name: '세종중앙공원', query: '세종중앙공원', approx: null, zoom: 15, bearing: 0 },
      { name: '조치원역', query: '조치원역', approx: [127.2965, 36.601], zoom: 15.6, bearing: 0 },
      { name: '고려대 세종캠퍼스', query: '고려대학교 세종캠퍼스', approx: null, zoom: 15.4, bearing: 0 },
      { name: '홍익대 세종캠퍼스', query: '홍익대학교 세종캠퍼스', approx: null, zoom: 15.4, bearing: 0 },
      { name: '베어트리파크', query: '베어트리파크', approx: null, zoom: 15.2, bearing: 0 },
      { name: '비암사', query: '비암사', approx: null, zoom: 15.8, bearing: 0 },
      { name: '밀마루전망대', query: '밀마루전망대', approx: null, zoom: 16, bearing: 0 },
    ],

    // 건물 높이가 없을 때 쓰는 기본값(m)
    defaultBuildingHeight: 6,
    // 층수 추정에 쓰는 층고(m) — 팝업에 '추정'으로 표시
    storeyHeight: 3.66, // OpenMapTiles 가 층수→높이로 바꿀 때 쓰는 값과 동일
    tileDefaultHeight: 5, // OpenMapTiles 가 높이·층수 없는 건물에 넣는 기본 높이(m)
  };
})();
