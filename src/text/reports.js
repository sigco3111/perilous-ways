// The Register — the documentary corpus.
//
// Twelve forms, rotated: minute, letter, wire, form, invoice, notice, line,
// margin, verse, footnote, testimony, return.
//
// Every entry also declares a `voice`: who is speaking. The host does not read
// it. It is here because an entry written without deciding whose mouth it is in
// comes out as one narrator wearing hats, and that is the fault this corpus was
// rewritten to cure. See VOICE.md.
//
//   halfling  fussy, domestic, digressive, sincere, genealogical
//   dwarf     short declaratives, measurements, money, no softening
//   elf       high diction, present tense, never funny
//   men       the Crown and the Council: officialese from outside
//   orc       literal, brutal, paperwork in order
//   working   drivers, gangers, signalmen, clerks. No wit at all
//   authority the Authority's own apparatus: minutes, notices, returns
//
// Every entry: { id, form, voice, text, weight?, regions?, kinds?, cultures?,
//               age?, tone? }
//   text is a string, or (ctx) => string. Every ctx field may be undefined:
//   guard all of them. Use ctx.rng for variation, never Math.random.
//
// Gating note: the host builds ctx.regionsReached from link region ids, which
// are numbers, so `regions` must be numbers too — REG below mirrors REGION in
// world/worldgen.js. ctx.culture is only set for the settlement pools, so
// AMBIENT and REGIONAL gate on `kinds` (from ctx.kindsReached) instead.

const REG = {
  GREENHOLLOW: 0, FROSTMARCH: 1, MIRKHOLT: 2, PEAKS: 3, WEEPING: 4,
  ASHENREACH: 5, MARCHLANDS: 6, ELDERWOOD: 7, QUAYS: 8, BARROWDOWNS: 9,
  WODENHOLT: 10,
};

const R = (c, n) => (c && typeof c.rng === 'function' ? Math.floor(c.rng() * n) : 0);
const one = (c, arr) => arr[R(c, arr.length)] ?? arr[0];
const P = (c, fb) => (c && c.place) || fb || '정거장';
const P2 = (c, fb) => (c && c.placeB) || fb || '분기역';
const RG = (c, fb) => (c && c.regionName) || fb || '황야';
const G = (c, fb) => (c && c.goodName) || fb || '잡화';
const ref = (c) => `RTA/${1147 + R(c, 800)}`;
const UP = (s) => String(s || '').toUpperCase();

// Gazetteer pickers, for the pools the host gives no place name to.
const SHIRE = (c) => one(c, ['네더 웸블리', '그레이트 너빈', '홉스 바텀',
  '리틀 스노링', '모시 바텀', '위더신', '핍윅', '체딩턴 파르바',
  '식스페니 핸들리', '매로미드', '터컴', '노보틀']);
const DELVE = (c) => one(c, ['두룬졸', '앤빌게이트', '스럼홀드', '바라즈 깊은곳',
  '칼가룬', '자둔', '카라그보르', '그림비어드의 델브', '언더포지']);
const HAVEN = (c) => one(c, ['로린델', '님로델', '아엘린퀘', '켈레딜',
  '미스라벨', '실버하이드', '엘렌마르', '탈라노르']);
const BURG = (c) => one(c, ['브래큰포드', '스톤마치', '하이홀트', '웨스터마크',
  '던할로우', '킹스브리지', '손워치', '에린데일', '릴브리지', '아몬웰']);
const HOLD = (c) => one(c, ['고르고발', '우즈그라스', '나르두크', '신더홀드',
  '그림투스', '우쉬낙', '슬래그 공장']);

// ---------------------------------------------------------------------------
// AMBIENT — the running life of the railway
// ---------------------------------------------------------------------------

export const AMBIENT = [
  // -- minutes ---------------------------------------------------------------
  {
    id: 'a_min_laid', form: 'minute', voice: 'authority', weight: 6,
    text: '이사회 속기록. 참석: 청장, 서기관, 운수과, 공사과(차관 대리). 불참: 공사감독, 터널 공사 중. 안건 1: 회계, 상정. 안건 2: 회계, 낭독 생략. 안건 3: 릴브리지의 울타리. 안건 4: 릴브리지의 울타리, 두 번째 쪽. 결의: 양쪽 쪽지 모두 보류한다.',
  },
  {
    id: 'a_min_seals', form: 'minute', voice: 'authority', weight: 5,
    text: '안건 2: 증서에 두 인장이 필요할 때 서기관의 인장과 지구 기사의 인장 중 어느 것을 위에 찍을 것인가. 서기관은 11년차 상시 규정을 제시했다. 지구 기사는 9년차 상시 규정을 제시했는데, 더 이른 것이며, 서기관의 것이며, 더 늦은 것이다. 결의: 늦은 규정을 따르고, 이 문제는 해결된 것으로 기록한다. 이 문제는 이전에도 두 번 해결된 것으로 기록된 바 있다.',
  },
  {
    id: 'a_min_week_one', form: 'minute', voice: 'authority', weight: 5,
    text: '안건 5: 어느 주가 1주차인가. 교통청의 해는 레이디 데이에 시작한다. 그린할로우의 해는 율에 시작하고 중간에 리스가 두 번 있는데, 교통청의 해에는 아예 없다. 굴착단은 첫 주괴를 친 날부터 세며, 그것이 언제인지는 말해 주지 않는다. 운수과는 여름 시각표만은 무언가부터 번호를 매기기를 바란다. 결의: 인쇄된 대로의 번호 매김을 유지한다. 안건 6: 보류.',
  },
  {
    id: 'a_min_elberic', form: 'minute', voice: 'authority', weight: 5,
    text: '안건 3: 머크홀트 울타리. 이 안건 동안 회색의 엘베릭이 방 안에 있었다. 초대받지도 않았고 앉지도 않았다. 그는 울타리 위치가 틀렸다고 말했다. 어떤 점에서 그런지 묻자, 떠났다. 결의: 울타리를 옮긴다. 근거는 기록하지 않는다.',
  },
  {
    id: 'a_min_confidence', form: 'minute', voice: 'men', weight: 6,
    text: '아몬할 평의회 속기록, 통달. 평의회는 동쪽 수송의 증가와, 아몬할 상공의 연기 감소와, 운임의 현행 유지와, 레이디 데이까지 회계의 흑자 전환을 요구한다. 평의회는 전적으로 확신하고 있다. 평의회는 자기들의 속기록을 열람했으나 네 번째 항목이 언제 표결에 부쳐졌는지 찾지 못했다.',
  },

  // -- letters ---------------------------------------------------------------
  {
    id: 'a_let_pud_11', form: 'letter', voice: 'halfling', weight: 6, kinds: ['shire'],
    text: '청장님께. 각하. 기적에 대해 열한 번째로 편지를 씁니다. 사본은 전부 보관하고 있는데, 이를 언급하는 것은 불쾌하게 굴려는 것이 아니라 찾아보실 수고를 덜어 드리기 위함입니다.\n\n기적은 6시 20분에 건널목에서 울립니다. 제 암탉들은 정원 맨 위의 우리에 있는데, 그곳은 제 어머니의 정원이었고, 어머니 댁은 언덕 아래 쿰 출신의 프라우드풋 가문으로, 4대를 이어 암탉을 기르며 알 낳기를 놀라 그만둔 닭은 한 마리도 없었습니다.\n\n그림을 동봉합니다. 종은 A에 있습니다. 기적은 B에 있습니다. 암탉들은 C에 있었습니다.\n\n경백, A. 퍼디풋 (부인)',
  },
  {
    id: 'a_let_ford_right', form: 'letter', voice: 'halfling', weight: 6, kinds: ['shire'],
    text: '교통청 귀중. 여러분. 여울을 지나는 통행권에 관하여, 제 할아버지는 그의 어머니, 브레이스거들 가문 출신에게서 물려받으셨고, 그 권리는 삼촌 톨리에게 넘어갔는데, 사후에 우리 쪽 가문으로 돌아온다는 약정이었고, 터컴 가문이 뭐라 하든 실제로 그리되었습니다. 터컴 가문은 혼인의 잘못된 편에 선 친척이며 문서에는 처음부터 없었습니다.\n\n귀 청의 측량사가 그 한가운데에 말뚝을 박았습니다.\n\n저는 말뚝을 옮기지 않았습니다. 먼저 편지를 쓰는데, 이는 터컴 가문이라면 하지 않았을 일입니다.\n\n— 마마듀크 그럽, 버클베리 여울',
  },
  {
    id: 'a_let_supper', form: 'letter', voice: 'halfling', weight: 6, kinds: ['shire'], tone: 'good',
    text: (c) => `교통청 귀중. 저희 아버지는 미카엘 축제 장을 보러 아몬할까지 걸어가셨는데, 가는 데 나흘, 오는 데 나흘이었고, 마흔 번을 그리 다니시며 아무렇지 않게 여기셨습니다. 저는 화요일에 다녀왔고, 저녁을 집에서 먹었습니다.\n\n불평하려고 쓰는 것이 아닙니다. 이 사실을 적어 둘 곳이 여기밖에 없었습니다.\n\n— J. 너빈, ${SHIRE(c)}`,
  },
  {
    id: 'a_let_etymology', form: 'letter', voice: 'halfling', weight: 5, kinds: ['shire'],
    text: '교통청 귀중. 저희 정거장의 표지판에는 모시 바텀이라고 적혀 있습니다. 그러나 지명은 모스보텀이며, 교통청이 생기기 전부터 교구 장부에 모스보텀이었습니다. mos는 이끼이고 botham은 골짜기 밑바닥이지, 누구의 엉덩이(bottom)와는 무관합니다.\n\n위더신 쪽에서는 샘 때문에 “이끼 낀 목욕탕” 모스바디에서 왔다고 주장합니다. 샘은 없습니다. 아버지 대부터 샘은 없었고, 목욕탕이 있었다고도 믿지 않습니다.\n\n표지판을 다시 칠하십시오. 모스보텀. 한 단어로.\n\n— 크롭, 교구 서기',
  },
  {
    id: 'a_let_crown_survey', form: 'letter', voice: 'men', weight: 5,
    text: '왕실 측량관실에서 철도 교통청에. 여러분. 교통청이 킹스브리지에서 왕의 물길 위로 선로를 넘기려 한다는 진정이 이 부서에 접수되었습니다. 왕의 물길은 권리가 아니라 허가로 건너는 것입니다. 허가는 측량에 근거하여 내려집니다. 측량은 신청 다음 계절에 실시되며, 신청은 그 전 계절에 접수됩니다. 교통청은 같은 계절에 신청했으므로, 이 부서는 아직 그 신청을 접수할 수 있는 위치에 있지 않음을 지적할 의무가 있습니다.',
  },

  // -- wires -----------------------------------------------------------------
  {
    id: 'a_wire_snow', form: 'wire', voice: 'working', weight: 4, regions: [REG.FROSTMARCH],
    text: '눈 스톱 그것이 전문의 전부 스톱',
  },
  {
    id: 'a_wire_signal', form: 'wire', voice: 'working', weight: 5,
    text: (c) => `${UP(SHIRE(c))} 하행 장내 신호기가 내려오지 않음 스톱 고정핀으로 묶고 수신호로 운용 중 스톱 검수관은 오늘 밤 말고 아침에 보낼 것`,
  },
  {
    id: 'a_wire_bore_true', form: 'wire', voice: 'dwarf', weight: 5, kinds: ['delve'],
    text: '굴착 완료 스톱 1200피트 스톱 양쪽 굴진면 정확히 관통 스톱 암반 양호 스톱 청구서 후송',
  },
  {
    id: 'a_wire_orc_count', form: 'wire', voice: 'orc', weight: 5, age: 2, kinds: ['hold'],
    text: '하역분 접수 스톱 수량 정확 스톱 봉인 정확 스톱 불만 없음 스톱 더 보낼 것 스톱 다음 주 같은 요일 스톱 우리는 여기 있을 것',
  },

  // -- forms -----------------------------------------------------------------
  {
    id: 'a_form_measures', form: 'form', voice: 'authority', weight: 5,
    text: '거리 보고서, 개정. 구 측법: 그린할로우 마일. 한 집 문에서 건너 한 집 문까지 걷는 거리이며, 날이 젖으면 넉넉하게 잰다. 신 측법: 마일. 네더 웸블리 지선에 적용할 때의 차이: 11체인. 시각표에 인쇄할 것: 마일. 교구에서 사용될 것: 다른 쪽.',
  },
  {
    id: 'a_form_saw', form: 'form', voice: 'working', weight: 5, tone: 'grave',
    text: '사고 보고서. 시각: 04:10. 날씨: 맑음. 시계: 매우 좋음. 제동: 양호, 이후 시험 완료. 기관사가 본 것: 이 부분은 본인이 직접 쓰겠다고 하였으나 아직 쓰지 않았음.',
  },
  {
    id: 'a_form_dwarf_cert', form: 'form', voice: 'dwarf', weight: 5, kinds: ['delve'],
    text: '주간 굴진 증명서. 굴진: 84피트. 암반: 양호. 용수: 소량, 배수 중. 동바리: 전량. 인원: 41. 부상자: 없음. 화약 사용: 60파운드. 화약 소명: 60파운드. 서명, 하프가르의 아들 브란, 차장.',
  },
  {
    id: 'a_form_gauge', form: 'form', voice: 'authority', weight: 5,
    text: (c) => `분기 결산 선로 검측. 도보 순회: ${70 + R(c, 30)}마일. 궤간 전 구간 정확. 자갈 부족: 릴브리지 상류 2마일. 울타리 부족: 없음. 침목 교체: 240. 지구 기사 서명 및 부서명 완료.`,
  },

  // -- invoices --------------------------------------------------------------
  {
    id: 'a_inv_thrain_tunnel', form: 'invoice', voice: 'dwarf', weight: 5,
    text: '아이언무트 & 선스, 공사감독 T. 아이언무트 경유.\n요청받지 않은 터널 1개 굴착 공사비: 240크라운.\n동 터널의 메움 공사비: 40크라운.\n숙고 끝 동 터널의 복원 공사비: 240크라운.\n합계: 520크라운. 조건: 엄격.',
  },
  {
    id: 'a_inv_lading_owl', form: 'invoice', voice: 'working', weight: 5,
    text: '화물 운송장, 하행, 화요일. 곡물 마흔 자루. 맥주 아홉 통. 석재 2톤. 울타리 열한 개. 여객, 예약 없음, 네 명 운송. 올빼미, 모자 상자에 든 것, 우리 것 아님, 먹였음.',
  },
  {
    id: 'a_inv_orc_ashglass', form: 'invoice', voice: 'orc', weight: 5, age: 2, tone: 'grave',
    text: (c) => `${HOLD(c)}발 동쪽 왕복분 청구.\n들어온 차량: 22. 돌아간 차량: 22.\n차량 한 대가 문이 부서진 채 돌아왔다. 우리가 부쉈다. 다음 결제에서 공제하고, 이 일로 사람을 보내어 말하지 마라.\n비 속에서 하물과 함께 남아 있던 차장을 위해 반품 속에 유리 한 상자를 넣어 두었다. 그는 요구하지 않았다. 그에게 전하라.`,
  },
  {
    id: 'a_inv_halfling_teas', form: 'invoice', voice: 'halfling', weight: 5, kinds: ['shire'],
    text: '네더 웸블리의 A. 퍼디풋 부인이 교통청에 청구함.\n귀 청 기관사에게 제공한 차, 네 차례: 4펜스.\n빵과 기름장, 같은 차례: 3펜스.\n그를 위해 내어 준 의자: 청구하지 않음.\n그가 두 번 열어 둔 문을 내가 두 번 닫음: 청구하지 않으나 기록함.\n돈을 바라는 것이 아닙니다. 그것이 주어졌다는 사실이 귀 청 사무실의 문서 한 장에 남기를 바랄 뿐입니다.',
  },

  // -- notices ---------------------------------------------------------------
  {
    id: 'a_not_refreshment', form: 'notice', voice: 'authority', weight: 5, tone: 'plain',
    text: '매점은 폐쇄되었다. 수익이 나지 않았다. 사랑받았었다.',
  },
  {
    id: 'a_not_east_waybill', form: 'notice', voice: 'authority', weight: 5, age: 2, tone: 'grave',
    text: '동부 노선. 본 선로에는 3등 승차권이 발매되지 않는다. 모든 여객은 운송장에 성명이 기재되어야 한다. 운송장은 여정의 양 끝에서 집계되며, 두 수치는 별도로 이 부서에 송부된다.',
  },
  {
    id: 'a_not_haven_bell', form: 'notice', voice: 'elf', weight: 5, kinds: ['haven'], tone: 'grave',
    text: (c) => `${HAVEN(c)}의 종이 이번 주에 다시 걸렸다. 그것은 늘 그래 왔듯 해 질 녘과 조수가 돌아설 때 울린다. 그것은 당신들이 그 아래 놓은 선로보다 오래되었고, 당신들의 기관차보다 크게 울린다. 우리는 둘 다 재어 보았다.`,
  },
  {
    id: 'a_not_amonhal_market', form: 'notice', voice: 'men', weight: 5, regions: [REG.MARCHLANDS],
    text: '아몬할 중앙역. 시청 명령. 대합실은 시장이 아니다. 그곳에서 판매하는 자는 교통청이 아니라 시청에 의해 쫓겨날 것이다. 생선 장수들에게는 별도로, 장문으로, 서신을 보냈다.',
  },

  // -- lines -----------------------------------------------------------------
  {
    id: 'a_line_nothing', form: 'line', voice: 'authority', weight: 5,
    text: '이번 주 보고된 것이 없다.',
  },
  {
    id: 'a_line_coal', form: 'line', voice: 'authority', weight: 5,
    text: '브래큰포드 석탄 재고: 충분.',
  },
  {
    id: 'a_line_lorindel', form: 'line', voice: 'elf', weight: 4, kinds: ['haven'], tone: 'grave',
    text: (c) => `${HAVEN(c)}의 등불이 이번 주에는 늦게 켜졌다.`,
  },

  // -- margins ---------------------------------------------------------------
  {
    id: 'a_marg_printed', form: 'margin', voice: 'authority', weight: 5,
    text: '겨울 시각표 여백에, 청장의 친필로: “이것은 불가능하다”. 그 아래, 서기관의 필적으로: “인쇄되었습니다”.',
  },
  {
    id: 'a_marg_amicable', form: 'margin', voice: 'working', weight: 5,
    text: '위의 기록에는 “원만히 해결됨”이라 적혀 있다. 그 밑에 더 굵은 필적으로: “해결됨. 원만하지는 않았음. 내가 거기 있었음.”',
  },
  {
    id: 'a_marg_midsummer', form: 'margin', voice: 'authority', weight: 5, tone: 'grave',
    text: '“우려할 근거 없음”이라는 항목 옆에, 사무실 누구의 것인지 확인되지 않은 세 번째 필적으로: “한여름에 다시 물어볼 것”.',
  },
  {
    id: 'a_marg_elf_name', form: 'margin', voice: 'elf', weight: 4, kinds: ['haven'], tone: 'grave',
    text: '벌채 보고서에 서기가 “나무, 명칭 없음”이라 적은 곳 옆에, 서기의 것이 아닌 단정한 필적이 있다. 그것은 그 나무의 이름을 적어 두었다. 그 외에는 아무것도 적지 않았다.',
  },

  // -- verse -----------------------------------------------------------------
  {
    id: 'a_verse_willow', form: 'verse', voice: 'elf', weight: 3, kinds: ['haven'], tone: 'grave',
    text: '버드나무는 아홉 해, 참나무는 아흔 해,\n톱질은 어느 오후 한나절.',
  },
  {
    id: 'a_verse_cost', form: 'verse', voice: 'elf', weight: 3, kinds: ['haven'], tone: 'grave',
    text: '교통청에 제기된 청구. 단정한 필적, 교통청의 것이 아닌 종이에:\n\n물가의 오리나무, 벌채됨: 백사십 년.\n그곳에 깃들었던 왜가리: 아홉 철, 다시 돌아오지 않을 것.\n고요함: 측정 불가.\n\n액수는 적혀 있지 않다. 이 청구는 매년 같은 날, 같은 필적으로 제출된다.',
  },
  {
    id: 'a_verse_doggerel', form: 'verse', voice: 'halfling', weight: 4, kinds: ['shire'],
    text: '오, 6시 40분 차는 브래큰포드로 가고,\n6시 40분 차는 돌아오지.\n삼촌 톨리도 한번 올라탔는데\n길은 마음에 안 드셨다네.\n\n터널도 마음에 안 들고,\n삯도 마음에 안 들었지만\n브래큰포드에서 참 좋은 저녁을 드셨고\n거기 잘한다고 하시더라네.\n\n(그린 맨 주막에서 불리는 노래. 역장이 받아 적음. 역장의 말에 따르면 아홉 절이 더 있으며 전부 그 저녁 밥에 관한 내용이라 함.)',
  },

  // -- footnotes -------------------------------------------------------------
  {
    id: 'a_foot_tuesday', form: 'footnote', voice: 'authority', weight: 5,
    text: '‡ 9시 20분 차는 둘째 화요일에는 운행하지 않는다. 실무 시각표에는 둘째 화요일이 존재하지 않는다. 이 약정은 실무 시각표보다 오래되었으며 그대로 두기로 하였다.',
  },
  {
    id: 'a_foot_ladyday', form: 'footnote', voice: 'authority', weight: 4,
    text: '* 일요일 제외. † 레이디 데이 이후에는 일요일 포함. ‡ *와 †가 어긋날 때, †가 늦은 각주이며 우선한다. § †와 §가 어긋날 때, *를 보라.',
  },
  {
    id: 'a_foot_elevenses', form: 'footnote', voice: 'halfling', weight: 5, kinds: ['shire'],
    text: (c) => `‡ ${SHIRE(c)}는 하루를 시계가 아니라 끼니로 센다. 교구는 시각표를 그에 맞게 인쇄해 달라 요청하였다. 교통청은 시계를 인쇄하였다. 여객에게 고지한다. 11시 20분 차는 11시 차(엘레븐시즈) 이전의 그 차이며 이후의 그 차가 아니고, 이후의 그 차 역시 목요일에는 11시 20분 차이다.`,
  },
  {
    id: 'a_foot_mail_precedence', form: 'footnote', voice: 'men', weight: 4,
    text: '§ 왕의 우편과 교통청의 수송이 선로를 다툴 때, 우편이 우선한다. 우편과 왕실 인물이 다툴 때에도, 우편이 우선한다. 이는 지금 치세 이전의 치세에 확정되었으며, 왕실은 다시 확정해 달라 요청하지 않았다.',
  },

  // -- testimony -------------------------------------------------------------
  {
    id: 'a_test_downline', form: 'testimony', voice: 'working', weight: 5, tone: 'grave',
    text: '“하행선으로 등불이 지나가는 걸 봤습니다. 저는 하행선 위에 서 있었습니다. 그러니 그건 우리 등불이 아닙니다. 제 이름을 걸 수 있는 건 이게 전부입니다.”\n\n— 기관사 할로웨이, 브래큰포드에서 받은 진술',
  },
  {
    id: 'a_test_goat', form: 'testimony', voice: 'working', weight: 6,
    text: '“궤간 한가운데 서 있었습니다, 그 염소가, 아니면 염소만 한 배짱을 가진 무언가가. 그리고 절 보는 눈이, 마치 제가 어울리지 않는 자리에 있는 것처럼 보였습니다. 저는 양보했습니다. 양보하게 되어 있습니다.”\n\n— 차장 페티퍼',
  },
  {
    id: 'a_test_coal', form: 'testimony', voice: 'working', weight: 5,
    text: '“언덕길에서 일주일 내내 힘이 없었고 저는 석탄 탓으로 돌렸습니다. 석탄이 맞았습니다. 목요일에 새 물량이 들어오니 예전처럼 치고 올라갔습니다. 그즈음 비도 내리기 시작했고 말입니다.”\n\n— 기관사 멀릿',
  },
  {
    id: 'a_test_cobb_snow', form: 'testimony', voice: 'working', weight: 5, age: 2, tone: 'grave',
    text: (c) => `“${DELVE(c)} 터널에서 나오니 골짜기 전체가 하얗더군요. 동료가 눈이라고 했고, 저는 철이 아니라고 했고, 그는 눈이라고 했습니다. 우리는 11분 동안 그것을 지나 달렸는데, 눈이 아니었습니다. 뭐였는지는 모릅니다. 눈이 아니었던 것만은 압니다. 눈은 원래 안 —”\n\n— 기관사 콥의 진술, 조사에서 채록. 증인은 문장을 마치지 않았으며 더 캐묻지 않았다.`,
  },
  {
    id: 'a_test_orc_better', form: 'testimony', voice: 'orc', weight: 5, age: 2, kinds: ['hold'], tone: 'plain',
    text: '요새에서 그들의 요청으로 받아 적고, 고치지 않고 그대로 송부함. “열차가 온다. 우리는 싣는다. 열차는 간다. 늦는 것이 없다. 옛 방식으로는 잿빛벌판을 넘어 쇠를 나르면 절반이 도착하지 않았고, 우리는 잃어버린 자들을 죽였고, 그래도 도착하지 않았다. 이것이 낫다. 기관차를 소유한 자들에게, 우리가 낫다고 말했다고 전하라.”',
  },

  // -- returns ---------------------------------------------------------------
  {
    id: 'a_ret_arrived', form: 'return', voice: 'authority', weight: 6,
    text: (c) => {
      const run = 1180 + R(c, 90);
      return `분기 보고. 운행 열차: ${run}. 도착 열차: ${run}. 시각표의 역에 도착한 열차: ${run - 6}.`;
    },
  },
  {
    id: 'a_ret_lost', form: 'return', voice: 'working', weight: 6,
    text: (c) => `분실물 보고, 미카엘 축제 분기: 우산 ${30 + R(c, 20)}; 검 3자루; 이빨, 사람의 것 아님, 한 상자; 회색 망토 9벌, 전부 동일; 그리고 서기가 “종?”이라고 기입하고 금고에 넣어 잠근 물품 한 점.`,
  },
  {
    id: 'a_ret_signalmen', form: 'return', voice: 'authority', weight: 5,
    text: '연말 재적 신호수 명단. 알도 벡. 탬 벡. 윌프리드 채피. 허드. 아이안토 로우. 메릭 로우. 오스버트 나이. 패드윅. 룩. 나이든 샐로우. 젊은 샐로우. 태로. 웨더비. 윅.\n\n열네 개 신호탑, 열네 명. 올해 결원 없음.',
  },
  {
    id: 'a_ret_fatal', form: 'return', voice: 'authority', weight: 5, tone: 'grave',
    text: '공사 현장 사망 사고 보고, 결산 연도. 아홉 명.\n\n콥 하디, 릴브리지 붕괴 현장. 앨더 핍, 릴브리지 붕괴 현장. 님, 입환 작업 중. 브루니의 아들 드왈렉, 심부 굴진면. 네더 웸블리 작업반 두 명, 형제, 하디 및 핍과 같은 붕괴 현장. 동부 작업반 두 명, 도급업자가 성명을 보내지 않아 두 차례 요청함.\n\n그리고 발견되지 않은 한 명.\n\n교통청은 장례비를 지급하였다.',
  },
  {
    id: 'a_ret_parish', form: 'return', voice: 'halfling', weight: 5, kinds: ['shire'],
    text: (c) => `교구 보고, ${SHIRE(c)}. 서기가 요구된 대로, 그리고 요구된 때보다 늦게 작성하였으며, 이에 대해 유감으로 생각함.\n\n가옥: ${40 + R(c, 30)}. 가구: 같음, 다만 둘 적음. 화재 이후 두 가구가 함께 살고 있음. 인원: 214. 기차를 타 본 교구민: 61. 기차를 두 번 타 본 사람: 61. 한 번만 탄 사람은 없음.`,
  },

  // -- the rest of the ambient run -------------------------------------------
  {
    id: 'a_let_vurmath_siding', form: 'letter', voice: 'men', weight: 5, age: 2,
    text: '이사회 귀중. 제 탑에 대기선을, 그리고 통상 요금으로 석탄을 달라고 세 차례 요청하였습니다. 그런데 통상 요금은 통상의 고객에게 적용되는 것이라는 답을 들었습니다. 지선은 제가 직접 측량하였습니다. 11마일이며, 내내 평탄합니다.\n\n이 건을 다음 이사회에 상정해 주시고, 상정되는 그 자리에 제가 있기를 바랍니다.\n\n백색의 부르마스',
  },
  {
    id: 'a_form_halt_app', form: 'form', voice: 'halfling', weight: 5, kinds: ['shire'],
    text: (c) => `간이역 설치 신청. 지명: ${UP(SHIRE(c))}. 인구: ${60 + R(c, 90)}. 가장 가까운 역까지의 거리: 2마일 반. 간이역이 필요한 사유: 저쪽 마을에는 있다.`,
  },
  {
    id: 'a_test_gang_names', form: 'testimony', voice: 'working', weight: 5,
    text: '“그날 밤 구간에 누가 있었는지 알고 싶으시다면. 아이브스, 반장. 저. 젊은 룩. 벡 형제 둘. 쉬는 날이었던 패드윅. 이렇게 여섯이고 원래 여덟이어야 했습니다. 조사에서도 검수관에게 말한 그대로 말하겠습니다. 여섯 명이 하룻밤에 11마일 선로를 걸을 수는 없다고. 그리고 우리는 걷지 않았습니다.”\n\n— 선로 담당 채피',
  },
  {
    id: 'a_not_whistle_law', form: 'notice', voice: 'authority', weight: 5, kinds: ['shire'],
    text: '여객 및 토지 점유자에게 고함. 기적은 법이 울리기를 요구하므로 건널목에서 울릴 것이다. 기적에 관한 불평은 법에 제기하는 것이 옳다.',
  },
  {
    id: 'a_inv_demurrage', form: 'invoice', voice: 'working', weight: 5, tone: 'plain',
    text: (c) => `체선료 계정, ${BURG(c)} 조차장. ${G(c, '곡물')}, 마흔 적재분, 선로가 없어 11일간 정차: 화주에게 22크라운 청구, 지구에서 면제함. 화주가 서신을 보내 왔는데, 면제를 요청한 적이 없으며 차라리 선로를 받고 싶었다고 함.`,
  },
  {
    id: 'a_marg_hafgar', form: 'margin', voice: 'dwarf', weight: 4, kinds: ['delve'], tone: 'grave',
    text: '심부 굴진면 항목에 교통청이 “진척 만족스러움”이라 적은 곳 옆에, 쓴 것이라기보다 새긴 필적으로: “브루니의 아들 드왈렉. 2마일 지점. 이 바위에서 우리의 여섯 번째.”',
  },
  {
    id: 'a_line_delve_quiet', form: 'line', voice: 'dwarf', weight: 4, kinds: ['delve'], tone: 'plain',
    text: '광산의 대장간은 일주일 내내 돌아갔다. 보고할 것도, 빚진 것도 없다.',
  },
  {
    id: 'a_ret_warm', form: 'return', voice: 'working', weight: 5, tone: 'grave',
    text: '주간 보고, 브래큰포드. 입선 기록 열차: 96. 출선 기록 열차: 96. 업무 종료 시 조차장에 서 있는 열차: 3. 역장에게 이 수치의 정합을 요구하였으나, 할 수 없으며, 세 대 모두 거기 있고, 그중 한 대는 따뜻하다는 답이 왔다.',
  },
  {
    id: 'a_verse_doggerel_2', form: 'verse', voice: 'halfling', weight: 3, kinds: ['shire'],
    text: '교통청이 신사 하나를 내려보냈네\n사슬과 장대와 모자를 차고,\n우리 골목을 재고 우리 밭을 재었지만\n앉을 자리 가르쳐 달라 해도 안 물었네.\n\n그 사람 말로는 열네 마일 사 분의 삼\n바텀에서 브래큰포드 읍내까지라네.\n글쎄 예전엔 아침 한나절이면 족했는데\n그런 건 적어 두지 않기로 했네.',
  },
  {
    id: 'a_line_resign', form: 'line', voice: 'authority', weight: 3,
    text: '이번 주 사임한 사람은 없다.',
  },
  {
    id: 'a_not_haven_notice', form: 'notice', voice: 'elf', weight: 4, kinds: ['haven'], tone: 'grave',
    text: '숲 가장자리의 벌채가 끝났다. 열한 에이커. 우리는 그것을 세었고, 우리의 책에 그 수를 적어 두었다. 당신들의 책이 사라진 뒤에도 그곳에 남을 것이다.',
  },
  {
    id: 'a_let_dwarf_grain', form: 'letter', voice: 'dwarf', weight: 5, kinds: ['delve'],
    text: '교통청 귀중. 곡물이 9일에 도착했다. 2일에 왔어야 했다. 우리는 아래 저장고에 있던 것을 먹었고 아래 저장고는 이제 비었다.\n\n대금은 전액 지급했다. 차액을 달라는 것이 아니다. 날짜를 알리는 것이다. 우리가 그 날짜를 알고 있다는 사실이 어딘가 문서에 남기를 바라서.',
  },
];

// ---------------------------------------------------------------------------
// REGIONAL — specific to one named land
// ---------------------------------------------------------------------------

export const REGIONAL = [
  // -- the Greenhollow -------------------------------------------------------
  {
    id: 'r_green_letter', form: 'letter', voice: 'halfling', weight: 5, regions: [REG.GREENHOLLOW],
    text: (c) => `교통청 귀중. 여러분. 매달 마지막 일요일의 임시 열차는 10시 반이라는 예배 시간에 들어오고, 승객 전원이 교회 앞을 지나 걸어 올라가며, 일부는 안을 들여다봅니다.\n\n들여다보는 것은 괜찮습니다. 제 숙모 로자문다도 한번 하이홀트의 교회 안을 들여다본 적이 있으나 아무도 뭐라 하지 않았습니다.\n\n문제는 건널목의 기적인데, 독경 한가운데 울립니다. 임시 열차를 10시나 11시, 혹은 토요일로 옮겨 주시면 교구에서 감사하겠습니다. 그럴 수 없다면 교구가 독경 시간을 옮기겠습니다만, 누가 옮겼는지를 두고 말이 나올 것이고, 저는 그것이 당신들이기를 바랍니다.\n\n— 오도 브램블, 교회 집사, ${SHIRE(c)}`,
  },
  {
    id: 'r_green_peril', form: 'form', voice: 'authority', weight: 5, regions: [REG.GREENHOLLOW],
    text: '위험 평가, 그린할로우. 망령: 없음. 늑대: 없음. 도적: 없음. 살아 있는 기억 속 불미스러운 소문: 없음. 평가자 비고: 두 번 확인하였음.',
  },
  {
    id: 'r_green_test', form: 'testimony', voice: 'working', weight: 5, regions: [REG.GREENHOLLOW],
    text: '“전 노선에서 가장 수월한 선로라고 누구에게든 말하겠습니다. 평탄하고, 울타리가 있고, 간이역 여섯에 역마다 우물이 있습니다. 먹을 것을 가져다주기도 합니다. 건초 말리는 철에 건널목만 조심하면 그게 전부입니다. 이번 달 내내 순조로웠습니다.”\n\n— 기관사 할로웨이',
  },
  {
    id: 'r_green_foot', form: 'footnote', voice: 'authority', weight: 5, regions: [REG.GREENHOLLOW],
    text: (c) => `† 그린할로우 간이역은 연초부터 레이디 데이까지 요청 정차로 운용된다. 지난 분기 요청 정차: ${180 + R(c, 60)}. 같은 분기 예약 정차: 96. 두 수치 모두 정확하며, 지구에는 다시는 한 장에 제출하지 말라고 전달하였다.`,
  },
  {
    id: 'r_green_marg', form: 'margin', voice: 'halfling', weight: 5, regions: [REG.GREENHOLLOW],
    text: '교통청의 비치 도면에서, 측량사가 황무지라고 표시한 밭 옆에, 둥글둥글한 교구 필적으로: “이곳은 황무지가 아니다. 브램블의 땅이다. 늙은 브램블 때부터 브램블의 땅이었고, 지금도 브램블이 그 안에 있으니, 가서 보면 그가 보일 것이다.”',
  },

  // -- the Grey Quays --------------------------------------------------------
  {
    id: 'r_quays_verse', form: 'verse', voice: 'elf', weight: 5, regions: [REG.QUAYS], tone: 'grave',
    text: '미스라벨의 조수는 하루에 두 번 돌아서며, 그것을 셀 기록이 있기 전부터 그리 돌아섰다.\n\n교통청의 시각표는 평일에 부두로 네 편, 안식일에 두 편을 배정한다. 우리는 그 네 편을 조수에 맞추어 보았다. 조수와 맞지 않는다.\n\n4시 10분 차가 필요한 뱃사람은 없다.',
  },
  {
    id: 'r_quays_sailings', form: 'return', voice: 'working', weight: 5, regions: [REG.QUAYS], tone: 'grave',
    text: '이번 분기 회색 부두 출항: 4. 귀항 선박: 0. 서기가 두 번째 수치에 이의를 제기하였으나, 그 난을 그대로 두고, 계속 그대로 두라는 지시를 받았다.',
  },
  {
    id: 'r_quays_notice', form: 'notice', voice: 'authority', weight: 5, regions: [REG.QUAYS], tone: 'grave',
    text: '마지막 부두로 가시는 여객께. 돌아오는 운임은 없습니다. 이는 운임표의 누락이 아닙니다.',
  },

  // -- the Barrowdowns -------------------------------------------------------
  {
    id: 'r_barrow_moon', form: 'line', voice: 'authority', weight: 6, regions: [REG.BARROWDOWNS],
    text: '배로우 언덕 구간은 달이 바뀔 때까지 폐쇄된다.',
  },
  {
    id: 'r_barrow_letting', form: 'testimony', voice: 'working', weight: 5, regions: [REG.BARROWDOWNS], tone: 'grave',
    text: '“그쪽이 막는 건 아닙니다. 지나가게 해 줍니다. 그 지나가게 해 주는 게 마음에 안 드는 겁니다.”\n\n— 기관사 샐로우, 야간 화물',
  },
  {
    id: 'r_barrow_spoil', form: 'minute', voice: 'authority', weight: 5, regions: [REG.BARROWDOWNS],
    text: '안건 3: 배로우 언덕 토공. 공사과 보고에 따르면 흙더미가 매일 아침 무덤 한 기 분량씩 줄어든다고 함. 결의: 흙을 세어 본다. 안건 4: 누가, 언제 셀 것인가. 보류.',
  },

  // -- Elderwood -------------------------------------------------------------
  {
    id: 'r_elder_thrushes', form: 'verse', voice: 'elf', weight: 5, regions: [REG.ELDERWOOD], tone: 'grave',
    text: '엘더우드의 벌채는 교통청의 측법으로 기록되었다: 마흔 적재분, 마흔 치가 지급되었다.\n\n우리의 측법으로 그 숲은 에린 라스리에스이며, 그 전에는 아무 이름도 없었다. 아직 이름 지을 이가 없었기 때문이다. 개똥지빠귀들은 늦게 왔고, 우리가 수를 세어 온 동안 같은 아홉 그루 너도밤나무에 깃들었다.\n\n아홉 그루 중 두 그루가 11마일 지점 당신들의 선로 아래 침목이 되었다.',
  },
  {
    id: 'r_elder_fortyone', form: 'margin', voice: 'elf', weight: 5, regions: [REG.ELDERWOOD], tone: 'grave',
    text: '“목재, 마흔 적재분, 엘더우드”라는 항목 옆에, 서기의 것이 아닌 단정한 필적으로: “마흔하나”.',
  },
  {
    id: 'r_elder_halted', form: 'wire', voice: 'working', weight: 5, regions: [REG.ELDERWOOD], tone: 'grave',
    text: '9마일 지점 벌채 중단함 스톱 중단 명령받은 바 없음 스톱 계속하고 싶지 않았음 스톱 직접 가서 설명하겠음',
  },

  // -- the Marchlands --------------------------------------------------------
  {
    id: 'r_march_levy', form: 'invoice', voice: 'men', weight: 5, regions: [REG.MARCHLANDS],
    text: '공사에 부과된 왕실 부과금 내역.\n왕실에, 왕의 물길을 건너는 허가: 60크라운.\n왕실에, 그 물길을 되돌아 건너는 허가: 60크라운.\n왕실 측량관에게, 그것이 같은 물길임을 증명하는 대가: 15크라운.\n합계: 135크라운.',
  },
  {
    id: 'r_march_clock', form: 'minute', voice: 'men', weight: 5, regions: [REG.MARCHLANDS],
    text: '아몬할 시의회 속기록, 새 역사의 시계에 관함. 결의: 시계를 허가한다. 결의: 길드 회관의 시계보다 높게 설치하지 않는다. 길드 회관이 더 오래된 건물이기 때문이다. 결의: 두 번째 결의는 교통청에 알리되, 그 사유는 알리지 않는다. 결의: 이 건을 집사장에게 보고한다. 집사장은 부재 중이다.',
  },
  {
    id: 'r_march_ninehundred', form: 'testimony', voice: 'working', weight: 5, regions: [REG.MARCHLANDS], age: 2, tone: 'grave',
    text: '“우리는 아흐레 반 만에 아홉백 명을 동쪽으로 실어 날랐습니다. 제 할아버지는 스톤마치까지 보름이 걸리셨습니다. 아홉백 명, 아흐레 반. 제가 말해도 이상하게 들려서 자꾸 되뇌게 됩니다.”\n\n— 차장 앤셀, 군수송 임시열차',
  },

  // -- Mirkholt --------------------------------------------------------------
  {
    id: 'r_mirk_coat', form: 'wire', voice: 'working', weight: 6, regions: [REG.MIRKHOLT], tone: 'grave',
    text: '14마일 지점 거미줄 속에 무언가 있음 스톱 동물 아님 스톱 외투를 입고 있음 스톱 한 명 말고 두 명을 보낼 것',
  },
  {
    id: 'r_mirk_dusk', form: 'footnote', voice: 'authority', weight: 5, regions: [REG.MIRKHOLT],
    text: '‡ 머크홀트 열차는 해거름 이후 운행하지 않는다. 해거름은 기관사가 판단하며, 기관사와 논쟁해서는 안 된다.',
  },
  {
    id: 'r_mirk_lamps', form: 'return', voice: 'working', weight: 5, regions: [REG.MIRKHOLT],
    text: '등불 계정, 머크홀트 구간. 지급: 40. 반납: 12. 숲에서 3주를 보낸 뒤 켜진 채 반납: 1.',
  },

  // -- Wodenholt -------------------------------------------------------------
  {
    id: 'r_woden_letter', form: 'letter', voice: 'authority', weight: 5, regions: [REG.WODENHOLT],
    text: '이번 주 접수된 것. 한 장, 아홉 자 길이, 나무껍질에:\n\n“교-통-청-에게. 우-리-는-봄-의-서-신-을-숙-고-하-였-다. 아-직-숙-고-하-는-중-이-다. 낙-엽-이-지-기-전-에-다-시-쓰-지-마-라.”\n\n서기관이 회신하였다. 이후 서기관은 회신이 요청된 것이 아니었다는 조언을 받았다.',
  },
  {
    id: 'r_woden_fourth_year', form: 'line', voice: 'authority', weight: 5, regions: [REG.WODENHOLT],
    text: '워든홀트 심리가 이번 주로 4년차에 들어섰다.',
  },
  {
    id: 'r_woden_court', form: 'form', voice: 'men', weight: 5, regions: [REG.WODENHOLT],
    text: '워든홀트 회부 건 왕실 법정 보고. 올해 개정: 2. 휴정: 2. 첫 번째 휴정 사유: 당사자 불출석. 두 번째 휴정 사유: 당사자 출석하였으나 아직 말이 끝나지 않음. 다음 개정: 미정. 현재까지 비용: 교통청 부담.',
  },

  // -- the Sundering Peaks ---------------------------------------------------
  {
    id: 'r_peaks_thrain', form: 'invoice', voice: 'dwarf', weight: 5, regions: [REG.PEAKS],
    text: '아이언무트 & 선스.\n고개 하나, 측량, 교통청의 지시에 의함: 40크라운.\n터널 하나, 대신 측량, 아무도 지시하지 않음: 120크라운.\n터널 도면 보관, 교통청이 찾는 날에 대비하여 이 사무소에 보관: 무료.',
  },
  {
    id: 'r_peaks_bore', form: 'testimony', voice: 'working', weight: 5, regions: [REG.PEAKS],
    text: '“고개 위에 올라가면 세상의 양쪽 반을 한꺼번에 볼 수 있는데, 보고 싶지 않게 됩니다. 저는 터널이 좋습니다. 터널 안에서는 자기가 어디 있는지 알 수 있으니까요.”\n\n— 기관사 멀',
  },
  {
    id: 'r_peaks_cert', form: 'form', voice: 'dwarf', weight: 5, regions: [REG.PEAKS],
    text: '정상부 공사 증명서. 해발: 4,180피트. 최한 구배: 34분의 1. 곡선, 최급: 9체인. 석조: 건식, 모르타르 없음, 명세대로. 두 겨울 후 동해: 없음. 버틸 것임.',
  },

  // -- the Frostmarch --------------------------------------------------------
  {
    id: 'r_frost_return', form: 'return', voice: 'working', weight: 5, regions: [REG.FROSTMARCH], tone: 'good',
    text: '프로스트마치 보고, 해빙의 달. 선로가 열린 날: 31. 선로가 깨끗했던 날: 9. 열차가 달린 날: 31.',
  },
  {
    id: 'r_frost_watch', form: 'letter', voice: 'men', weight: 5, regions: [REG.FROSTMARCH], tone: 'plain',
    text: '교통청 귀중. 우리에게는 역이 필요 없다. 봉화대에서 열차가 속도를 늦추면 된다. 나머지는 우리가 한다. 우리는 이백 년 동안 나머지를 해 왔다.\n\n— 콜드펠 파수대',
  },
  {
    id: 'r_frost_drift', form: 'line', voice: 'working', weight: 5, regions: [REG.FROSTMARCH],
    text: '화요일에 노스킵 위쪽 선로가 눈에 덮였고 금요일까지 다시 열렸다. 네 명이 삽 두 자루씩.',
  },

  // -- the Weeping Marsh -----------------------------------------------------
  {
    id: 'r_weep_sunk', form: 'wire', voice: 'working', weight: 5, regions: [REG.WEEPING],
    text: '제방도로 또 내려앉음 스톱 유실 아님 스톱 침하 스톱 같은 장소 같은 깊이 스톱 말뚝을 보낼 것',
  },
  {
    id: 'r_weep_piles', form: 'form', voice: 'authority', weight: 5, regions: [REG.WEEPING],
    text: '지반 상태, 우는 습지. 지지력: 없음. 대책: 말뚝. 필요 말뚝 깊이: 미확정. 현재까지 타입 깊이: 90피트. 밑바닥: 아직.',
  },
  {
    id: 'r_weep_invoice', form: 'invoice', voice: 'dwarf', weight: 5, regions: [REG.WEEPING],
    text: '아이언무트 & 선스, 습지 공사분.\n말뚝 아홉천 개, 타입: 2,700크라운.\n수풀더미 나무백 적재분, 침하: 160크라운.\n조수 대기, 엿새: 90크라운.\n우리는 물속 공사를 보증하지 않는다. 이전에도 말했고 견적서에도 적혀 있다.\n합계: 2,950크라운.',
  },

  // -- the Ashenreach --------------------------------------------------------
  {
    id: 'r_ash_letter', form: 'letter', voice: 'orc', weight: 5, regions: [REG.ASHENREACH], age: 2, tone: 'grave',
    text: '이것은 편지가 아니다. 수치다.\n\n철, 40톤, 반입. 석탄, 60톤, 반입. 목재, 20톤, 반입. 잿빛유리, 열두 상자, 반출. 9헌드레드웨이트. 양쪽 끝에서 계량함.\n\n너희 차장이 유리를 어디에 쓰냐고 물었다. 우리는 알려 주었다. 그는 다른 것을 적었다.',
  },
  {
    id: 'r_ash_minute', form: 'minute', voice: 'authority', weight: 5, regions: [REG.ASHENREACH], age: 2, tone: 'grave',
    text: '안건 1: 동부 회계. 낭독되고, 찬탄됨. 안건 2: 동부 회계 재차, 서기관의 요청으로, 소리 내어, 천천히. 안건 3: 없음. 이사회는 일찍 휴회하였고, 각자 따로 퇴청하였다.',
  },
  {
    id: 'r_ash_best_year', form: 'margin', voice: 'authority', weight: 5, regions: [REG.ASHENREACH], age: 2, tone: 'grave',
    text: '동부 수입 항목 옆에, 청장의 필적으로: “교통청 역사상 최고의 해”. 그 아래, 같은 필적, 더 늦은 잉크로: “그렇다”.',
  },
];

// ---------------------------------------------------------------------------
// CROSSING — the big moments. A page in a book, not a status line.
// ---------------------------------------------------------------------------

export const CROSSING = {
  first_bridge: [
    {
      id: 'x_bridge_minute', form: 'minute', voice: 'authority', tone: 'good',
      text: '안건 1: 실버플러드 다리, 개통 선언. 청장이 4분간 연설하였다. 왕의 아우가 20분간 연설하였다. 스란 아이언무트는 연설을 청받았으나, 대신 중앙 경간 위로 걸어 나가 2시 10분 차가 전속력으로 머리 위를 지나는 동안 그곳에 서 있다가 돌아와서, 쓸 만하다고 말하였다. 결의: 이것을 공사감독의 소감 전문으로 기록한다.',
    },
    {
      id: 'x_bridge_test', form: 'testimony', voice: 'working', tone: 'good',
      text: '“어떤 기분이냐고요. 아무것도 아닙니다. 그게 요령입니다. 강둑에 있다가, 사백 피트 물 위를 지나고, 맞은편 강둑에 서 있는 겁니다. 아무 느낌도 없고, 찻물도 흔들리지 않습니다. 아버지는 거기서 소 떼를 헤엄쳐 건네셨습니다. 자꾸 아버지 생각이 납니다.”\n\n— 기관사 할로웨이, 최초 정기 통과',
    },
    {
      id: 'x_bridge_invoice', form: 'invoice', voice: 'authority', tone: 'good',
      text: '실버플러드 다리 결산.\n철공, 여섯 경간: 1,900크라운.\n석조, 교각 둘: 740크라운.\n섬말이 댐, 두 번: 480크라운.\n렌이라는 소년에게, 두 번째 댐과 함께 가라앉았다가 다시 떠올랐으며, 종신토록 공사에 자리를 보장받을 자: 매주 12크라운, 영구히.\n마지막 항목에 교통청은 이의를 제기하지 않는다.',
    },
  ],
  first_bore: [
    {
      id: 'x_bore_letter', form: 'letter', voice: 'dwarf', tone: 'good',
      text: '청장에게. 관통했다. 굴진면들이 손바닥 두께 이내로 만났다. 경이롭다는 말을 듣게 될 것이다. 산수였을 뿐이다.\n\n동쪽 반과 서쪽 반이 악수하였으며 다시는 함께 일하지 않을 것이다. 서로가 상대가 늦었다고 판단했기 때문이다.\n\n두 번째 것을 보내라.\n\nT. 아이언무트, 공사감독',
    },
    {
      id: 'x_bore_line', form: 'line', voice: 'authority', tone: 'good',
      text: '선더링 산맥은 더 이상 아무것도 가르지 않으며, 굴착단은 그 말을 한 번도 멈추지 않고 있다.',
    },
    {
      id: 'x_bore_notice', form: 'notice', voice: 'authority', tone: 'good',
      text: '여객에게 고지함. 터널 통과에는 11분이 소요된다. 등불은 전 구간에 켜 둔다. 노랫소리는 작업반의 것이며 운임에 포함되지 않는다.',
    },
  ],
  first_pass: [
    {
      id: 'x_pass_test', form: 'testimony', voice: 'working', tone: 'good',
      text: '“터널도, 갱도도 없었고 머리 위에는 하늘과 하늘이 하고 있던 무엇이든뿐이었습니다. 지그재그 구간을 기관차 두 대로 오르고 세 번째가 밀어 주었습니다. 정상에서 기관부가 모자를 벗었습니다. 왜인지 묻지 않았고 그도 말하지 않았습니다.”\n\n— 기관사 멀, 고개 최초 통과',
    },
    {
      id: 'x_pass_form', form: 'form', voice: 'dwarf', tone: 'good',
      text: '정상부 선로 증명서. 해발: 4,180피트. 최한 구배: 34분의 1. 시공법: 통상적이지 않음. 공사감독 비고, 본인의 고집으로 첨부: 터널이 더 나았을 것임. 그럼에도 부서명함.',
    },
  ],
  first_marsh: [
    {
      id: 'x_marsh_wire', form: 'wire', voice: 'working', tone: 'good',
      text: '제방도로 견디고 있음 스톱 이제 열하루째 스톱 숨죽이기를 그만두었음 스톱 수송 배정을 시작할 것',
    },
    {
      id: 'x_marsh_invoice', form: 'invoice', voice: 'authority',
      text: '우는 습지 횡단 공사비 내역.\n말뚝 아홉천 개, 타입: 2,700크라운.\n수풀더미 나무백 적재분, 침하: 160크라운.\n기관차 한 대, 침하, 인양: 90크라운.\n기관차 한 대, 침하, 인양하지 못함, 현재 제방도로의 일부가 되어 매일 그 위로 열차를 실어 나르는 중: 무료.\n합계: 2,950크라운.',
    },
    {
      id: 'x_marsh_foot', form: 'footnote', voice: 'authority',
      text: '† 습지 횡단 구간은 매주 도보 검측하며, 교통청이 존재하는 한 계속될 것이다. 이는 예방 조치가 아니다. 습지가 그것을 허락하는 약정이다.',
    },
  ],
  first_wood: [
    {
      id: 'x_wood_minute', form: 'minute', voice: 'authority',
      text: '안건 2: 머크홀트 선로, 개통. 운수과가 야간 운행을 시각표에 넣어도 되는지 묻는다. 공사과가 안 된다고 한다. 운수과가 어떤 근거로 그런지 묻는다. 공사과가 답하기를, 자기가 그 안에서 밤을 보내 본 것이 근거라고 한다. 결의: 주간 운행에 한하며, 사유는 장부에 기록하지 않는다.\n안건 3: 늘 그렇듯 보류.',
    },
    {
      id: 'x_wood_margin', form: 'margin', voice: 'working', tone: 'grave',
      text: '위의 기록은 머크홀트 선로를 준공, 31마일, 인명 손실 없음으로 적고 있다. 그 아래 측량사의 필적으로: “우리 쪽 인명 손실은 없음”.',
    },
  ],
  first_east: [
    {
      id: 'x_east_notice', form: 'notice', voice: 'authority', tone: 'grave',
      text: '동부 선로가 개통되었다. 1등 및 2등만 발매한다. 본 노선에는 3등이 없으며, 여객은 그 이유를 묻지 않기 바란다.',
    },
    {
      id: 'x_east_verse', form: 'verse', voice: 'elf', tone: 'grave',
      text: '당신들은 선더링 산맥 너머로 쇠를 실어 왔다. 그 산맥이 우리가 이름 지을 수 있던 동안에는 아에글로나스였다.\n\n항구의 엘베릭은 우리의 기년으로 천이백사년 봄에 그것을 도보로 넘었다. 그는 고개에서 동료 둘을 잃었고, 그들의 이름을 정상의 바위에 새겼다.\n\n당신들의 기사들이 그 바위를 고가교 교대로 가져갔다. 좋은 돌이다. 언제나 좋은 돌이었다.',
    },
    {
      id: 'x_east_return', form: 'return', voice: 'authority', tone: 'grave',
      text: '요약, 첫 동부 주간. 동행 적재: 44. 서행 적재: 61. 수입: 9,400크라운, 주간 평균 1,100 대비. 연기: 증가. 이 보고서의 모든 난이 교통청이 기록한 최고의 난이다. 서기관이 묻기를, 기록을 보고하면서 같은 장에 유감을 표할 수 있는 서식이 있는지.',
    },
  ],
  first_wrack: [
    {
      id: 'x_wrack_line', form: 'line', voice: 'authority', tone: 'grave',
      text: '선로는 화요일 4시 20분, 8분 일찍 랙 산에 닿았다.',
    },
    {
      id: 'x_wrack_test', form: 'testimony', voice: 'working', tone: 'grave',
      text: '“승강장에서 기다리고 있었습니다. 군중은 아니었습니다. 정렬해 있었습니다. 누군가 객차마다 설 자리를 선로에 분필로 표시해 두었는데, 하나도 빠짐없이 정확했습니다. 우리는 차량 길이를 보내 준 적이 없는데도요.”\n\n— 차장 웨더비, 동부 왕복',
    },
    {
      id: 'x_wrack_form', form: 'form', voice: 'orc', tone: 'grave',
      text: '요새에서 교통청의 서식지로 보내 옴. 전 항목 기입됨.\n\n역명: 랙. 승강장, 길이: 240피트, 분필 표시됨. 급수: 있음. 석탄: 있음, 우리 것. 열차를 맞이할 자: 뒷면에 기명. 여행할 자: 아직 없음. 비고: 우리는 시각표를 읽었다. 좋은 시각표다. 우리는 그것을 지킬 것이다.',
    },
  ],
  first_quays: [
    {
      id: 'x_quays_verse', form: 'verse', voice: 'elf', tone: 'grave',
      text: '그렇다면, 해안까지 철이 닿은 것이다. 부두의 배는 일곱 척이다. 일흔 척이었다. 그 전에는 셀 수 없었는데, 떠나기 위한 배들이 아니었기 때문이다.\n\n켈레브린 어르신이 교통청이 이후에 부두석을 필요로 할지 물었다. 그는 견적서에 이후란 없다는 답을 들었다.',
    },
    {
      id: 'x_quays_letter', form: 'letter', voice: 'elf', tone: 'grave',
      text: '청장에게. 레일이 이제 물가에 닿았다. 우리는 그 전 구간을 걸어 보았다. 공사는 훌륭한 공사이며 마지막 백 야드가 그중 으뜸이다. 특히 부두로 이어지는 곡선은 어려운 것이었는데, 당신의 사람 앨프워드가 우리가 본 적 없는 완화 곡선으로 풀었다.\n\n우리는 만족하느냐는 질문을 받는다. 만족하지 않는다. 두 가지 모두 사실이며, 교통청은 그러한 것을 기록하는 난 어디에든 이를 기입해도 좋다.\n\n항구를 대표하여, 켈레브린',
    },
    {
      id: 'x_quays_foot', form: 'footnote', voice: 'authority', tone: 'grave',
      text: '* 회색 부두행 승차권은 여객의 선택에 따라 편도 또는 왕복으로 발매된다. 왕복의 돌아오는 쪽 인쇄를 중단해 달라는 요청이 있었으나, 인쇄에 비용이 들지 않는다는 이유로 거절하였다.',
    },
  ],
  deep_bore_1: [
    {
      id: 'x_deep1_wire', form: 'wire', voice: 'dwarf', tone: 'grave',
      text: '산맥 아래 3마일 지점 스톱 굴진면에서 공기가 나오고 있음 스톱 찬 공기가 일정하게 움직임 스톱 우리가 이 암반의 유일한 작업장임 스톱 우리가 이 암반의 유일한 작업장임을 확인 바람',
    },
    {
      id: 'x_deep1_form', form: 'form', voice: 'dwarf', tone: 'grave',
      text: '심부 작업장, 주간 증명서. 갱구로부터의 깊이: 3.1마일. 암반: 양호. 용수: 없음. 환기 필요: 아니오. 환기 관측됨: 예. 기류 방향: 밖으로. 발생원: 미확인. 차장 서명. 요청받지 않았으나 다음을 덧붙임: 촛불을 대 보니 기울었음.',
    },
  ],
  deep_bore_2: [
    {
      id: 'x_deep2_test', form: 'testimony', voice: 'working', tone: 'grave',
      text: '“마지막 부석을 걷어 내니 뒤가 암반이 아니었습니다. 다듬은 돌이었습니다. 문기둥, 마루, 전부요. 마루돌은 만들어진 물건입니다. 마루돌과는 논쟁할 수 없습니다. 옛 공사예요. 그들의 옛 공사보다 더 오래된. 스란이 내려와 손바닥을 대고 한참을 서 있다가 말하더군요, 글쎄.\n\n그는 글쎄라고 말하는 사람이 아닙니다.”\n\n— 차장 브란, 심부 작업장',
    },
    {
      id: 'x_deep2_minute', form: 'minute', voice: 'authority', tone: 'grave',
      text: '안건 4: 산맥 아래의 문. 공사과 측량 결과: 11피트, 다듬은 돌, 경첩 발견되지 않음, 굴착단이 읽는 어떤 문자의 명문도 없음. 운수과가 굴진 방향을 틀어 우회할 수 있는지 묻는다. 공사과는 400크라운이면 가능하다고 한다. 청장이 뚫고 지나가는 비용을 묻는다. 아무도 답하지 않았고, 기록할 것이 그것뿐이므로 서기관은 그 침묵을 기록하였다.\n안건 5: 보류.',
    },
  ],
  deep_bore_3: [
    {
      id: 'x_deep3_wire', form: 'wire', voice: 'working', tone: 'grave',
      text: '문이 열려 있음 스톱 우리가 연 것이 아님 스톱 아홉 명의 반이 6시에 들어감 스톱 아홉이 나옴 스톱 다시 세어 볼 것 스톱 아홉이 나옴 스톱 네 번 세었고 아홉이며 나는 그들 모두와 20년을 일했으나 그중 한 명을 모르겠음 스톱 명령 없이 오늘 밤 굴진면을 봉쇄함 스톱 취소하지 말 것',
    },
    {
      id: 'x_deep3_margin', form: 'margin', voice: 'authority', tone: 'grave',
      text: '장부 기록 전문: “심부 굴진면, 3.1마일. 잡석과 석회로 봉쇄. 400크라운. 예비비로 처리.”\n\n그 아래 두 번째 필적이 있다. 작게, 연필로, 사무실에서 쓰지 않는 서체로:\n\n“고맙소”',
    },
  ],
  dragon_wakes: [
    {
      id: 'x_dragon_wire', form: 'wire', voice: 'working', tone: 'grave',
      text: (c) => `${UP(P(c, DELVE(c)))} 광산 스톱 5시 40분 차를 보내지 말 것 스톱 아무것도 보내지 말 것 스톱 갱구 온도 정오 이후 40도 상승 스톱 드워프들이 작업을 멈춤 스톱 그들은 한 번도 작업을 멈춘 적이 없음`,
    },
    {
      id: 'x_dragon_notice', form: 'notice', voice: 'authority', tone: 'grave',
      text: '광산행 전 열차가 취소되었다. 승차권 소지 여객은 전액 환불된다. 여객은 구경하러 가지 말 것.',
    },
    {
      id: 'x_dragon_line', form: 'line', voice: 'dwarf', tone: 'grave',
      text: '드워프들이 올라오고 있다. 전원이. 아무것도 가져오지 않는다.',
    },
  ],
};

// ---------------------------------------------------------------------------
// INCIDENTS
// ---------------------------------------------------------------------------

export const INCIDENTS = {
  block: [
    {
      id: 'i_b_wire_rock', form: 'wire', voice: 'working', weight: 6,
      text: '7마일 지점 선로에 암석 스톱 두 차량 분량 스톱 작업반을 불렀음 스톱 선로가 열리면 전신하겠음',
    },
    {
      id: 'i_b_form_tree', form: 'form', voice: 'authority', weight: 6,
      text: (c) => `장애물 보고서. 구간: ${RG(c)}. 종류: 나무. 나무를 베었는가: 아니오. 나무가 어제 거기 있었는가: 아니오. 참조 ${ref(c)}.`,
    },
    {
      id: 'i_b_test_wall', form: 'testimony', voice: 'working', weight: 5, tone: 'grave',
      text: '“곡선을 돌아 나가니 없어야 할 곳에 벽이 선로를 가로막고 있었습니다. 무너져 내린 게 아니라 쌓은 겁니다. 단을 맞추고 위엔 두공돌까지 얹은. 90야드 안에 세웠는데, 어떻게 했는지 저도 모르겠습니다.”\n\n— 기관사 샐로우',
    },
    {
      id: 'i_b_notice_cart', form: 'notice', voice: 'authority', weight: 6, tone: 'bad',
      text: '선로가 막혀 있다. 대체 수송은 없다. 수레가 한 대 있다. 그 수레는 우리 것이 아니며 마부의 요금은 마부의 것이다.',
    },
    {
      id: 'i_b_margin_cleared', form: 'margin', voice: 'working', weight: 5,
      text: '“장애물 제거됨, 선로 재개”라는 항목 옆에, 반장의 필적으로: “한쪽으로 치움. 여전히 거기 있음.”',
    },
    {
      id: 'i_b_minute_held', form: 'minute', voice: 'authority', weight: 5,
      text: (c) => `안건 6: ${RG(c)} 장애물. 공사과는 선로가 열렸다고 보고한다. 운수과도 선로가 열렸다고 보고한다. 선로 검측관은 보고를 거부하며 안건의 보류를 요청하였다. 보류.`,
    },
    {
      id: 'i_b_foot_longway', form: 'footnote', voice: 'authority', weight: 5,
      text: '† 구간 폐쇄 동안 여객은 먼 길로 돌아가며 가까운 길의 운임을 부과받는다. 이번 주 이 명목의 초과 징수: 없음. 초과 징수 담당 서기에게는 두 번 일러 두었다.',
    },
    {
      id: 'i_b_line_standing', form: 'line', voice: 'working', weight: 6, tone: 'grave',
      text: '무언가가 절개지 안에 서 있다. 목요일부터 거기 있다.',
    },
    {
      id: 'i_b_invoice_ganger', form: 'invoice', voice: 'working', weight: 5,
      text: '반장 청구서, 선로 개통 작업.\n인부 아홉 명, 이틀: 18크라운.\n화약: 4크라운.\n쇠지렛대 한 개, 교체, 처음 것이 가져가졌음: 1크라운.\n맥주, 반장의 재량, 교통청 부담: 3크라운.',
    },
    {
      id: 'i_b_return_weather', form: 'return', voice: 'authority', weight: 6, tone: 'bad',
      text: '지연 귀속 보고. 원인: 장애물. 손실 시간: 340분. 선로 탓으로 귀속: 0분. 날씨 탓으로 귀속: 340분. 당일 날씨: 맑음.',
    },
    {
      id: 'i_b_letter_cart', form: 'letter', voice: 'halfling', weight: 5, kinds: ['shire'], tone: 'bad',
      text: (c) => `교통청 귀중. 여러분. 선로가 막히면서 운반꾼의 수레가 다시 다니기 시작했고, 이번 주 제 부엌에서 두 사람이 수레는 그들의 아버지에게도 늘 충분했다고 말하는 것을 들었습니다.\n\n수레는 그들의 아버지에게도 충분하지 않았습니다. 그들의 아버지들은 수레를 불평했습니다. 저는 이 부엌에서, 저 탁자에서, 그것을 직접 들었습니다.\n\n논쟁이 다른 쪽으로 기울기 전에 선로를 여십시오.\n\n— A. 퍼디풋 부인, ${SHIRE(c)}`,
    },
  ],
  beast: [
    {
      id: 'i_a_test_order', form: 'testimony', voice: 'working', weight: 6, tone: 'grave',
      text: '“세우면 안 됩니다. 선로 위에 무엇이 있든 세우면 안 됩니다. 그것이 상시 규정이고 옳은 규정이며, 제가 그것을 지켰다는 것을 기록해 주셨으면 합니다. 제동차 소리가 들렸으니까요. 그런데도 저는 지켰습니다.”\n\n— 기관사 콥',
    },
    {
      id: 'i_a_wire_wargs', form: 'wire', voice: 'working', weight: 6,
      text: '해거름 상행선에 와르그 스톱 그들을 뚫고 지나감 스톱 흩어지지 않았음 스톱 비켜서서 우리가 지나가는 것을 지켜봄 스톱 하겠다고 말했으므로 장부에 기록함',
    },
    {
      id: 'i_a_invoice_van', form: 'invoice', voice: 'authority', weight: 5,
      text: '청구, 제동차 14호.\n차량 전손: 60크라운.\n차장의 등불, 모자 및 저녁: 2크라운.\n차장에게, 전액 급여로 자기 난로 앞에서 1주, 청장이 평의회 회부 없이 승인: 3크라운.',
    },
    {
      id: 'i_a_form_couplings', form: 'form', voice: 'authority', weight: 6, tone: 'grave',
      text: '분실 보고서. 차량: 광석차 한 대. 분실 장소: 고가교. 분실 경위: 가져가짐. 연결기: 풀려 있음. 연결기 손상: 없음. 손해사정인 비고: 부러져 있었으면 차라리 좋았겠음.',
    },
    {
      id: 'i_a_return_alongside', form: 'return', voice: 'authority', weight: 5,
      text: '가축 및 견인 보고. 운송한 말: 40. 개: 12. 매: 4. 4시 15분 차와 나란히 11마일을 전속력으로 스스로를 운송한 짐승: 1.',
    },
    {
      id: 'i_a_letter_sister', form: 'letter', voice: 'halfling', weight: 6, tone: 'bad',
      text: (c) => `교통청 귀중. 여러분. 저는 목요일에 ${P2(c, BURG(c))}에서 4시 15분 차로 오는 여동생 데이지를 마중 나갈 예정이었습니다. 바구니를 들고, 동생 방도 치워 두었습니다.\n\n4시 15분 차가 들어왔습니다. 기관차와 석탄과 냄새가 딸려 있었고, 차장은 문을 열어 주지 않았으며, 내리는 사람은 아무도 없었습니다.\n\n매표소에 물었고, 그들은 몹시 친절했으며 아무것도 몰랐습니다. 다음 차를 기다려야 하는지, 서신에 이름이 있는 누군가가 서면으로 알려 주기를 바랍니다.\n\n— 페러스-볼저 부인, 오빠 댁에서, 매로우미드`,
    },
    {
      id: 'i_a_notice_windows', form: 'notice', voice: 'authority', weight: 5,
      text: '여객은 터널과 고가교 사이에서 창문을 닫아 두시기 바란다. 회사는 그 이유를 밝히지 않으며 차장도 입을 열지 않을 것이다.',
    },
    {
      id: 'i_a_margin_adjuster', form: 'margin', voice: 'working', weight: 5, tone: 'bad',
      text: '제동차 청구 건 옆에, 손해사정인의 필적으로: “전액 지급하라. 나를 다시는 저곳에 보내지 마라.”',
    },
    {
      id: 'i_a_minute_plate', form: 'minute', voice: 'authority', weight: 5,
      text: '안건 3: 와르그. 운수과는 제동차 장갑판을 제안한다. 공사과는 터널을 제안한다. 청장은 두 부서가 알아서 협의하여 보고할 것을 제안하였고, 양쪽 모두 이후 그러고 싶지 않다는 서신을 보내 왔다. 안건 4: 보류.',
    },
    {
      id: 'i_a_line_lamp', form: 'line', voice: 'working', weight: 5,
      text: '사흘 밤 연속 구간에 와르그. 다친 사람 없음. 직원들이 제동차에 등불 하나를 더 달아 달라 요청하고 있다.',
    },
    {
      id: 'i_a_wire_dwarf', form: 'wire', voice: 'dwarf', weight: 5, kinds: ['delve'],
      text: '화약으로 갱구 도로에서 짐승 한 마리를 해치움 스톱 우리 쪽 한 명 부상, 심하지 않음 스톱 도로 개통됨 스톱 화약 30파운드를 교통청 계정으로 청구',
    },
  ],
  wrath: [
    {
      id: 'i_w_wire_gone', form: 'wire', voice: 'working', weight: 7, tone: 'grave',
      text: '선로가 사라짐 스톱 손상이 아니라 사라짐 스톱 지시 바람',
    },
    {
      id: 'i_w_verse_place', form: 'verse', voice: 'elf', weight: 5, tone: 'grave',
      text: '우리는 당신들의 쇠를 가져가지 않았다.\n당신들이 그것을 놓았던 장소를 가져갔다.',
    },
    {
      id: 'i_w_form_none', form: 'form', voice: 'authority', weight: 6, tone: 'grave',
      text: (c) => `손상 보고서. 구간: ${RG(c)}. 손상 종류: 없음. 선로 존재: 아니오. 이 두 답변을 정합할 것: 서기는 할 수 없음. 참조 ${ref(c)}.`,
    },
    {
      id: 'i_w_margin_oldplan', form: 'margin', voice: 'working', weight: 6, tone: 'grave',
      text: '“성토 제거됨”이라는 항목 옆에, 측량사의 필적으로: “밭이 우리가 오기 전 그대로다. 옛 도면을 꺼내 대 보았다. 일치한다.”',
    },
    {
      id: 'i_w_test_oldtrees', form: 'testimony', voice: 'working', weight: 6, tone: 'grave',
      text: '“그들은 걷는 속도로 옵니다. 당신이 믿지 않을 부분이 그것입니다. 걷는 속도로, 밤새. 아침이 되니 절개지가 있던 자리에 숲이 있었고, 나무들은 오래된 나무였습니다. 새 나무가 아니라. 오래된 것들. 읽히는 꼴 때문에 장부에 적는 것을 그만두었습니다.”\n\n— 반장 아이브스',
    },
    {
      id: 'i_w_minute_unmade', form: 'minute', voice: 'authority', weight: 6,
      text: (c) => `안건 1: ${RG(c)} 구간, 무효화됨. 안건 2: “무효화”가 회계가 인정하는 용어인지 여부. 안건 3: 회계가 인정하는 용어가 무엇인지. 결의: “비자발적 폐선”. 안건 4: 보류. 서기관은 물러나기를 청하였다.`,
    },
    {
      id: 'i_w_line_rolled', form: 'line', voice: 'working', weight: 6, tone: 'grave',
      text: '레일들이 압연된 순서 그대로 풀밭에 놓여 있다.',
    },
    {
      id: 'i_w_return_found', form: 'return', voice: 'authority', weight: 6, tone: 'grave',
      text: (c) => {
        const m = 180 + R(c, 90);
        return `선로 보고. 선로 마일: ${m}. 검측 마일: ${m}. 발견된 마일: ${m - 5}.`;
      },
    },
    {
      id: 'i_w_foot_older', form: 'footnote', voice: 'authority', weight: 5, tone: 'grave',
      text: '† 해당 구간은 이 시각표에 실려 있지 않다. 지난 시각표에도 실려 있지 않다. 더 오래된 시각표를 가진 여객은 사무실로 가져오기 바라며, 승강장에서 이를 논의하지 말기 바란다.',
    },
    {
      id: 'i_w_letter_redd', form: 'letter', voice: 'working', weight: 6, tone: 'grave',
      text: '청장에게. 전신은 받으셨을 것이다. 전신으로는 이 말이 제대로 닿지 않아 편지를 쓴다. 아무것도 잘못된 것이 없다. 땅은 헤집어지지 않았다. 울타리는 서 있고 오래된 울타리다. 가시금작화도 오래된 것이다.\n\n내 11개월의 작업은 밭에서 사라진 것이 아니다. 그 해에서 사라졌다. 직원들에게 물었더니 그들은 선로를 놓은 것은 기억하지만 그 밭은 기억하지 못한다.\n\n품삯을 치러 돌려보냈다. 집이 있는 곳으로 보내 주셨으면 한다.\n\n— J. 레드, 주재 기사',
    },
    {
      id: 'i_w_invoice_dwarf', form: 'invoice', voice: 'dwarf', weight: 5, tone: 'grave',
      text: '아이언무트 & 선스, 교통청에게.\n현장 출장, 둘이서, 하루: 청구하지 않음.\n해당 구간 재부설: 견적 제시하지 않음.\n\n우리는 그 땅 위에 서 보았다. 선로를 놓을 것이 없고, 개못을 박을 것도 없다. 이 공사에는 입찰하지 않는다. 다른 어떤 일이든 맡기라.',
    },
  ],
};

// ---------------------------------------------------------------------------
// OPENED / FOUNDED / GREW / DECLINED / ABANDONED
// ---------------------------------------------------------------------------

export const OPENED = [
  {
    id: 'o_min_band', form: 'minute', voice: 'authority', weight: 6,
    text: (c) => `안건 1: ${P(c)}–${P2(c)} 선, 개통. 참석: 청장, 서기관, 역장, 교구가 섭외하고 교구가 비용을 댄 취주악단, 그리고 승강장 뒤편의 회색 옷 인물 한 명 — 누구인지 아무도 알지 못했고 다과회에는 남지 않았다. 안건 2: 다과, 예산 초과. 안건 3: 보류.`,
  },
  {
    id: 'o_inv_scissors', form: 'invoice', voice: 'authority', weight: 6,
    text: '개통 경비 내역.\n리본, 세 야드: 무료, 기증받음.\n가위: 무료, 빌림.\n취주악단: 8크라운.\n취주악단, 두 번째 시간, 섭외하지 않았으나 피할 수 없었음: 8크라운.\n합계: 16크라운. 교통청은 더 이상 가위를 소유하지 않는다.',
  },
  {
    id: 'o_foot_request', form: 'footnote', voice: 'authority', weight: 6,
    text: (c) => `† ${P2(c)}는 요청 정차. 여객은 기관사가 볼 수 있는 곳에 서서 진심이라는 표정을 지음으로써 요청한다.`,
  },
  {
    id: 'o_form_wrongend', form: 'form', voice: 'authority', weight: 6,
    text: (c) => `개통 증명서. 노선: ${P(c)}–${P2(c)}. 궤간: 정확. 자갈: 충분. 울타리: 양쪽 완비. 역사: 한 동, 목조. 역 위치: 마을의 엇나간 끝. 결정자: 지주. 서명, 지구 기사.`,
  },
  {
    id: 'o_let_tibb', form: 'letter', voice: 'halfling', weight: 6, tone: 'good',
    text: (c) => `교통청 귀중. 여러분. 선로가 개통되었고 저는 오늘 아침 아무 이유 없이 우리 승강장 끝에서 끝까지 열한 번을 걸었습니다. 저는 쉰한 살입니다.\n\n— 팁, 우체국장, ${P2(c)}`,
  },
  {
    id: 'o_marg_fares', form: 'margin', voice: 'working', weight: 6,
    text: '“첫 열차, 승객 네 명”이라는 항목 옆에, 매표 서기의 필적으로: “운임 넷. 승객 아홉.”',
  },
  {
    id: 'o_not_provisional', form: 'notice', voice: 'authority', weight: 6,
    text: '선로는 개통되었다. 시각표는 잠정이다. 시각표는 수년간 잠정일 것이며, 여객은 그것과 화해하기 바란다.',
  },
  {
    id: 'o_ret_firstweek', form: 'return', voice: 'authority', weight: 6,
    text: (c) => `운행 첫 주. 배정 열차: 12. 운행 열차: 12. 운임 수입: ${30 + R(c, 24)}크라운. 소화물: 9. 불평: 1건, 선로를 이용한 적도 없고 이용할 생각도 없는 자로부터.`,
  },
  {
    id: 'o_test_fourthnight', form: 'testimony', voice: 'working', weight: 6, tone: 'good',
    text: '“마을 전체가 울타리까지 내려와 지나가는 걸 구경했습니다. 사흘 밤 연속으로요. 나흘째 밤엔 아무도 안 왔습니다. 그때 이게 철도가 됐구나 싶었습니다.”\n\n— 기관사 멀',
  },
  {
    id: 'o_verse_written', form: 'verse', voice: 'elf', weight: 4, tone: 'grave',
    text: '길이 열렸다. 그리고 빠르다.\n\n라스리에스의 여울과 우리가 미리엘을 위해 세운 돌 사이에는 사백 년의 걸음이 있었고, 그 걸음을 위한 노래가 있었다. 노래는 아홉 절이다. 여정은 이제 아침 한나절이다.\n\n우리는 노래를 줄이지 않을 것이다.',
  },
  {
    id: 'o_line_sixty', form: 'line', voice: 'authority', weight: 6,
    text: (c) => `${P(c)}와 ${P2(c)}가 이어졌다. 두 마을은 예순 해 동안 말을 나누지 않았다.`,
  },
  {
    id: 'o_inv_piano', form: 'invoice', voice: 'working', weight: 5,
    text: (c) => `화물 운송장, 첫 하행 화물. 곡물 스무 자루. 맥주 네 통. 석재 1톤. 못 한 통. 피아노 한 대, 보험 부침, 수취인은 ${P2(c)}의 아직 지어지지 않은 집.`,
  },
  {
    id: 'o_foot_cart', form: 'footnote', voice: 'authority', weight: 5, tone: 'plain',
    text: '‡ 이 시각표와 운반꾼의 수레가 어긋날 때, 수레는 이백 년 동안 옳았으며 더 이상 옳지 않다.',
  },
  {
    id: 'o_wire_odd', form: 'wire', voice: 'working', weight: 6, tone: 'plain',
    text: '선로 개통 스톱 첫 열차 통과 스톱 모든 것이 계획 그대로 스톱 몹시 이상한 기분임 스톱',
  },
  {
    id: 'o_let_dwarf', form: 'letter', voice: 'dwarf', weight: 5, cultures: ['dwarf'],
    text: (c) => `교통청 귀중. ${P(c)}행 선로가 개통되었다. 궤간은 정확하고, 자갈은 충분히 깊고, 절개지 사면은 너희 측량사가 원한 각도가 아니라 우리가 명세한 각도다.\n\n네가 실을 것이라 말한 것을 실을 것이다. 그 이상도 실을 것이다. 올해는 그것을 시험하지 마라.\n\nT. 아이언무트, 공사감독`,
  },
];

export const FOUNDED = [
  {
    id: 'f_form_register', form: 'form', voice: 'authority', weight: 6,
    text: (c) => `지명 등록부 추가 사항. 위치: ${RG(c)}, ${8 + R(c, 30)}마일 지점 선로 옆. 최초 집계 가옥: ${9 + R(c, 14)}. 주막: 하나, 이미 있음. 지명: ${UP(P(c))}, 교구 승인 조건. 공사 중 작업반들이 붙인 이름: 기입하지 않음.`,
  },
  {
    id: 'f_let_name', form: 'letter', voice: 'halfling', weight: 6, cultures: ['halfling'],
    text: (c) => `교통청 귀중. 여러분. 이름에 어려움이 있습니다.\n\n귀 청의 표지판은 이곳을 ${P(c)}라 부릅니다. 첫 지붕을 올린 네 가구는 사이딩스라 부르는데, 원래 여기 있던 것이 그것이기 때문입니다. 제 아내의 일가는 핍윅에서 건너와 보름 먼저 와 있었는데 뉴 핍윅이라 부릅니다. 새로울 것도 없고 핍윅도 아닙니다.\n\n학교 선생은 비탈을 뜻하는 옛말에서 왔다며 d를 두 개 써서 시딩스여야 한다고 주장하고, 학교 문에 그렇게 써 두었습니다. 학교가 문을 연 지 아흐레째입니다.\n\n교통청이 확정해 주신다면 따르겠습니다. 단, 제가 처음에 쓴 방식으로 확정해 주신다는 조건입니다.\n\n— 햄패스트 터널리, 네 가구를 대표하여`,
  },
  {
    id: 'f_ret_census', form: 'return', voice: 'authority', weight: 6,
    text: (c) => `신흥 취락 ${P(c)} 최초 보고. 가옥: ${10 + R(c, 12)}. 가구: 같음. 인원: ${44 + R(c, 60)}. 주막: 1. 대장장이: 1. 우물: 1, 공동 사용. 교회: 없음. 묘지: 아직 필요 없음. 과세 평가액: 다음 결산일에 산정 예정.`,
  },
  {
    id: 'f_test_grew', form: 'testimony', voice: 'working', weight: 6,
    text: (c) => `“거기엔 아무것도 없었습니다. 이 점을 이해해 주셨으면 합니다. 내년 시각표에는 마치 예부터 있었던 것처럼 실릴 테니까요. 이 년 전엔 울타리와 흙더미와 차량을 세워 둘 곳뿐이었습니다. 이제는 골목이 있고 대장장이가 있고, 지난 화요일엔 한 여인이 저를 세워 상행 열차가 언제냐고 물었는데, 저는 몰랐습니다. 거기서 상행 열차는 있어 본 적이 없으니까요.”\n\n— 기관사 멀릿, ${P(c)}에 대하여`,
  },
  {
    id: 'f_min_status', form: 'minute', voice: 'authority', weight: 6,
    text: (c) => `안건 4: 신흥 취락 ${P(c)}. 운수과는 간이역 설치를 요청한다. 공사과는 역명판 비용을 누가 댈 것인지 묻는다. 역명판이 비용의 전부이며 교구에는 아직 재정이 없기 때문이다. 청장이 사비로 역명판을 내겠다고 하였으나, 기록할 수 없다는 답을 들었다. 결의: 간이역으로 한다. 안건 5: 역명판. 보류.`,
  },
  {
    id: 'f_line_lamps', form: 'line', voice: 'working', weight: 5,
    text: (c) => `목요일에 ${P(c)}에 등불이 켜졌다. 봄에는 그곳에 등불이 없었다.`,
  },
  {
    id: 'f_foot_jurisdiction', form: 'footnote', voice: 'men', weight: 5,
    text: (c) => `§ 왕실 서기관실은 신흥 취락 ${P(c)}가 어느 백호구에도 속하지 않고, 어느 법정에도 납부하지 않으며, 어느 징집 명부에도 오르지 않았음을 지적한다. 이 부서는 그것이 부정이라고 말하지 않는다. 아직 정이 아니라고 말하는 것이며, 교통청이 그곳을 어느 백호구로 간주하는지 알려 주기를 요청한다. 그 답을 숙고할 수 있도록.`,
  },
  {
    id: 'f_inv_dwarf', form: 'invoice', voice: 'dwarf', weight: 5, cultures: ['dwarf'],
    text: (c) => `${P(c)}의 정착민들에게 판매함, 그들의 요청에 의함.\n다듬은 돌, 열한 개 문간용: 44크라운.\n거친 돌, 기초용: 20크라운.\n우물 하나, 굴착, 벽돌 조적, 22피트, 19피트에서 용수: 60크라운.\n당일 전액 결제됨. 그들은 조건을 묻지 않았고 우리도 제시하지 않았다.`,
  },
];

export const GREW = [
  {
    id: 'g_inv_fee', form: 'invoice', voice: 'halfling', weight: 6,
    text: (c) => `${P(c)}발 신청서, 수수료 동봉.\n두 번째 승강장: 신청함.\n문장: 신청함.\n박스창이 딸린 역장 관사: 신청함.\n동봉 수수료: 2크라운.\n필요 수수료: 20크라운.`,
  },
  {
    id: 'g_form_counting', form: 'form', voice: 'authority', weight: 6,
    text: (c) => `재분류. 지명: ${UP(P(c))}. 근거: 인구. 지난 보고 시 인구: 인쇄된 대로. 이번 보고 시 인구: 더 많음. 정확한 수치: 교구 서기가 세는 중이며 기한 연장을 요청함.`,
  },
  {
    id: 'g_marg_hat', form: 'margin', voice: 'authority', weight: 6,
    text: '역장의 더 큰 모자 요청 옆에, 서기관의 필적으로: “허가함”. 그 옆에, 청장: “허가하되 아무 말도 하지 마시오. 그는 그 모자를 받을 자격이 있소.”',
  },
  {
    id: 'g_let_inn', form: 'letter', voice: 'halfling', weight: 6,
    text: (c) => `교통청 귀중. 저희 주막은 두 번 증축했으나 여전히 좁습니다. 아내는 감사 편지를 쓰라고 하지만, 저는 감사하려고 쓰는 것이 아닙니다.\n\n장날 화요일이면 마당에도 사람이 있고 계단에도 사람이 있습니다. 지난주에는 밤 11시에 고기를 달라는 굴착단 일행이 있었는데 값은 치렀습니다. 여동생의 아들을 써야 했는데, 성실하지만 요리사는 아닙니다.\n\n이것은 불평입니다. 불평이라는 점을 분명히 하고 싶습니다.\n\n— 배로우, 주인, 그린 맨 주막, ${P(c)}`,
  },
  {
    id: 'g_not_platform', form: 'notice', voice: 'authority', weight: 5,
    text: (c) => `${UP(P(c))}에서 내리실 여객은 맨 끝 칸에서 내리시기 바란다. 승강장은 올해 두 번 연장되었으며 다시 연장될 것이다.`,
  },
  {
    id: 'g_foot_market', form: 'footnote', voice: 'authority', weight: 5,
    text: '† 장날에는 두 편 증편한다. 장날은 이제 대부분의 날이다.',
  },
  {
    id: 'g_min_consortium', form: 'minute', voice: 'authority', weight: 6,
    text: (c) => `안건 5: ${P(c)}. 운수과는 화물장이 매일 밤 가득 차고 대기선이 매일 아침 가득 찬다고 보고하며 토지를 요청한다. 토지가 조건부로 제안되었는데, 확인해 보니 그 컨소시엄은 역장이었다. 결의: 토지를 매입한다. 추가 결의: 아무도 아무 말도 하지 않는다.`,
  },
  {
    id: 'g_ret_ninemiles', form: 'return', voice: 'authority', weight: 6, tone: 'good',
    text: (c) => `매표소 보고, ${P(c)}. 이번 분기 발매: ${900 + R(c, 700)}매. 작년 동분기: 그 4분의 1. 평생 태어난 곳에서 아홉 마일 이상 가 본 적 없는 이들에게 발매된 승차권: 대부분.`,
  },
  {
    id: 'g_test_lad', form: 'testimony', voice: 'working', weight: 6, tone: 'good',
    text: '“매주 화요일 제 열차에 소년이 하나 탑니다. 아몬할의 학교에 가는 겁니다. 그 아이 아버지는 마부였고, 아버지는 아몬할에 가 본 적이 없습니다.”\n\n— 차장 페티퍼',
  },
  {
    id: 'g_verse_hill', form: 'verse', voice: 'elf', weight: 4, tone: 'grave',
    text: (c) => `열두 채가 있던 곳에 예순 채가 들어선 ${P(c)}. 우리는 그 열두 채와 그 안에 누가 있었는지를 기억한다.\n\n당신들의 석탄 야적장이 선 자리에 있던 과수원은 오스릭이라는 이가 심은 것이다. 당신들은 그를 기억하지 못한다. 그는 접붙이기를 직접, 그리고 서툴게 했으나, 그 나무들은 그럼에도 아흔 해를 열매 맺었다.`,
  },
  {
    id: 'g_line_gate', form: 'line', voice: 'dwarf', weight: 5, cultures: ['dwarf'],
    text: (c) => `${P(c)}가 두 번째 갱구를 열었다. 아래에 일손 마흔이 늘었다. 결산은 매월 이루어지며 한 번도 늦은 적이 없다.`,
  },
];

export const DECLINED = [
  {
    id: 'd_foot_doctor', form: 'footnote', voice: 'authority', weight: 6, tone: 'bad',
    text: (c) => `† ${P(c)} 노선은 두 편으로 감축된다. 두 번째 편이 유지되는 것은, 한 편으로는 의사를 데려오고 다시 모셔다드리기에 부족하기 때문이다.`,
  },
  {
    id: 'd_marg_lit', form: 'margin', voice: 'working', weight: 6, tone: 'bad',
    text: '“간이역 폐쇄 예정”이라는 항목 옆에, 역장의 필적으로: “불은 켜 두겠습니다. 그 값은 지급하지 않으셔도 됩니다.”',
  },
  {
    id: 'd_let_mill', form: 'letter', voice: 'halfling', weight: 6, tone: 'bad',
    text: (c) => `교통청 귀중. 방앗간이 멈췄습니다. 어째서 멈췄는지 아무도 말해 주지 않습니다. 문 앞에서 정중히 물었고, 가게에서도 물었습니다. 가게도 문을 닫았습니다.\n\n남편의 일가는 이곳의 방앗간 주인이었고 그 전에는 그의 아버지였습니다. 교구 장부가 시작된 이래 그 물길에는 늘 방앗간이 있었습니다. 기차에 대해 쓰는 것이 아닙니다. 답해 주는 관청이 여기뿐이라 쓰는 것입니다.\n\n— 마스덴 미망인, ${P(c)}`,
  },
  {
    id: 'd_form_notyet', form: 'form', voice: 'authority', weight: 6, tone: 'bad',
    text: (c) => `수송 검토. 역: ${UP(P(c))}. 주간 여객: 40, 종전 190. 주간 화물: 없음. 지구의 건의: 노선 폐지. 지구의 건의, 두 번째 쪽, 무서명: 아직 폐지하지 말 것.`,
  },
  {
    id: 'd_inv_fire', form: 'invoice', voice: 'working', weight: 6, tone: 'bad',
    text: (c) => `결산 내역, ${P(c)}역, 분기 마감.\n등유: 1크라운.\n대합실 난로용 석탄: 2크라운.\n백토: 없음, 사용하지 않음.\n분기 수입: 3크라운.\n대합실 난로는 매일 꺼뜨리지 않았다.`,
  },
  {
    id: 'd_min_nomotion', form: 'minute', voice: 'authority', weight: 5, tone: 'bad',
    text: (c) => `안건 4: ${P(c)}. 수치가 낭독되었다. 폐지에 반대한 이도, 발의한 이도 없었다. 안건 5: 보류. 안건 4 또한 보류, 청장의 발의에 의하며, 사유는 제시되지 않았고 요구되지도 않았다.`,
  },
  {
    id: 'd_line_mill', form: 'line', voice: 'working', weight: 5, tone: 'bad',
    text: '방앗간이 멈췄다. 아무도 이유를 말하지 않았다.',
  },
  {
    id: 'd_test_names', form: 'testimony', voice: 'working', weight: 5, tone: 'bad',
    text: '“똑같은 역입니다. 똑같은 등불, 똑같은 긴의자, 똑같이 느린 시계. 다만 이제는 그들의 이름을 전부 안다는 것뿐입니다. 예전엔 몰랐는데.”\n\n— 기관사 샐로우',
  },
  {
    id: 'd_verse_fewer', form: 'verse', voice: 'elf', weight: 4, tone: 'grave',
    text: '올해의 등불은 지난해보다 적다.\n지난해에도 우리는 세었다.\n마흔하나였다가. 서른넷.',
  },
];

export const ABANDONED = [
  {
    id: 'z_ret_signboard', form: 'return', voice: 'authority', weight: 6, tone: 'bad',
    text: (c) => `등록부 수정. 등록 지명: ${55 + R(c, 12)}, 종전에는 하나 더 많았음. 아직 사람이 사는 곳으로 옮긴 종: 1. 내려서 보관한 역명판: 1. 파기한 역명판: 없음, 그 이름이 다시 필요해질 수 있기 때문이다.`,
  },
  {
    id: 'z_let_toolate', form: 'letter', voice: 'halfling', weight: 7, tone: 'grave',
    text: (c) => `교통청 귀중. 우리가 마지막입니다. 운임을 낼 수 없어 당신들의 선로를 따라 서쪽으로 걸어갑니다. 우리가 떠나는 것이 철도 때문이 아니라는 점은 알려 두고 싶습니다.\n\n우리가 떠나는 것은 철도가 너무 늦게 왔기 때문입니다.\n\n— 홉 태로, ${P(c)}`,
  },
  {
    id: 'z_foot_shown', form: 'footnote', voice: 'authority', weight: 6, tone: 'bad',
    text: '† 운행 없음. 직원 없음. 이 간이역이 이 시각표에 실려 있는 것은 지난 시각표에 실려 있었기 때문이다.',
  },
  {
    id: 'z_marg_opened', form: 'margin', voice: 'authority', weight: 6, tone: 'grave',
    text: '“역 폐쇄”라는 항목 옆에, 사무실이 모르는 필적으로: 마흔 해 전의 날짜와, 한 단어 “개통”.',
  },
  {
    id: 'z_verse_waited', form: 'verse', voice: 'elf', weight: 5, tone: 'grave',
    text: (c) => `${P(c)}는 비었다. 사대를 이은 마을이었고, 그 이름은 마을보다 오래되었다. 처음에는 황야의 이름이었고, 황야는 아직 거기 있으며, 여전히 그렇게 불린다.\n\n마지막으로 떠난 이는 앤크레드 미망인으로, 집 문짝을 떼어 가져갔다.`,
  },
  {
    id: 'z_wire_anyway', form: 'wire', voice: 'working', weight: 6, tone: 'grave',
    text: (c) => `${UP(P(c))} 간이역 폐쇄 스톱 여객 없음 스톱 소화물 없음 스톱 전신을 보낼 상대가 남아 있지 않음 스톱 그래도 전신함`,
  },
  {
    id: 'z_ret_households', form: 'return', voice: 'authority', weight: 5, tone: 'grave',
    text: (c) => `${P(c)}의 과세 장부에서 삭제된 가구들, 그 마지막이다. 브램블. 채피. 크롭 세 가구. 그럽. 하디. 너빈. 핍. 태로 세 가구. 터널리. 윅.\n\n열넷. 그들이 어디로 갔는지는 교통청이 기록할 일이 아니며, 기록되지 않았다.`,
  },
];
