// Outcomes, and the writing.
//
// Voice rules, which are not negotiable because they are most of the game:
//
//   * The Authority files reports. It does not editorialise, and it never winks.
//   * Catastrophe is an operational irregularity. Give it a reference number.
//   * Specific nouns, named people, real detail. Never "a village" if it can be
//     Nether Wembly, and never "someone complained" if it can be Mistress
//     Amaranth Puddifoot, who has now written eleven times.
//   * No exclamation marks. No "not merely X but Y". No lists of three.
//   * Half of this should be funny and half of it should genuinely land. The two
//     halves hold each other up; drop either and the whole thing collapses into
//     either whimsy or portent.

import { CULTURES, TIER_NAME, GOODS, KINDS, WEEK } from './model.js';
import { REGION_NAME, REGION_LORE, TRAITS } from '../world/worldgen.js';
import { createRegistry } from './registry.js';
import { priceOf, goodName } from './commissions.js';

let refCounter = 1140;
const ref = () => `RTA/${(refCounter += 7)}`;

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// ---------------------------------------------------------------------------
// Reactive reports — the running commentary on what the player just did
// ---------------------------------------------------------------------------

// These fire whenever the written corpus has nothing to offer, so they are seen
// often. Every one of them used to end on an ironic reversal in the same arch
// narratorial voice — see VOICE.md. Rewritten with a speaker per entry, a third of
// them deliberately flat, and the reversal used sparingly.

const BUILT_LINES = [
  // authority, flat
  (a, b) => `운행 개시: ${a}–${b}. 각 방향 두 편, 장날에는 세 편.`,
  // working man, plain
  (a, b) => `${a}발 ${b}행 첫 열차가 반장을 앞 발판에 태우고 걷는 속도로 내려갔다. 그는 선로가 좋다고 말했다. 그는 그런 말을 하지 않는 사람이다.`,
  // halfling
  (a, b) => `${b}는 깊이 감사하며 ${a}에 케이크 하나를, 교통청에 두 번째 케이크를, 그리고 어느 것이 어느 것인지 설명하는 쪽지를 보냈다.`,
  // authority, dry, not reversed
  (a, b) => `${a}–${b} 공사 준공. 최종 비용은 날씨 항목으로 견적의 9분의 1을 초과하였다.`,
  // dwarf
  (a, b) => `${a}–${b}. 궤간 정확. 자갈 양호. 인수 서명 완료.`,
  // authority, flat
  (a, b) => `${a}와 ${b}가 이어졌다. 역명판은 칠해져 걸렸다.`,
  // halfling, arrives at its grievance sideways
  (a, b) => `퍼디풋 부인이 서신을 보내 왔다. ${a} 선은 훌륭한 것이며, 자기 어머니 일가는 ${b} 출신으로 별로 대접받지 못했으며, 6시 40분 차는 너무 이르다고 한다.`,
];

const TUNNEL_LINES = [
  (n) => `${n} 아래 관통. 양 굴진면 정확히 만남. — T. 아이언무트, 공사감독`,
  (n) => `${n} 터널 개통. 길이 1마일 6체인, 전 구간 피복 완료.`,
  (n) => `${n} 터널 준공. 굴착단이 정점에 아홉 자 높이로 카자드를 새겼다. 어느 여객도 결코 보지 못할 자리에.`,
  (n) => `${n} 아래 관통. 돌은 마른 채 나왔다. 스란 아이언무트가 장비가 현장에 있는 동안 두 번째 것도 원하는지 묻는다.`,
];

const GREW_LINES = [
  (n, t) => `${n}이(가) 등록부에 ${t}(으)로 등록되었다.`,
  (n, t) => `${n}이(가) ${t}(으)로 성장하였다. 주막은 두 번 증축되었고 주인은 놀라는 척하기를 그만두었다.`,
  (n, t) => `${n}이(가) 이제 ${t}이며 문장을 신청하였다. 신청서에 그림이 동봉되어 있다.`,
  (n, t) => `${n}, ${t}. 인구 보고는 후일 송부.`,
  (n, t) => `재분류: ${n}, ${t}. 역장이 새 지위에 걸맞은 모자를 요청하였으나 기다리라는 답을 들었다.`,
];

// A place slipping. No jokes in this pool.
const DECLINE_LINES = [
  (n) => `${n}의 인구가 계속 줄고 있다. 간이역에는 아직 직원이 있다.`,
  (n) => `${n}이(가) 한 등급 아래로 등록되었다. 방앗간이 멈췄다.`,
  (n) => `이번 분기에도 ${n}은 줄었다. 역장은 등불을 켜 두고 있으며, 그 일로 급여를 받지는 않는다.`,
];

// A place ending. Grave register: concrete nouns, then stop.
const ABANDON_LINES = [
  (n) => `${n}은(는) 비었다. 마지막 가구가 도보로, 선로를 따라, 그들이 약속받았던 철도의 방향으로 떠났다.`,
  (n) => `${n}이(가) 등록부에서 삭제되었다. 그 종은 아직 사람이 사는 곳으로 옮겨졌다.`,
  (n) => `${n}에는 아무도 남지 않았다. 역명판은 내려 보관되었다. 그 이름은 다시 필요해질지도 모른다.`,
];

const INCIDENT_BLOCK = [
  (r) => `낙석, ${r} 구간. 작업반이 치우는 동안 선로 폐쇄. 참조 ${ref()}.`,
  (r) => `${r}에 나무가 선로를 가로질러 있다. 어제는 없었고, 베어진 것도 아니다. 참조 ${ref()}.`,
  (r) => `${r}의 절개지 안에 무언가가 서 있다. 목요일부터 거기 있다. 여객은 자리에 앉아 계시기 바란다.`,
  (r) => `${r} 구간에 장애물이 있다. 파수꾼들은 그 장애물을 가축이라고 부른다. 참조 ${ref()}.`,
  (r) => `${r} 신호탑에서 네 시간 신호에 걸렸다. 신호기는 정상이었다. 신호수가 확신하지 못했을 뿐이며, 나는 그를 탓하지 않는다. — 기관사 할로웨이`,
  (r) => `${r} 구간: 장애물 제거됨, 12톤, 두 차량 분량. 부상자 없음.`,
];

const INCIDENT_BEAST = [
  (r) => `${r}에서 열차가 습격당했다. 기관차는 무사하다. 제동차는 손해사정인들이 다룰 일이다. 참조 ${ref()}.`,
  (r) => `${r} 상행선, 해거름에 와르그. 나는 그들을 뚫고 지나갔다. 그들은 흩어지지 않았다. 비켜서서 우리가 지나가는 것을 지켜보았다. — 기관사 멀릿`,
  (r) => `4시 15분 차가 ${r}을(를) 통과해 왔다. 기관차뿐이었고 그 외에는 아무것도 없었다. 참조 ${ref()}.`,
  (r) => `${r} 고가교에서 차량 한 대가 사라졌다. 연결기는 부러진 것이 아니라 풀려 있었다.`,
  (r) => `${r} 구간: 직원들의 자체 합의로 야간 작업 중단. 교통청은 이를 번복하지 않았다.`,
];

// The older powers. Grave register throughout.
const INCIDENT_WRATH = [
  (r) => `${r} 구간이 무효화되었다. 부서진 것이 아니다. 레일들이 압연된 순서 그대로 풀밭에 놓여 있다. 참조 ${ref()}.`,
  (r) => `${r}을(를) 지나던 선로가 하룻밤 사이에 걷혔다. 성토와 울타리와 측량사의 외투와 함께. 외투는 돌려주었다.`,
  (r) => `${r}의 공사 흔적이 사라졌다. 그 자리에 언덕이 있고, 그 지형에 어울리는 모습이다.`,
];

// ---------------------------------------------------------------------------

/**
 * The firsts. These are the moments the whole game is arranged around. Each gets
 * a plate and a page. If the expanded corpus in src/text/reports.js offers an
 * alternative it is preferred; this is the floor, not the ceiling.
 */
const CROSSING_FALLBACK = {
  first_bridge: () =>
    '강에 다리가 놓였다. 열한 주와 네 차례의 설계 변경과 잠수부 한 명이 들었고, '
    + '잠수부는 원 견적에 없었다는 점을 기록해 두기를 교통청은 바란다.\n\n'
    + '첫 통과 열차는 교량공들이 상판 위에 서 있는 가운데 걷는 속도로 건넜다. '
    + '그것이 자신감인지 인질극인지 아무도 묻지 않았다.',

  first_bore: () =>
    '선더링 산맥이 관통되었다.\n\n'
    + '천이백 피트의 암반, 양쪽 끝에서 굴진하여 손바닥 너비 이내로 만났다. 스란 '
    + '아이언무트는 레일이 깔리기 전 그 전 구간을 걸으며 내내 한마디도 하지 않았는데, '
    + '그를 아는 이들의 말로는 그것이 얻을 수 있는 최고의 찬사라 한다.\n\n'
    + '아흐레 걸리던 여정이 이제 오후 한나절이다. 나머지 여드레를 왕국이 무엇에 쓸지 '
    + '아무도 아직 계산하지 못했다.',

  first_pass: () =>
    '터널 없이 고개를 넘는 선로가 놓였다. 한쪽 사면을 오르고 다른 쪽을 내리는데, '
    + '그 구배를 굴착단은 서면으로 용감하다고 평하였다.\n\n'
    + '매년 겨울 눈에 묻힐 것이다. 비용은 터널의 10분의 1이었다. 이 두 가지 모두 이제 영구적이다.',

  first_marsh: () =>
    '우는 습지를 가로지르는 제방도로가 개통되었고, 벌써 화요일보다 1인치 낮아졌다.'
    + '\n\n습지는 적대적이지 않다. 습지는 참을성이 있다. 예산을 세우기에는 그쪽이 훨씬 어렵다.',

  first_wood: () =>
    '머크홀트를 지나는 선로. 작업반들은 자체 합의로 주간에만 작업했고, 아무도 그들과 '
    + '논쟁하지 않았다.\n\n'
    + '절개지 양쪽의 나무들이 측량 기록보다 이번 주 선로에 더 가까워져 있다. 측량은 재확인되었다. '
    + '측량은 정확하다.',

  first_east: () =>
    '랙랜드를 지나 잿빛벌판으로 이어지는 선로가 뚫렸다.\n\n'
    + '능선의 틈은 지켜지지 않고 있었다. 아무도 작업반을 막지 않았고, 지켜보지도 않았으며, '
    + '무엇 하나 요구하지도 않았다.\n\n'
    + '교통청은 그것이 행운인지를 몇 주간 논의했다. 논의를 그만두었다.',

  first_wrack: () =>
    '선로가 랙 산에 닿았다.\n\n'
    + '차막이와 급수탑과 표준 서체로 이름을 쓴 역명판이 있다. 간판 장인은 나흘을 들였고 '
    + '공개적으로 감사받지 않기를 요청했다.\n\n'
    + '운임은 파격적이다. 첫 동행 화물은 무기였고, 그 서류는 모든 항목에서 정확했다.',

  first_quays: () =>
    '회색 부두가 시각표에 올랐다.\n\n'
    + '엘프들이 첫 열차를 보러 내려왔으나 타지는 않았다. 그들은 날씨를 보는 사람들처럼 '
    + '부두에 서 있다가, 열차가 떠나자 그곳에서 하던 무엇이든으로 돌아갔다.',
};

/** The three-step thread that answers: does anything mind if you tunnel deep? */
const DEEP_BORE = {
  1: '심부 굴진면의 작업반이 바람을 보고한다.\n\n'
    + '위에 갱도도, 옆에 갱구도 없는데 공기는 어쨌든 움직이고 있다. 스란 아이언무트가 '
    + '내려갔다 왔다. 그는 동바리를 두 배로 하여 굴진을 계속하라 지시했고, 이유는 말하지 않았다.',
  2: '심부 굴진면이 하나의 갱도에 구멍을 냈다.\n\n'
    + '우리 것이 아니다. 다듬은 돌, 굴착단이 연대를 매기기를 꺼릴 만큼 오래된, 우리 선형을 '
    + '가로질러 나는데, 그 각도는 어딘가 특정한 곳으로 향하고 있었음을 시사한다.\n\n'
    + '그 동쪽 끝에 문이 하나 있다. 문은 닫혀 있다. 교통청은 닫힌 채로 두라는 지시를 내렸고, '
    + '정중하게, 누구에게 그런 지시를 내리는 것이냐는 질문을 받았다.',
  3: '문이 열려 있다.\n\n'
    + '야간 반이 올라왔다. 전원이, 교통청은 이를 안도와 함께 기록한다. 등불은 없이, 이는 '
    + '안도 없이 기록한다.\n\n'
    + '심부 굴진면은 봉쇄되었다. 12피트의 석조와 그 뒤의 두 번째 벽. 굴착단은 요청받지 않고 '
    + '둘 다 쌓았고 어느 것도 청구하지 않았다. 스란 아이언무트는 신호 담당으로의 전근을 요청했다.\n\n'
    + '위쪽 터널은 운행을 계속한다. 열차는 그 안에서 정차하지 말라는 지시를 받았다.',
};

// The proactive corpus — reports that fire on the state of the realm
// ---------------------------------------------------------------------------

const FLAVOUR = [
  {
    id: 'hens', weight: 5, cooldown: 9,
    when: (s) => s.sites.some((x) => x.kind === 'shire' && x.connected),
    text: (s) => `아마란스 퍼디풋 부인이 서신을 보내 왔다. 기적이 자기 암탉들을 놀라게 하니 종으로 바꿔 달라는 내용이다. 열한 번째 서신이다. 암탉들은 언급하지 않았다.`,
  },
  {
    id: 'hens2', weight: 3, cooldown: 14, after: 'hens',
    when: (s) => true,
    text: () => `퍼디풋 부인이 또 서신을 보내 왔다. 서신에는 그림이 들어 있다. 그림은 종의 그림이다.`,
  },
  {
    id: 'lost_property', weight: 5, cooldown: 7,
    when: () => true,
    text: (s) => {
      const items = [
        '검은 우산 한 점', '주인 없는 검 한 자루', '다른 어딘가의 지도 한 다발',
        '결혼반지와 “아니오”라고 적힌 쪽지', '살아 있는 거위 한 마리', '사람의 것이 아닌 이빨 한 상자',
        '똑같은 회색 망토 아홉 벌', '우리가 운송한 적 없는 화물의 운송장',
        '조율된 작은 하프', '정수리에 탄 구멍이 난 모자',
        '아이의 신발, 한쪽만', '노선 어디에도 맞지 않는 쇠열쇠',
      ];
      const two = () => {
        const a = pick(s.rng, items);
        let b = pick(s.rng, items);
        for (let k = 0; k < 6 && b === a; k++) b = pick(s.rng, items);
        return [a, b];
      };
      const [a, b] = two();
      const Cap = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1);
      return pick(s.rng, [
        `분실물 보고, 미카엘 축제 분기. 보관 중: ${a}; ${b}. 찾아간 것: 없음. 보관실이 가득 차서 잉여분은 옆방에 두었는데, 옆방도 가득 찼다.`,
        `분실물. 서기가 재가를 구한다. 선반에 올라온 지 11개월 된 ${a}에 대하여, 그리고 집에 가져가고 싶다는 ${b}에 대하여. 재가: 둘 다 불허. 서면으로 다시 묻지 말 것.`,
        `분실물, 민원 한 건 첨부. 간이역에 접수됨: ${a}. 같은 간이역에, 같은 사람이 접수함: ${b}. 그는 열차에서 주웠다고 한다. 차장은 그가 가지고 탔다고 한다.`,
      ]);
    },
  },
  {
    id: 'punctuality', weight: 5, cooldown: 8,
    when: (s) => s.links.length > 5,
    text: (s) => {
      const pc = 61 + Math.floor(s.rng() * 33);
      return `이번 기간 정시율: ${pc}퍼센트. 교통청은 이 수치가 개정 시각표를 기준으로 산출되었으며, 시각표는 이 수치를 개선하기 위해 개정되었음을 밝혀 둔다.`;
    },
  },
  {
    id: 'dwarf_invoice', weight: 4, cooldown: 10,
    when: (s) => s.can.tunnel && s.regard.dwarf > 30,
    text: () => `굴착단이 교통청이 읽을 수 없는 문자로 세목을 적고, 교통청이 다툴 수 없는 액수로 합계를 낸 청구서를 제출하였다. 지급되었다.`,
  },
  {
    id: 'elf_objection', weight: 5, cooldown: 8,
    when: (s) => !s.elvesGone && s.regard.elf < 55,
    text: (s) => pick(s.rng, [
      `항구에서 진정서가 접수되었다. 아홉 줄이고, 운문이며, 더 이상 거기 없는 한 그루 나무에 관한 것이다.`,
      `엘프들이 연기에 이의를 제기한다. 연기를 어떻게 해 주기를 바라는지는 말하지 않았다. 다만 장황하게, 자신들이 이의를 제기한다는 사실을 확립하였다.`,
      `엘프 대표단이 이사회에 참석하여 다과를 사양하였다. 네 시간을 머물렀다. 처음 10분 이후 아무 말도 하지 않았으며, 기록 담당은 그것이 더 나빴다고 보고한다.`,
    ]),
  },
  {
    id: 'vurmath1', weight: 6, cooldown: 99, once: true,
    when: (s) => s.week > 5 && s.links.length > 6,
    text: () => `회색의 부르마스가 철도에 관심을 보이고 있다. 그는 예고 없이 공사 현장에 나타나 석탄에 관해 열한 가지를 묻고 측량 도면 사본을 가지고 떠났다. 그는 협조를 제안했고, 교통청은 거절할 절차가 없으므로 수락하였다.`,
    chronicle: true,
  },
  {
    id: 'vurmath2', weight: 6, cooldown: 99, once: true, after: 'vurmath1',
    when: (s) => s.age >= 2 && s.smokeIndex > 8,
    text: () => `부르마스는 이제 스스로를 백색의 부르마스라 칭하며 제안서를 제출하였다. 자기 탑까지의 지선, 제련소 세 개 추가, 이사회 의석을 원한다. 지선은 주어졌다. 이사회는 평의회 소관이며, 평의회는 답하지 않고 있다.`,
    chronicle: true,
  },
  {
    id: 'elberic', weight: 4, cooldown: 16,
    when: (s) => s.week > 8,
    text: (s) => pick(s.rng, [
      `회색의 엘베릭이 승차권 없이 브래큰포드에서 아몬할까지 여행하였다. 문제 삼자 그는 승차권이 없다는 데 동의하고, 차장의 근면함을 칭찬한 뒤, 남은 여정 내내 계속 승차권이 없었다.`,
      `회색의 엘베릭이 ${pick(s.rng, ['하행', '상행'])} 승강장에서 동쪽을 바라보는 것이 목격되었다. 그는 무엇을 보고 있는지 말하기를 거절하였다. 교통청도 동쪽을 보았으나 아무것도 보이지 않았고, 이를 안심되는 일로 받아들이기로 하였다.`,
    ]),
  },
  {
    id: 'goblin_market', weight: 4, cooldown: 20, once: true,
    when: (s) => s.can.tunnel && s.links.some((L) => L.tunnels > 0),
    text: () => `무허가 시장이 터널 한가운데 자리 잡았다. 밤에 거래하고, 교통청이 아는 어떤 동전도 받지 않으며, 누군가에게 임대료를 내고 있다. 교통청은 여름 시각표 이후에 그 누군가를 밝혀내기로 결의하였다.`,
  },
  {
    id: 'barrow', weight: 4, cooldown: 12,
    when: (s) => s.links.some((L) => {
      const a = s.byId.get(L.a);
      return a && REGION_NAME[a.region] === '배로우 언덕';
    }),
    text: () => `배로우 언덕을 지나는 야간 열차가 다시 느리게 달리고 있다. 기관사들은 그 구간이 길이보다 오래 걸린다고 보고한다. 교통청이 구간을 재측량하였다. 구간은 늘 그래 온 길이다.`,
  },
  {
    id: 'congested', weight: 7, cooldown: 6,
    when: (s) => s.congestion.size > 2,
    text: (s) => {
      let worst = null, n = 0;
      for (const [id, c] of s.congestion) if (c > n) { n = c; worst = id; }
      const L = s.links.find((x) => x.id === worst);
      const a = L && s.byId.get(L.a), b = L && s.byId.get(L.b);
      if (!a || !b) return null;
      return `${a.name}에 화물이 선로 부족으로 정차해 있다. ${a.name}–${b.name} 구간은 실을 수 있는 모든 것을 싣고 있으며 더 싣기를 요구받고 있다. 운수과는 기관차 증차를 건의한다. 이전에도 이를 건의한 적 있는 부서의 어조로.`;
    },
  },
  {
    id: 'boom', weight: 6, cooldown: 8,
    when: (s) => s.sites.some((x) => x.tier >= 3 && x.connected),
    text: (s) => {
      const big = s.sites.filter((x) => x.tier >= 3 && !x.abandoned);
      if (!big.length) return null;
      const c = pick(s.rng, big);
      return `${c.name}이(가) 세 번째로 역을 넘어서 성장하였다. 교통청에는 더 큰 역을 위한 토지가 조건부로 제안되었는데, 확인해 보니 그 컨소시엄은 역장이었다.`;
    },
  },
  {
    id: 'cosmopolitan', weight: 6, cooldown: 11,
    when: (s) => {
      for (const st of s.sites) {
        if (!st.connected || st.abandoned) continue;
        const { dist } = s.pathsFrom(st.id);
        const cultures = new Set();
        for (const o of s.sites) if (dist.has(o.id) && !o.abandoned) cultures.add(o.culture);
        if (cultures.size >= 4) { s._cosmo = st; return true; }
      }
      return false;
    },
    text: (s) => {
      const st = s._cosmo;
      if (!st) return null;
      return `${st.name}에 네 민족이 백 야드 안에 사는 마을이 생겼다. 빵집이 세 곳 있고 어느 곳도 나머지를 인정하지 않으며, 종에 관한 분쟁은 평의회로 넘어갔다. 교역은 30퍼센트 증가하였다.`;
    },
  },
  {
    id: 'orc_commuters', weight: 8, cooldown: 9,
    when: (s) => s.concession && s.orcTradeTotal > 12,
    text: (s) => pick(s.rng, [
      `오크 여객이 이제 동부 노선을 다수 이용하고 있다. 그들은 돈을 내고, 침묵 속에 여행하며, 객차를 탈 때보다 깨끗하게 두고 내린다. 교통청은 그 반대보다 이쪽이 더 불안하다고 본다.`,
      `6시 40분 차의 오크 여객에 대한 민원이 접수되었다. 민원의 내용은 그들이 줄을 선다는 것이다. 교통청은 조치를 거절하였다.`,
      `운수과는 동행 화물이 다시 늘었고 수하인들이 시각표를 미리 달라고 하기 시작했다고 보고한다. 시각표는 보내 주었다. 보내 주지 않을 이유가 없었다. 교통청은 이후 이 점을 여러 차례 곱씹었다.`,
    ]),
  },
];

// Petitions: the player chooses, and the choice does something.
/**
 * The Age III decision, raised directly by the host rather than by maybePetition.
 *
 * It is assigned straight to `s.pendingPetition` from the simulation, because
 * maybePetition walks PETITIONS in array order and takes the first eligible entry —
 * and `plague_quarantine` is repeatable, so anything appended to the end can be
 * starved indefinitely. This is the most important decision in the game; it does not
 * queue behind a quarantine.
 *
 * Every answer costs something, and none of them is safe.
 */
export function hostPetition(s) {
  const H = s.host;
  const road = (H.road || []).map((id) => s.links.find((x) => x.id === id)).filter(Boolean);
  const fortifyCost = road.filter((L) => !L.fortified)
    .reduce((n, L) => n + s.worksPrice.fortify(L), 0);
  const heart = s.byId.get(H.heartId);
  return {
    id: 'the_host',
    title: '그들이 내려오고 있는 길은 우리의 길이다',
    from: '공사감독, 앉지도 않고 직접 옴',
    body: `그들이 ${H.fromName ?? '동쪽'} 길 위에 있다. 그리고 교통청의 화물 열차보다 `
      + `빠르게 오고 있다. 그것이 교통청 자신의 길이라는 이유에서다.\n\n`
      + `그들의 앞: ${road.length}개 구간, 그다음은 ${heart?.name ?? '왕국의 심장'}.\n\n`
      + '공사과는 청장이 결재하는 것 중 어느 것이든 실행할 것이며, 이 자리에서 '
      + '좋은 답은 없다고 말했다는 점을 기록해 두기를 바란다.',
    options: [
      {
        label: '선로를 요새화한다',
        note: `전 구간에 망루와 벽 쌓은 절개지. ${fortifyCost}크라운, 이후 유지비 별도.`,
        apply: (st) => {
          let paid = 0;
          for (const L of road) {
            if (L.fortified) continue;
            paid += st.worksPrice.fortify(L);
            L.fortified = true;
            L.peril *= 0.45;
            L.upkeep *= 1.2;
          }
          st.treasury -= paid;
          st.host.answer = 'fortify';
          st.note(`선로 전 구간의 요새화가 ${Math.round(paid)}크라운으로 진행되고 있다. `
            + '교통청에 없는 돈이며, 마련하기로 약정하였다.\n\n'
            + '공사는 다듬은 돌로 지어지고 있으며, 대군의 바로 앞에서, 대군이 움직이는 속도와 '
            + '거의 같은 속도로 올라가고 있다. 두 개 작업반이 교대를 요청했다. 어느 쪽도 허락되지 않았다.',
            'grave', { chronicle: true });
        },
      },
      {
        label: '대피를 위해 징발한다',
        note: '모든 열차가 서쪽으로, 사람으로 가득, 돈이 되는 것은 싣지 않는다.',
        apply: (st) => {
          st.host.answer = 'requisition';
          st.host.evacuating = true;
          for (const site of st.sites) {
            if (site.abandoned || !site.connected) continue;
            if (site.x > (st.byId.get(st.host.heartId)?.x ?? 0)) {
              site.fled = Math.min(1, (site.fled || 0) + 0.3);
            }
          }
          st.note('모든 열차가 징발되었다. 시각표는 정지되었다 — 개정이 아니라, '
            + '정지 — 그리고 그 단어는 교통청의 속기록에 처음으로 등장하였다.\n\n'
            + '열차들은 가득 채워 서쪽으로 가고 빈 채로 돌아온다. 곡물도, 철도, 운임도 '
            + '싣지 않는다. 교통청은 이번 주부터 기관차를 가진 자선단체다.', 'grave', { chronicle: true });
        },
      },
      {
        label: '그들의 뒤로 선로를 걷어 낸다',
        note: '당신이 지은 가장 위대한 것을, 걷어 낸다. 사라진 레일 위로는 행군할 수 없다.',
        apply: (st) => {
          st.host.answer = 'tearup';
          let lifted = 0;
          for (const L of road) {
            if (L.taken) continue;
            L.destroyed = true;
            lifted++;
          }
          st.markDirty();
          st.regard.men = Math.max(0, st.regard.men - 10);
          st.note(`${lifted}개 구간이 교통청 자신의 작업반에 의해 걷혔다. 서쪽 끝에서부터 `
            + '거슬러, 대군의 앞에서 작업하였다.\n\n'
            + '레일들은 노반 옆에 쌓여 있다. 공사감독은 마지막 1마일을 걸었으며, 본 것에 대한 '
            + '보고서를 제출하지 않았고, 제출하라는 요구도 받지 않았다.',
            'grave', { chronicle: true, big: true });
        },
      },
    ],
  };
}

const PETITIONS = [
  {
    id: 'wodenholt', once: true,
    when: (s) => s.week > 6 && s.links.length > 5,
    title: '오노드림 통행권 상임위원회',
    from: '워든홀트',
    body: `워든홀트에서 대표단이 공사 현장에 도착하였다. 도착하는 데 나흘이 걸렸는데, 교통청은 처음에 이를 무례로 여겼으나 이제는 다르게 이해한다.

그들은 숲은 내줄 수 없다는 점을 기록하기를 바란다. 숲을 우회하는 노선은 논의할 용의가 있다. 아주 길게 논의할 용의가 있다.`,
    options: [
      {
        label: '숲을 우회하는 노선으로 한다',
        note: '재측량에 180크라운이 든다. 엘프들이 듣게 될 것이다.',
        apply: (s) => {
          s.treasury -= 180;
          s.regard.elf += 9;
          s.woodCare = Math.min(0.9, s.woodCare + 0.15);
          s.note('선로는 워든홀트를 우회할 것이다. 재측량은 180크라운으로 계상되었고, 그 숲은 대표단의 요청에 따라, 그 자신의 이름으로, 전문으로, 실시 도면에 기입되었다.', 'good', { chronicle: true });
        },
      },
      {
        label: '측량된 대로 진행한다',
        note: '돈은 아낀다. 워든홀트는 기억이 길고, 느리다.',
        apply: (s) => {
          s.regard.elf -= 14;
          s._entAngry = true;
          s.note('교통청은 측량된 대로 진행하기로 하였다. 대표단에게 통달되었다. 회신이 없었으며, 이는 동의로 기록되었다.', 'bad', { chronicle: true });
        },
      },
    ],
  },
  {
    id: 'grain_levy', once: true,
    when: (s) => s.week > 9 && s.sites.some((x) => x.kind === 'shire' && x.tier >= 2),
    title: '그린할로우의 탄원',
    from: '하플링들',
    body: `마흔한 개의 서명, 그중 몇은 같은 서명이다. 그린할로우는 지적한다. 자기들의 곡물이 이제 한 번도 본 적 없는 산들을 먹이고 있으며, 가격은 아몬할에서 정해지고 있고, 운임의 공정한 몫을 나누는 것이 무리한 일은 아닐 것이라고.

그들은 제안의 비용을 산출해 왔다. 산출은 읽기 쉽고, 짜증 날 정도로, 정확하다.`,
    options: [
      {
        label: '환급을 허가한다',
        note: '운임에 상시 부담금이 생긴다. 하플링들은 기억할 것이다.',
        apply: (s) => {
          s.fareRebate = 0.12;
          s.regard.halfling += 16;
          s.note('환급이 허가되었다. 그린할로우 곡물 운임의 12분의 1, 철회될 때까지 유효하다. 감사의 뜻으로 통 하나가 사무실에 도착했다. 흑맥주, 아홉 갤런.', 'good', { chronicle: true });
        },
      },
      {
        label: '유감과 함께 거절한다',
        note: '수입은 지킨다. 그린할로우에 동요.',
        apply: (s) => {
          s.regard.halfling -= 15;
          for (const st of s.sites) if (st.culture === 'halfling') st.unrest = Math.min(1, st.unrest + 0.3);
          s.note('탄원은 유감과 함께 거절되었다. 유감은 한 장 반이며, 목요일에 서명되었고, 아침 열차로 그린할로우에 내려갔다.', 'bad', { chronicle: true });
        },
      },
    ],
  },
  {
    id: 'concession_offer', once: true,
    when: (s) => s.age >= 2 && !s.concession && s.week > 13,
    title: '동쪽으로부터의 접근',
    from: '동쪽의 당사자',
    body: `교통청에 서신 한 통이 도착하였다. 배달된 것이 아니다. 아침에, 청장의 책상 위에서, 발견되었다.

서신은 운임을 제안한다. 운임은 파격적이다 — 어떤 서쪽 화물이 벌어들이는 것의 네 배, 잿빛유리와 철로, 선불로. 나머지 조건은 문제가 없다. 교통청은 문제를 찾으려고 열한 번을 읽었다.

서명이 없다. 표记가 하나 있다.`,
    options: [
      {
        label: '특혜를 수락한다',
        note: '막대한 수입. 동쪽으로 가는 모든 상자가 그림자를 먹인다.',
        apply: (s) => {
          s.concession = true;
          s.treasury += 400;
          s.shadow += 6;
          s.regard.elf -= 10;
          s.note('특혜가 수락되었다. 선금이 입금되었다. 400크라운, 동부 수입 항목으로 기입되었다. 지난주에는 존재하지 않던 계정 과목이다.', 'grave', { chronicle: true });
        },
      },
      {
        label: '답하지 않고 돌려보낸다',
        note: '돈은 포기한다. 평의회가 이유를 물을 것이다.',
        apply: (s) => {
          s.regard.men -= 6;
          s.regard.elf += 12;
          s.shadow = Math.max(0, s.shadow - 4);
          s.note('서신은 답 없이 반송되었다. 누구에게 반송되었는지는 분명하지 않다. 책상 위에 더는 없다.', 'good', { chronicle: true });
        },
      },
    ],
  },
  {
    id: 'plague_quarantine',
    when: (s) => s.sites.some((x) => x.plague > 0.3 && x.connected),
    title: '공중 보건에 관한 건',
    from: '아몬할의 의사들',
    body: (s) => {
      const sick = s.sites.filter((x) => x.plague > 0.3 && x.connected);
      const n = sick[0];
      return `발한역이 ${n ? n.name : '간선의 한 역'}에 와 있다. 그리고 그것은 철도로 이동하고 있다. 이제 모든 것이 철도로 이동하기 때문이다.

의사들은 해당 역들의 폐쇄를 요청한다. 운수과는 폐쇄가 곡물을 발 묶이게 할 것이라 지적한다. 둘 다 옳으며, 이틀째 복도에서 다투고 있다.`;
    },
    options: [
      {
        label: '역들을 폐쇄한다',
        note: '확산을 멈춘다. 화물도 함께 멈춘다.',
        apply: (s) => {
          for (const st of s.sites) if (st.plague > 0.2) { st.quarantined = true; st.quarantineWeeks = 3; }
          s.regard.men += 5;
          s.note('해당 역들이 폐쇄되었다. 곡물은 브래큰포드의 차량 안에 서 있고, 교통청에는 매시각 서신이 오고 있다.', 'plain', { chronicle: true });
        },
      },
      {
        label: '선로를 열어 둔다',
        note: '화물은 계속 움직인다. 병도 마찬가지다.',
        apply: (s) => {
          for (const st of s.sites) if (st.plague > 0.15) st.plague += 0.25;
          s.regard.halfling -= 8;
          s.regard.men -= 4;
          s.note('선로는 열린 채로 둔다. 그 논거는 속기록에 기록되어 있다. 네 장에 이른다.', 'bad', { chronicle: true });
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------

export function createEvents() {
  let registry = null;
  /**
   * Context handed to every corpus entry. Everything is optional and every entry
   * guards for it, so a partially filled context is safe.
   */
  const ctxOf = (s, extra = {}) => {
    const regionsReached = new Set();
    const kindsReached = new Set();
    for (const L of s.links) for (const r of L.regions || []) regionsReached.add(r);
    for (const st of s.sites) if (st.connected && !st.abandoned) kindsReached.add(st.kind);
    return {
      week: s.week, age: s.age, rng: s.rng,
      regionsReached, kindsReached,
      ...extra,
    };
  };
  /** Corpus first; the built-in pool is the floor. */
  const fromCorpus = (s, pool, key, ctxExtra) => {
    if (!registry) registry = createRegistry(s.rng);
    const ctx = ctxOf(s, ctxExtra);
    return key ? registry.takeKeyed(pool, key, ctx) : registry.take(pool, ctx);
  };

  const fired = new Map();      // id -> week last fired
  const doneOnce = new Set();
  let lastFlavourWeek = -3;
  let errandIssued = false;
  // Settlements decline in clusters, and one report each reads as a stuck record.
  // Collect them and file a single entry.
  const declineQueue = [];
  const abandonQueue = [];

  function drainDeclines(s2) {
    if (declineQueue.length) {
      const names = declineQueue.splice(0, declineQueue.length);
      if (names.length === 1) {
        const { st, cause } = names[0];
        const c = fromCorpus(s2, 'DECLINED', null, {
          site: st, place: st.name, region: st.region, regionName: REGION_NAME[st.region],
        });
        s2.note(c ? c.text : `Population at ${st.name} continues to fall.${cause}`, 'bad',
          c ? { form: c.form, entryId: c.id } : {});
      } else {
        const list = names.slice(0, 4).map((x) => x.st.name).join(', ');
        const more = names.length > 4 ? ` and ${names.length - 4} more` : '';
        s2.note(
          `이번 주 보고서는 ${list}${more}의 감소하는 수치를 보인다.\n\n`
          + '운수과에 이 마을들의 공통점이 있는지 물었다. '
          + '운수과는 모두 같은 선로 위에 있다고 답하고, 방을 나갔다.',
          'bad',
        );
      }
    }
    if (abandonQueue.length) {
      const names = abandonQueue.splice(0, abandonQueue.length).map((x) => x.name);
      if (names.length === 1) {
        const c = fromCorpus(s2, 'ABANDONED', null, { place: names[0] });
        s2.note(c ? c.text : `${names[0]}은(는) 비었다. 마지막 가구가 도보로, 약속받았던 철도의 방향으로 떠났다.`,
          'bad', { chronicle: true });
      } else {
        s2.note(
          `이번 주 등록부에서 삭제됨: ${names.join(', ')}.\n\n`
          + '역명판들은 내려 보관되었다. 이름이 다시 필요해질 수도 있다는 판단에서다.',
          'bad', { chronicle: true },
        );
      }
    }
  }


  function canFire(s, e) {
    if (e.once && doneOnce.has(e.id)) return false;
    if (e.after && !doneOnce.has(e.after) && !fired.has(e.after)) return false;
    const last = fired.get(e.id);
    if (last !== undefined && s.week - last < (e.cooldown ?? 6)) return false;
    try { return !!e.when(s); } catch { return false; }
  }

  function fireFlavour(s) {
    // Two thirds of ambient reports come from the written corpus, which rotates
    // documentary forms; the rest from the state-driven pool below, which can
    // speak about specific conditions the corpus cannot know about.
    if (s.rng() < 0.78) {
      const c = fromCorpus(s, s.rng() < 0.42 ? 'REGIONAL' : 'AMBIENT', null, {});
      if (c) { s.note(c.text, c.tone, { form: c.form, entryId: c.id }); lastFlavourWeek = s.week; return; }
    }
    const pool = FLAVOUR.filter((e) => canFire(s, e));
    // NOTHING IN THIS POOL REPEATS. Preferring fresh entries was not enough: most
    // FLAVOUR entries are gated on world state that is usually false, so the ELIGIBLE
    // pool is only three or four items, exhausts in a month, and then recycles. That
    // is why `lost_property` still came round three times in thirty weeks with the
    // same frame and two nouns swapped — the single most machine-written thing in the
    // register, and the thing the player kept pointing at.
    //
    // When there is nothing new to say from here, say something from the corpus,
    // which holds 209 entries and draws without replacement.
    const fresh = pool.filter((e) => !fired.has(e.id));
    if (!fresh.length) {
      const c = fromCorpus(s, s.rng() < 0.42 ? 'REGIONAL' : 'AMBIENT', null, {});
      if (c) { s.note(c.text, c.tone, { form: c.form, entryId: c.id }); lastFlavourWeek = s.week; }
      return;
    }
    const use = fresh;
    let total = 0;
    for (const e of use) total += e.weight;
    let r = s.rng() * total;
    let chosen = use[0];
    for (const e of use) { r -= e.weight; if (r <= 0) { chosen = e; break; } }
    let text;
    try { text = chosen.text(s); } catch { text = null; }
    if (!text) return;
    fired.set(chosen.id, s.week);
    if (chosen.once) doneOnce.add(chosen.id);
    s.note(text, chosen.tone ?? 'wry', { chronicle: !!chosen.chronicle, entryId: chosen.id });
    lastFlavourWeek = s.week;
  }

  function maybePetition(s) {
    if (s.pendingPetition) return;
    for (const p of PETITIONS) {
      if (p.once && doneOnce.has(p.id)) continue;
      const last = fired.get(p.id);
      if (last !== undefined && s.week - last < 10) continue;
      let ok = false;
      try { ok = !!p.when(s); } catch { ok = false; }
      if (!ok) continue;
      fired.set(p.id, s.week);
      if (p.once) doneOnce.add(p.id);
      s.pendingPetition = {
        id: p.id,
        title: p.title,
        from: p.from,
        body: typeof p.body === 'function' ? p.body(s) : p.body,
        options: p.options,
      };
      s.audio?.('petition');
      return;
    }
  }


  // ── who wants what ─────────────────────────────────────────────────────
  //
  // Every commission is a sentence the player can act on: this cargo, to this
  // place, by this week, for this fee, or else. Trade was previously something
  // that happened to the player; this is trade addressed to them.

  const near = (s, site, pred, n = 1) => s.sites
    .filter((x) => !x.abandoned && x.id !== site.id && pred(x))
    .sort((a, b) => Math.hypot(a.x - site.x, a.z - site.z) - Math.hypot(b.x - site.x, b.z - site.z))
    .slice(0, n);

  /** A siege. The one commission you cannot decline without losing a place. */
  function offerSiege(s) {
    const cand = s.sites.filter((x) => !x.abandoned && x.connected
      && (x.kind === 'watch' || x.kind === 'burg') && x.x > -40);
    if (!cand.length) return false;
    const st = pick(s.rng, cand);
    const need = Math.round(6 + s.rng() * 7);
    const weeks = 4;
    s.comm.offer(s, {
      kind: 'siege', class: 'freight', client: '왕실',
      good: 'arms', need, to: st.id, weeks,
      fee: priceOf('arms', need, weeks, 1.5),
      urgent: true,
      title: `${st.name} 포위됨`,
      body: `밤사이 기병이 들이닥쳤다. ${st.name}이(가) 포위되었고 무기를 요청하고 있다. `
        + `철도로, 누군가 살아남아 들어갈 수 있는 다른 길이 없기 때문이다.\n\n`
        + `${weeks}주 이내에 무기 ${need}적재분. 왕실이 지급한다. `
        + `왕실은 또한 서면으로, 그것을 그곳에 보낼 다른 수단이 없음을 밝혔다.`,
      onDone: (s2, c) => {
        const site = s2.byId.get(c.to);
        s2.regard.men = Math.min(100, s2.regard.men + 14);
        s2.note(`${site?.name ?? '초소'}의 포위가 풀렸다. 무기는 농기구라고 적힌 방수포를 `
          + '덮은 일반 화차로 올라갔다. 수비대장은 그 방수포를 갖고 싶다고 요청했다.', 'good', { chronicle: true });
      },
      onFail: (s2, c) => {
        const site = s2.byId.get(c.to);
        if (site) { site.abandoned = true; s2.markDirty(); }
        s2.regard.men = Math.max(0, s2.regard.men - 20);
        s2.shadow = Math.min(100, s2.shadow + 6);
        s2.note(`${site?.name ?? '초소'}이(가) 함락되었다.\n\n`
          + '함락된 날 교통청의 조차장에 서 있던 무기의 정확한 수량을 교통청은 밝힐 수 있다. '
          + '교통청은 세는 기관이기 때문이다. 그 수치는 공표된 보고서에서 삭제되었다.', 'grave', { chronicle: true, big: true });
      },
    });
    return true;
  }

  /** Pilgrims, refugees, delegations: passage rather than freight. */
  function offerPassage(s) {
    const kindsOf = (k) => s.sites.filter((x) => !x.abandoned && x.connected && x.kind === k);
    const options = [];
    const quays = s.sites.find((x) => x.anchor === 'quays' && !x.abandoned);
    const havens = kindsOf('haven');
    if (quays && havens.length && !s.elvesGone) {
      const from = pick(s.rng, havens);
      if (from.id !== quays.id) options.push({
        kind: 'pilgrims', client: '항구', from: from.id, to: quays.id, weeks: 6,
        need: 26, label: '서쪽으로의 여정',
        title: '회색 부두로 가는 길',
        body: `${from.name}에서 일행이 회색 부두로 가는 여정을 청한다. 마흔한 명, `
          + '다른 누구에게도 맡기지 않을 짐과 함께.\n\n'
          + '돌아올 생각인지는 말하지 않았으며, 물은 서기가 사과하였다.',
      });
    }
    const burgs = kindsOf('burg');
    if (burgs.length >= 2) {
      const [a, b] = s.rng.shuffled(burgs).slice(0, 2);
      options.push({
        kind: 'fair', client: '변경의 백성', from: a.id, to: b.id, weeks: 4,
        need: 20, label: '임시 여객 수송',
        title: `${b.name}의 장`,
        body: `${b.name}이(가) 한 달 뒤 장을 열며 변경 지대의 절반이 올 것으로 예상한다. `
          + `${a.name}은(는) 열차를, 아니면 여러 열차를 원한다.\n\n`
          + '운수과는 지난번 교통청이 임시 열차를 운행했을 때 회송이 네 시간 늦었으나 아무도 '
          + '개의치 않았음을 밝히며, 이를 계획에 반영하지 않기로 하였다.',
      });
    }
    const delves = kindsOf('delve');
    if (delves.length && burgs.length) {
      const from = pick(s.rng, delves), to = pick(s.rng, burgs);
      options.push({
        kind: 'delegation', client: '카자드림', from: from.id, to: to.id, weeks: 5,
        need: 14, label: '대표단',
        title: '대표단, 위풍당당한 여행',
        body: `스란 아이언무트가 궤간을 놓고 논쟁하러 ${to.name}에 간다. 도로로는 가지 않겠다고 한다.\n\n`
          + '그는 객차 한 량, 서류를 위한 두 번째 객차, 그리고 열차가 늦지 않을 것이라는 보증을 '
          + '요구한다. 그중 둘은 제공할 수 있다.',
      });
    }
    if (!options.length) return false;
    const o = pick(s.rng, options);
    s.comm.offer(s, {
      class: 'people', good: null,
      fee: Math.round(o.need * 13 + 120),
      ...o,
    });
    return true;
  }

  /** A plague wants athelas, which only the Elves grow. */
  function offerPhysic(s) {
    const sick = s.sites.filter((x) => !x.abandoned && x.connected && x.plague > 0.25);
    if (!sick.length || s.elvesGone) return false;
    const st = pick(s.rng, sick);
    const need = 4;
    s.comm.offer(s, {
      kind: 'physic', class: 'freight', client: '아몬할의 의사들',
      good: 'athelas', need, to: st.id, weeks: 4,
      fee: priceOf('athelas', need, 4, 1.4),
      urgent: true,
      title: `${st.name}에 아셀라스를`,
      body: `의사들이 ${st.name}에 아셀라스를 원한다. 아셀라스는 이 대륙에서 한 곳에서만 `
        + '자라며, 서두르지 않는 이들이 채집한다.\n\n'
        + '네 적재분. 의사들은 대안, 즉 격리의 비용을 산출하여 첨부하였다. 교통청이 '
        + '즐겁게 읽은 문서는 아니었다.',
      onDone: (s2, c) => {
        const site = s2.byId.get(c.to);
        if (site) { site.plague = 0; site.quarantined = false; s2.markDirty(); }
        s2.regard.halfling = Math.min(100, s2.regard.halfling + 6);
        s2.regard.elf = Math.min(100, s2.regard.elf + 8);
        s2.note(`${site?.name ?? '그 역'}의 병이 물러났다. 의사들은 엘프들에게 감사하였다. `
          + '엘프들은 숲에 대해서는 감사받지 않았다고 회신하였다.', 'good');
      },
      onFail: (s2, c) => {
        const site = s2.byId.get(c.to);
        if (site) { site.plague = Math.min(1, site.plague + 0.3); site.unrest = 1; }
        s2.regard.halfling = Math.max(0, s2.regard.halfling - 10);
      },
    });
    return true;
  }

  /** The Dwarves want coal before a forge goes cold; the Council wants mithril. */
  function offerTrade(s) {
    const opts = [];
    const delves = s.sites.filter((x) => !x.abandoned && x.connected && x.kind === 'delve');
    const burgs = s.sites.filter((x) => !x.abandoned && x.connected && x.kind === 'burg');
    if (delves.length) {
      const st = pick(s.rng, delves);
      const need = 10 + Math.round(s.rng() * 8);
      opts.push({
        kind: 'forge', client: '카자드림', good: 'grain', need, to: st.id, weeks: 5,
        fee: priceOf('grain', need, 5, 1.25),
        title: `${st.name}의 빵 부족`,
        body: `${st.name}에는 철과 석탄과 돌이 있고 먹을 것은 전혀 없다. 이것이 광산의 `
          + '통상적 상태이며, 일 년에 두 번 정도 비상 사태가 된다.\n\n'
          + `곡물 ${need}적재분. 그들은 직접 주조한 동전으로 선불하겠다고 제안했고, 평의회는 `
          + '동전의 얼굴에 관해 논의한 끝에 받기로 하였다.',
      });
    }
    if (burgs.length) {
      const st = pick(s.rng, burgs);
      const need = 2;
      opts.push({
        kind: 'mithril', client: '평의회', good: 'mithril', need, to: st.id, weeks: 8,
        fee: priceOf('mithril', need, 8, 1.1),
        title: '일정량의 미스릴, 왕실용',
        body: `평의회는 미스릴 두 적재분을 ${st.name}에 납품하기를 요구한다. 용도는 밝히지 않았다.\n\n`
          + '미스릴은 그것이 닿을 만큼 깊은 갱을 가진 광산에서만, 일정 짜기에 곤란하다고 '
          + '표현하는 것이 가장 적절한 양만큼 나온다. 운임은 이를 반영한다. 이 운임은 교통청 '
          + '역사상 가장 큰 단일 수치다.',
      });
    }
    if (burgs.length && s.sites.some((x) => x.kind === 'shire' && x.connected)) {
      const st = pick(s.rng, burgs);
      const need = 8;
      opts.push({
        kind: 'wedding', client: st.name + ' 가문', good: 'wine', need, to: st.id, weeks: 3,
        fee: priceOf('wine', need, 3, 1.3),
        title: `${st.name}의 혼례`,
        body: `${st.name}에 혼례가 있으며 변경 지대에는 그것을 치를 만한 술이 부족하다.\n\n`
          + '3주 이내에 여덟 적재분. 날짜는 옮길 수 없음을 이해해 주기를 교통청에 바란다. '
          + '교통청은 이해한다. 교통청도 혼인해 보았다.',
      });
    }
    if (!opts.length) return false;
    const o = pick(s.rng, opts);
    s.comm.offer(s, { class: 'freight', ...o });
    return true;
  }

  // ---- the Errand ------------------------------------------------------

  function issueErrand(s) {
    // The origin must be somewhere a train can collect it. This used to take the
    // westernmost halfling settlement by pure geography, which is routinely a remote
    // hamlet with no railway — so even after the player drove a road all the way to
    // Mount Wrack, `hopsTo(origin, destination)` returned null and the consignment sat
    // in a drawer for ever. Measured: first_wrack fired, five links reached the orcs,
    // and the errand still read "waiting, progress 0.00".
    const halflings = s.sites.filter((x) => !x.abandoned && x.culture === 'halfling');
    const west = halflings.filter((x) => x.connected).sort((a, b) => a.x - b.x)[0]
      || halflings.sort((a, b) => a.x - b.x)[0];
    const wrack = s.sites.find((x) => x.anchor === 'wrack')
      || s.sites.filter((x) => x.culture === 'orc').sort((a, b) => b.x - a.x)[0];
    if (!west || !wrack) return;
    s.errand = { from: west.id, to: wrack.id, state: 'waiting', at: west.id, progress: 0, weeks: 0 };
    errandIssued = true;
    // The errand is the game's only good ending and it was UNDISCHARGEABLE: measured
    // over five seeds it sat at 'waiting', progress 0.00, for ever, because it needs a
    // route to Mount Wrack and the eastern crossing costs ~1,100 crowns against a net
    // income near 110 a week in a game that ends around week 35. The player was handed
    // the most important task in the world on a chronicle plate and then quietly
    // prevented from doing it.
    //
    // So it comes with the money. Somebody wants this delivered badly enough to pay
    // for the road, which is both the obvious solution and the better story — and it
    // unblocks five threads at once (first_east, Mount Wrack, the orc trade, the
    // concession, and half the lands on the map).
    // Size the advance against what the road ACTUALLY costs on this map rather than a
    // constant: measured, the link from the nearest reachable settlement to the
    // easternmost hold alone prices at ~1,800 crowns, so a flat 900 still left the
    // errand impossible. Ask the surveyors, cover most of it, and leave the player to
    // find the rest — it should be a campaign, not a gift.
    let road = 0;
    const reachable = s.sites.filter((x) => x.connected && !x.abandoned);
    if (reachable.length) {
      const near = reachable.reduce((best, x) =>
        // .z, not .y — sites lie in the X/Z plane and .y is HEIGHT. The same axis
        // bug that broke seven harnesses had also reached here, so the advance was
        // sized from the survey of whatever settlement won a nonsense comparison.
        (Math.hypot(x.x - wrack.x, x.z - wrack.z) < Math.hypot(best.x - wrack.x, best.z - wrack.z) ? x : best));
      const probe = s.survey(near.id, wrack.id);
      if (probe && probe.ok) road = probe.price;
    }
    const advance = Math.round(Math.max(1200, road * 0.82) + 40 * s.connectedCount());
    s.treasury += advance;
    s.errandAdvance = advance;
    s.note(
      `교통청에 하물 한 건이 접수되었다. 물품 하나, 작고, 손으로 운반되는 것. `
      + `발송지 ${west.name}. 도착지 랙 산. 접수증에는 평의회와 항구와, 서기가 알아보지 못한 인장의 제3자가 부서되어 있는데, 서기는 묻지 말라는 지시를 받았다.\n\n`
      + `전표에는 명시되어 있다. 무게를 재지 말 것, 열지 말 것, 승강장에 세워 두지 말 것. `
      + `“가액” 란에 발송인은 “없음”이라고 적었다.\n\n`
      + `전표에 설명도 조건도 없이 동봉된 것은 금고로부터의 ${advance}크라운 어음이다. `
      + `서기관은 이것이 대략 랙 산까지 철도를 놓는 비용이라는 점, 그리고 아무도 그렇다고 `
      + `말하지 않았다는 점을 지적한다.`,
      // the errand plate was engraved at the start of the project and never attached
      'grave', { chronicle: true, big: true, plate: 'errand' },
    );
  }

  function stepErrand(s, dtWeeks) {
    const e = s.errand;
    if (!e || e.state === 'done' || e.state === 'lost') return;
    // The origin is chosen when the errand is issued, and at that point there may be
    // no connected halfling settlement at all — so `at` froze on a village with no
    // railway and the consignment could never be picked up, however much track the
    // player laid afterwards. A parcel can go to the railhead by cart; let it.
    const goal = s.byId.get(e.to);
    if (e.state === 'waiting') {
      const here = s.byId.get(e.at);
      if (!here || !here.connected) {
        const railhead = s.sites
          .filter((x) => x.connected && !x.abandoned)
          .sort((a, b) => (here ? Math.hypot(a.x - here.x, a.z - here.z) - Math.hypot(b.x - here.x, b.z - here.z) : 0))[0];
        if (railhead && railhead.id !== e.at) {
          e.at = railhead.id;
          if (!e.moved) {
            e.moved = true;
            s.note(`하물이 수레로 ${railhead.name}(으)로 옮겨졌다. 교통청이 실제로 닿는 `
              + `가장 가까운 곳이다. 마부는 그것이 무엇인지 듣지 못했고 묻지도 않았는데, `
              + `서기관은 이것이 이 건으로 누군가가 한 첫 번째 분별 있는 행동이라고 적는다.`, 'plain');
          }
        }
      }

      // THE ROAD WAS BUILT AND THEN TAKEN. This happens more than you would think:
      // the raids of Age III choose the most exposed eastern section, and the road to
      // Mount Wrack is by definition the most exposed section there is. So a player
      // drives the line all the way east, the register says it arrived, and the parcel
      // still cannot go — and until now nothing said why. That is the best story in
      // the game going untold.
      if (goal && s.firsts?.first_wrack && !goal.connected && !e.saidCut) {
        e.saidCut = true;
        s.note(`${goal.name}으로 가는 선로는 ${s.firsts.first_wrack}주에 개통되었고, `
          + `더 이상 열려 있지 않다.\n\n`
          + '하물은 교통청이 아직 지키고 있는 마지막 역으로 되돌려 보내졌다. 열리지 않았다. '
          + '서기관은 공사과에 선로 복구 기일을 물었고, 공사과는 서기관에게 현재 다른 모든 '
          + '것을 재건하고 있는 작업반들의 대여를 요청하였다.',
          'bad', { chronicle: true, big: true });
      }

      // IT GOES AS FAR AS THE RAILWAY GOES.
      //
      // Before this the errand was all-or-nothing: no continuous road to Mount Wrack
      // meant the consignment sat in a drawer for the whole game at progress 0.00,
      // and the player got two nag letters and no sense of getting anywhere. But a
      // parcel can be carried to the end of the line and wait there. So it advances
      // to the furthest railhead toward the destination and reports the CLOSING GAP,
      // which turns a locked door into a distance that visibly shrinks.
      if (goal && here) {
        // The cart may carry it to a railhead ON THE AUTHORITY'S MAIN SYSTEM, and no
        // further. Allowing any connected station let it be carted to the destination's
        // own doorstep the moment a single stub of track touched Mount Wrack, so the
        // errand completed around week 12 — before Age III, which is the climax it is
        // supposed to run into. The railway has to do the carrying; that is the game.
        const comp = (id) => {
          const out = [id];
          for (const x of s.sites) {
            if (x.id === id || !x.connected || x.abandoned) continue;
            if (s.hopsTo(id, x.id)) out.push(x.id);
          }
          return out;
        };
        let main = [];
        for (const x of s.sites) {
          if (!x.connected || x.abandoned) continue;
          if (main.includes(x.id)) continue;
          const c = comp(x.id);
          if (c.length > main.length) main = c;
        }
        const mainSet = new Set(main);
        const reach = s.sites.filter((x) => x.connected && !x.abandoned
          && mainSet.has(x.id) && x.id !== e.to);
        const far = reach.reduce((m, x) => {
          const d = Math.hypot(x.x - goal.x, x.z - goal.z);
          return (!m || d < m.d) ? { site: x, d } : m;
        }, null);
        if (far && far.site.id !== e.at) {
          e.at = far.site.id;
          const miles = Math.round(far.d);
          // Only when the gap has genuinely closed, and never once it has closed
          // entirely: "0 miles, and no rail on any of it" is nonsense, and the parcel
          // is about to go the rest of the way by rail regardless.
          if (miles > 8 && (e.lastGap === undefined || miles < e.lastGap - 20)) {
            e.lastGap = miles;
            // Count the initials for real. A fixed "four times" is the template tic in
            // miniature: a number that looks like bookkeeping and is decoration.
            e.initials = (e.initials || 3) + 1;
            const nth = e.initials === 4 ? '네 번째'
              : e.initials === 5 ? '다섯 번째'
              : e.initials === 6 ? '여섯 번째' : `${e.initials}번째`;
            s.note(`하물이 ${far.site.name}(으)로 보내졌다. 교통청의 레일이 닿는 `
              + `최종점이다.\n\n`
              + `차막이에서 ${goal.name}까지: ${miles}마일, 그 어느 곳에도 레일은 없다. `
              + `전표에는 새 날짜가 적히고 ${nth}로 서명이 추가되었다.`,
              'plain', { chronicle: true });
          }
        } else if (far && e.lastGap === undefined) {
          e.lastGap = Math.round(far.d);
        }
      }
    }
    const h = s.hopsTo(e.at, e.to);
    if (!h) {
      e.weeks += dtWeeks;
      e.state = 'waiting';
      // Say WHAT IS MISSING. The old nags were atmosphere — "awaiting a route east" —
      // while the actual obstacle was usually that the railway was in two disconnected
      // pieces with both ends of the errand sitting on rails that never meet. A player
      // cannot act on mood; they can act on the name of a gap.
      const here = s.byId.get(e.at), goal = s.byId.get(e.to);
      const why = !goal || !goal.connected
        ? `${goal ? goal.name : '목적지'}에는 레일이 전혀 닿지 않는다`
        : !here || !here.connected
          ? `하물이 서 있는 ${here ? here.name : '그곳'}에는 아무것도 닿지 않는다`
          : `선로가 잇기지 않았다: ${here.name}에도 선로가 있고 ${goal.name}에도 선로가 있으나, `
            + `둘을 잇는 레일이 없다`;
      if (e.weeks > 2 && !e.nagged1) {
        e.nagged1 = true;
        s.note(`평의회가 하물의 소재를 문의하였다. 하물은 ${here ? here.name : '선로 종점'}의 `
          + `잠긴 서랍 안에 있다. 교통청은 노선이 추진 중이라고 회답하였다.\n\n`
          + `노선은 추진 중이 아니다: ${why}.`, 'bad');
      } else if (e.weeks > 5 && !e.nagged2) {
        e.nagged2 = true;
        s.note(`평의회가 다시 문의하였다. 문의의 어조가 달라졌다. 하물은 여전히 서랍 안에 있고, `
          + `서랍에는 이제 경계가 붙어 있다. 누구도 명하지 않은 일이다.\n\n`
          + `장애는 변함이 없다: ${why}.`, 'bad');
      }
      return;
    }
    e.state = 'moving';
    // total remaining distance
    let len = 0;
    for (const id of h.hops) { const L = s.links.find((x) => x.id === id); if (L) len += L.length; }
    const perWeek = 30 * s.stock.speed * WEEK;
    // Clamped: unclamped this reported "progress 385.71" on a short final hop, which
    // is a fraction of a journey reading as 38,571 per cent of it.
    e.progress = Math.min(1.05, e.progress + (perWeek / Math.max(1, len)) * dtWeeks);
    if (e.progress >= 1) {
      e.state = 'done';
      s.over = 'errand';
      return;
    }
    // riding a perilous line is how the errand is lost
    const first = s.links.find((x) => x.id === h.hops[h.hops.length - 1]);
    if (first && s.rng.chance(first.peril * 0.010 * dtWeeks * 7)) {
      e.state = 'lost';
      s.over = 'lost_errand';
    }
  }

  // ---- the API the sim calls ------------------------------------------

  return {
    // The sim raises the Age III decision itself, so it needs a way to build it.
    hostPetition,
    on(s, kind, data) {
      switch (kind) {
        case 'built': {
          const a = s.byId.get(data.link.a), b = s.byId.get(data.link.b);
          if (!a || !b) break;
          if (data.survey.tunnels > 0) {
            s.note(pick(s.rng, TUNNEL_LINES)((REGION_NAME[a.region] ?? '산지').replace(/^the /, '')), 'good');
          } else {
          {
            const c = fromCorpus(s, 'OPENED', null, {
              site: a, siteB: b, place: a.name, placeB: b.name,
              region: a.region, regionName: REGION_NAME[a.region], culture: a.culture,
            });
            s.note(c ? c.text : pick(s.rng, BUILT_LINES)(a.name, b.name), c ? c.tone : 'plain',
              c ? { form: c.form, entryId: c.id } : {});
          }
          }
          break;
        }
        case 'commission_offered':
          s.note(`${data.commission.title}. 의뢰인: ${data.commission.client}.`,
            data.commission.urgent ? 'bad' : 'plain');
          s.audio?.('petition');
          break;
        case 'commission_done':
          s.note(`의뢰 완수: ${data.commission.title}. `
            + `${Math.round(data.commission.fee)}크라운을 수령하였다.`, 'good');
          s.audio?.('coin');
          break;
        case 'commission_failed':
          s.note(`의뢰 미완수: ${data.commission.title}. `
            + '교통청은 사유를 장부에 기입하였으며 장부는 납득하지 못하고 '
            + '있다.', 'bad');
          break;

        case 'works': {
          const L = data.link, st = data.site;
          const a = L ? s.byId.get(L.a) : null, b = L ? s.byId.get(L.b) : null;
          const where = a && b ? `${a.name}–${b.name}` : (st?.name ?? '공사 현장');
          if (data.kind === 'double') {
            s.note(`복선 부설, ${where}. 굴착단은 요청받은 것을 기뻐하며 `
              + '기록될 만한 길이로 그렇게 말하였다.', 'good');
            s.audio?.('build_works');
          } else if (data.kind === 'regrade') {
            s.note(`${where} 구간의 구배가 완화되었다. 아홉 체인이 이제 `
              + '수평이 되었다. 이전에는 수평이 아니었다.', 'good');
          } else if (data.kind === 'fortify') {
            s.note(`${where} 구간에 망루가 서고 절개지에 벽이 쌓였다. `
              + '파수꾼들이 이사 와서 커튼을 걸었다.', 'good');
          } else if (data.kind === 'station') {
            s.note(`${where} 역 공사. 두 번째 승강장, 지붕, 그리고 그저 서 있지 않고 `
              + '기다릴 수 있는 방.', 'good');
          }
          break;
        }

        case 'founded': {
          const st = data.site;
          const lore = REGION_LORE[st.region];
          const c = fromCorpus(s, 'FOUNDED', null, {
            site: st, place: st.name, region: st.region, regionName: lore?.name,
            culture: st.culture,
          });
          const FOUNDED = [
            () => `${st.name}에 작년에는 없던 곳이 생겼다.\n\n`
              + '누구도 허가하지 않았고, 측량하지 않았으며, 평의회에 알리지도 않았다. 그곳에는 '
              + '열한 개의 지붕과 우물 하나와, 교통청이 짓지 않은 역의 역장이라고 주장하는 '
              + '사내가 있다.',
            () => `${st.name}, ${lore ? lore.name : '황야'}. 건립됨, 사람이 살고 있다는 의미에서.\n\n`
              + '교통청은 이의를 제기하며 등록부에 추가하였다. 이의는 교통청 자신의 것이며, '
              + '근거는 지난 네 곳도 이렇게 생겨났다는 것이다.',
            () => `${st.name}에서 간이역과 역명판과 시각표상의 이름을 요청하는 신청서가 접수되었다.\n\n`
              + '신청서는 우리 석탄의 운송장 뒷면에 쓰여 있다. 그들은 철도가 올 것인지를 '
              + '묻지 않는다. 언제 오는지를 묻는다.',
            () => `신규 등록: ${st.name}. 등록 사유: 거기 있다.`,
          ];
          s.note(c ? c.text : FOUNDED[Math.floor(s.rng() * FOUNDED.length)](), 'good',
            c ? { form: c.form, entryId: c.id } : {});
          break;
        }

        case 'grew': {
          const st = data.site;
          const base = pick(s.rng, GREW_LINES)(st.name, TIER_NAME[st.tier]);
          // say what did it. An unattributed event is indistinguishable from noise.
          const top = Object.entries(KINDS[st.kind].need || {})
            .map(([g]) => ({ g, got: st.got[g] || 0 }))
            .sort((a, b) => b.got - a.got)[0];
          const cause = top && top.got > 0.4
            ? ` ${GOODS[top.g].name}이(가) 들어오고 있다.`
            : ' 철도가, 상당한 분량으로, 철도 자신의 공으로 돌리고 있다.';
          {
            const c = fromCorpus(s, 'GREW', null, {
              site: st, place: st.name, region: st.region,
              regionName: REGION_NAME[st.region], culture: st.culture,
              n: TIER_NAME[st.tier],
            });
            s.note(c ? c.text : base + cause, c ? c.tone : 'good',
              c ? { form: c.form, entryId: c.id } : {});
          }
          break;
        }
        case 'shrank': {
          const st = data.site;
          const worst = (s.needsOf(st) || []).find((n) => n.why);
          const cause = worst
            ? ` ${GOODS[worst.good].name}이(가) 부족하다: ${worst.why}.`
            : ' 한동안 아무것도 도착하지 않았다.';
          declineQueue.push({ st, cause });
          break;
        }
        case 'abandoned':
          // queued and filed once a week; see drainDeclines
          abandonQueue.push({ name: data.site.name, site: data.site });
          break;
        case 'charter': {
          // The charter plate, on the first grant only — the same engraving on all
          // sixteen charters would be wallpaper rather than an occasion.
          const firstCharter = !s._charterPlateShown;
          s._charterPlateShown = true;
          s.note(`칙허 수여: ${data.charter.name}. ${data.charter.note ?? ''}`.trim(), 'good',
            firstCharter ? { chronicle: true, plate: 'charter' } : { chronicle: true });
          break;
        }
        case 'insolvent':
          if (data.weeks === 1) s.note('교통청이 당좌 초과 상태다. 평의회는 평의회 자신의 감사관들에 의해 이를 알게 되었다. 평의회가 무엇인가를 알게 되는 방법 중 가장 나쁜 방법이다.', 'bad');
          else if (data.weeks >= 4 && !s.over) { s.over = 'dismissed'; }
          else s.note(`${['', '첫', '두', '세', '네'][Math.min(4, data.weeks)]} 번째 주 연속 당좌 초과. 서기관이 회의에서 "긴축"이라는 단어를 쓰기 시작했다.`, 'bad');
          break;
        case 'incident': {
          const L = data.link;
          const a = s.byId.get(L.a);
          // bare, because every template supplies its own article
          const rn = (a ? (REGION_NAME[a.region] ?? '황야') : '황야').replace(/^the /, '');
          const roll = s.rng();
          const incKind = roll < 0.68 ? 'block' : roll < 0.90 ? 'beast' : 'wrath';
          const incC = fromCorpus(s, 'INCIDENTS', incKind, {
            region: a?.region, regionName: rn, place: a?.name, site: a,
          });
          if (roll < 0.68) {
            L.closed = 5 + s.rng() * 9;
            s.markDirty();
            s.note(incC ? incC.text : pick(s.rng, INCIDENT_BLOCK)(rn), 'bad');
            s.audio?.('incident');
          } else if (roll < 0.90) {
            L.closed = 3 + s.rng() * 5;
            s.markDirty();
            s.treasury -= 26;
            s.note(incC ? incC.text : pick(s.rng, INCIDENT_BEAST)(rn), 'bad');
            s.audio?.('dragon');
          } else {
            L.destroyed = true;
            s.markDirty();
            s.note(incC ? incC.text : pick(s.rng, INCIDENT_WRATH)(rn), 'grave', { chronicle: true });
            s.audio?.('collapse');
          }
          break;
        }
        case 'host': {
          // AGE III, THE MUSTER — everything DESIGN.md has promised since the start
          // and none of which existed. Written flat: this is the Authority's own
          // paperwork about the end of its world, and paperwork does not raise its
          // voice.
          if (data.stage === 2 && !data.link) {
            s.note('운수과는 동부 간이역들이 주간 보고서 보내기를 멈췄다고 보고한다. 늦은 것이 아니다. 멈췄다.\n\n'
              + '교통청은 각 역에 서신을 보냈다. 서신들은 돌아오지 않았다. 서기관은 그것이 회답받은 것과는 다르다고 지적한다.',
              'grave', { chronicle: true });
          } else if (data.stage === 2 && data.link) {
            s.note(data.held
              ? `${data.where}의 선로가 밤중에 공격받았으나 지켜졌다. 망루는 흉터투성이로 서 있고, 작업반은 전원 확인되었으며, 선로는 이번 주 안에 다시 열릴 것이다.\n\n`
                + '공사감독은 망루의 비용을 이번 주 보고서 옆에 다시, 더 큰 글씨로, 기입해 달라 요청하였다.'
              : `${data.where}의 선로가 사라졌다. 막힌 것이 아니라 — 사라졌다: 레일은 걷히고, 침목은 불탔으며, 성토는 네 곳이 뜯겼다.\n\n`
                + '복구할 수는 있다. 처음 들었던 비용, 그리고 그보다 다소 더 들 것이다.',
              'bad', { chronicle: true });
          } else if (data.stage === 3) {
            s.note('서행 열차는 가득 찼고 동행 열차는 비어 있으며, 교통청이 인쇄하는 어떤 시각표도 이번 달에는 그것을 바꾸지 못한다.\n\n'
              + '사람들이 들 수 있는 것을 들고 선로를 따라 서쪽으로 오고 있다. 역장들은 승차권을 요구하기를 그만두었다. 그만두라 지시한 이도, 다시 시작하라 지시한 이도 없다.',
              'grave', { chronicle: true, big: true });
          } else if (data.stage === 4) {
            s.note(`대군이 동쪽에서 나와 교통청 자신의 길 위를, ${data.from}에서 ${data.to}(으)로 이동하고 있다.\n\n`
              + '측량관에게 어느 속도인지 물었다. 그는 그들이 선로의 속도로 움직이고 있다고 답했다 — 교통청이 놓고, 완화하고, 복선으로 만든 — 그리고 기일을 서면으로 적고 싶지는 않다고 덧붙였다.',
              'grave', { chronicle: true, big: true, plate: 'age3' });
            s.audio?.('doom');
          }
          break;
        }
        case 'age':
          if (data.age === 2) {
            s.note('교통청은 확대된 권한과 더 작은 청사로 재편되었다. 수송량이 늘었다. 모든 것이 늘었다. 평의회가 “시대”라는 단어를 대문자로 쓰기 시작했는데, 속기록에서 좋은 징조인 적은 없다.', 'plain', { chronicle: true, big: true });
          } else if (data.age === 3) {
            s.note(
              '전 역장에게 회람 한 통이 돌려졌다. 한 장이다. 동부 열차가 시각표상 정차할 곳에서 정차하지 않을 경우의 대처에 관한 것이다.\n\n'
              + '무엇을 하라고는 적혀 있지 않다. 누구에게 알리라고 적혀 있다.',
              // The `age3` plate was drawn and then never attached to anything, so the
              // single most important moment in the game arrived without its picture.
              'grave', { chronicle: true, big: true, plate: 'age3' },
            );
            s.audio?.('doom');
          }
          break;
        case 'elves_unease':
          // Names the cause, because a warning you cannot act on is only a mood. The
          // player can slow the felling, run fewer smoking works, or simply go and
          // serve a haven — all of which lift elf regard.
          s.note(data.why === 'smoke'
            ? '항구에서 온 서신. 평소의 그들의 서신보다 짧다.\n\n'
              + `“당신들 공사의 연기를 세어 보니 ${data.smoke}이었다. 멈추라고 요구하지는 `
              + '않는다. 우리가 무엇을 세고 있는지, 그리고 그 세는 것이 무엇을 위한 것인지를 '
              + '우리끼리 논의하기 시작했다는 사실을 알리는 것이다.”\n\n'
              + '서기관은 항구가 숫자를 언급한 것이 처음이라고 적는다.'
            : '항구에서 온 서신. 시각표에 관한 것으로, 장황하며, 교통청이 짓지 않은 '
              + '다리 하나의 상태에 관한 것이기도 하다.\n\n'
              + '마지막 문단은 이번 분기 교통청의 열차가 어느 항구에도 들르지 않았음을, '
              + '엘프들은 기대하지도 않았음을, 그리고 어딘가에 기록으로 남기 위해서만 이를 '
              + '언급한다고 적고 있다.',
            'bad', { chronicle: true });
          break;
        case 'elves_warn':
          s.note('항구가 통고를 보내 왔다. 불만의 통고가 아니다 — 떠남의 통고다. 회색 부두의 배들에 식량이 실리고 있음을 유의하고, 스스로 결론을 도출하기를 교통청은 요청받았다. 교통청은 도출하였다.', 'grave', { chronicle: true });
          break;
        case 'elves_depart':
          s.note(
            '엘프들이 회색 부두를 떠났다. 새벽에, 의식 없이 떠났고, 등불들을 가져갔다.\n\n'
            + '항구들은 비어 있으나 정돈된 채 서 있다. 부서진 것도 없고 남겨진 것도 없다. 다만 로린델에, 펀칭되지 않은 승차권 한 장, 교통청이 운행하지 않으며 어떤 시각표에서도 찾을 수 없는 여정의 것.\n\n'
            + '지식은 운송 품목표에서 삭제되었다. 더 이상 실어 올 곳이 없다.',
            'grave', { chronicle: true, big: true },
          );
          s.audio?.('depart');
          break;
        case 'crossing': {
          const c = fromCorpus(s, 'CROSSING', data.id, {
            site: data.a, siteB: data.b, place: data.a?.name, placeB: data.b?.name,
            region: data.a?.region, regionName: REGION_NAME[data.a?.region],
          });
          const fn = c ? () => c.text : CROSSING_FALLBACK[data.id];
          if (fn) {
            const grave = data.id === 'first_wrack' || data.id === 'first_east';
            s.note(fn(s, data), grave ? 'grave' : 'good',
              { chronicle: true, big: true, plate: data.id });
          }
          if (data.id === 'first_wrack') { s.shadow += 5; s.regard.orc += 12; s.audio?.('doom'); }
          if (data.id === 'first_bore') { s.regard.dwarf += 8; s.audio?.('build_works'); }
          if (data.id === 'first_quays') s.regard.elf += 6;
          break;
        }
        case 'deep_bore': {
          const bc = fromCorpus(s, 'CROSSING', 'deep_bore_' + data.stage, {
            n: data.depth, place: s.byId.get(data.link?.a)?.name,
          });
          const txt = bc ? bc.text : DEEP_BORE[data.stage];
          if (!txt) break;
          if (data.stage === 1) s.bore1Week = s.week;
          if (data.stage === 2) s.bore2Week = s.week;
          s.note(txt, 'grave', {
            chronicle: true, big: true,
            plate: data.stage === 3 ? 'balrog' : 'deep_bore',
          });
          if (data.stage === 2) s.regard.dwarf += 4;
          if (data.stage === 3) {
            // a permanent price for having gone that deep
            for (const L of s.links) if ((L.boreDepth || 0) > 22) L.peril = Math.min(3, L.peril + 0.30);
            s.audio?.('doom');
          }
          break;
        }
        case 'plague_spread':
          s.note(`병이 ${data.to.name}에 닿았다. ${data.from.name}발 9시 20분 차로 왔다. 교통청이 청소하고 증명한 객차 안에서.`, 'bad');
          break;
      }
    },

    tick(s) {
      if (s.week !== this._lastDrain) { this._lastDrain = s.week; drainDeclines(s); }
      const dtWeeks = 1 / 7;

      // quarantines lapse
      for (const st of s.sites) {
        if (st.quarantined) {
          st.quarantineWeeks -= dtWeeks;
          if (st.quarantineWeeks <= 0) { st.quarantined = false; s.markDirty(); }
        }
      }

      // the Ents come for the line if they were refused
      if (s._entAngry && s.rng.chance(0.02)) {
        s._entAngry = false;
        const cand = s.links.filter((L) => !L.destroyed);
        if (cand.length) {
          const L = pick(s.rng, cand);
          L.destroyed = true;
          s.markDirty();
          s.note('워든홀트를 지나던 구간이 사라졌다. 나무들이 돌아왔다. 같은 나무들이, 같은 나이로. 교통청의 식물학자는 이것이 불가능함을 확인하고 이 건에 대해서는 더 이상 자문받지 않기를 요청하였다.', 'grave', { chronicle: true });
          s.audio?.('ent');
        }
      }

      // one report every week or two, no more
      if (s.week - lastFlavourWeek >= 1 && s.rng.chance(0.16)) fireFlavour(s);

      if (s.rng.chance(0.05)) maybePetition(s);

      // The realm asks for things. In Age III it asks constantly, and most of what
      // it asks for is arms.
      const openOffers = s.commissions.filter((c) => c.state === 'offered').length;
      const live = s.commissions.filter((c) => c.state === 'taken').length;
      if (openOffers < 2 && live < 4 && s.week > 2) {
        const rate = s.age >= 3 ? 0.075 : s.age === 2 ? 0.045 : 0.03;
        if (s.rng.chance(rate)) {
          const roll = s.rng();
          if (s.age >= 3 && roll < 0.42) { if (!offerSiege(s)) offerTrade(s); }
          else if (roll < 0.30) offerPhysic(s) || offerTrade(s);
          else if (roll < 0.58) offerPassage(s) || offerTrade(s);
          else offerTrade(s);
        }
      }

      // a first case of plague once the network is big enough
      if (s.age >= 2 && !s._plagueSeeded && s.week > 12 && s.rng.chance(0.02)) {
        s._plagueSeeded = true;
        const cand = s.sites.filter((x) => x.connected && !x.abandoned && x.tier >= 1);
        if (cand.length) {
          const st = pick(s.rng, cand);
          st.plague = 0.4;
          s.note(`${st.name}에 발한역이 보고되었다. 의사들은 이를 국지적 사안이라 부르고 있다. ${st.name}에는 역이 있고, 하루 네 편이 운행되며, 열한 곳과 연결되어 있다.`, 'bad', { chronicle: true });
        }
      }

      // The dragon. A rich delve with a very deep shaft is the classic condition,
      // and it gives the deep_shaft trait a consequence of its own.
      if (!s._dragon && s.age >= 2 && s.week > 10 && s.rng.chance(0.012)) {
        const cand = s.sites.filter((x) => x.kind === 'delve' && x.connected && !x.abandoned
          && (x.traits || []).includes('deep_shaft') && x.prosperity > 55);
        if (cand.length) {
          s._dragon = true;
          const st = pick(s.rng, cand);
          s.dragonAt = st.id;
          const c = fromCorpus(s, 'CROSSING', 'dragon_wakes', { site: st, place: st.name });
          s.note(c ? c.text : (st.name + '이(가) 광석 싣기를 멈췄다. 굴착단은 이유를 말하지 않으며, '
            + '교통청은 차량을 1마일 뒤로 옮기고 더 이상 묻지 말라는 요청을 받았다.'),
            'grave', { chronicle: true, big: true, plate: 'dragon' });
          s.audio?.('dragon');
          // everything touching that delve becomes markedly less safe
          for (const L of s.links) {
            if (L.a === st.id || L.b === st.id) L.peril = Math.min(3, L.peril + 0.34);
          }
          st.unrest = Math.min(1, st.unrest + 0.4);
        }
      }


      // the Errand
      // Was `s.age >= 3`, which lands around week 27 — leaving perhaps seven weeks to
      // survey, fund and build a railway across a mountain wall and half a continent.
      // Age II, or a Shadow that is plainly rising, gives the errand room to be a
      // campaign rather than a notification.
      if (!errandIssued && (s.age >= 2 || s.shadow > 34) && s.week > 11) issueErrand(s);
      if (errandIssued) stepErrand(s, dtWeeks);

      // the realm falls
      if (!s.over && s.shadow >= 100) s.over = 'shadow';
      if (!s.over && s.concordAvg() < 8 && s.week > 12) s.over = 'concord';
      // The quiet ending. ENDINGS.survived existed from the start and no code path
      // ever set it — the only ways out were doom or the errand. A railway that has
      // outlasted the whole arc of the age deserves to close its own book: five
      // years in, still solvent, still running, the chronicle ends on a timetable.
      if (!s.over && s.week >= 60) s.over = 'survived';
    },
  };
}

// ---------------------------------------------------------------------------
// Endings
// ---------------------------------------------------------------------------

export const ENDINGS = {
  errand: {
    title: '하물은 배달되었다',
    tone: 'good',
    body: (s) => `그 물품은 동행 열차로, 잠긴 서랍 안, 차장의 차 안, "잡화"라 적힌 전표 아래, 랙 산에 도착하였다.

그 뒤 그것에 무슨 일이 일어났는지는 교통청의 소관이 아니며 교통청의 기록에도 나타나지 않는다. 교통청의 기록에 나타나는 것은, 그 하물이 ${s.byId.get(s.errand?.from)?.name ?? '발송지'}에서 접수되어 ${Math.round(s.links.reduce((n, L) => n + L.length, 0))}단위의 선로를 운반되고, 손실 없이 인계되며, 서명 수령되었다는 사실이다.

동쪽의 그림자는 사라졌다. 잿빛벌판 노선은 수요 검토가 있을 때까지 운행이 정지되었다. 이백 장의 오크 정기권이 환불되었는데, 전쟁보다 오래 걸렸다.

청장은 표창되었다. 표창은 기록되었다. 그 아래, 같은 서류철에, 운수과의 쪽지가 있다. 간선은 곡물을 싣기 위해 놓였으며, 다른 무언가를 실어 달라는 단 한 번의 요청에, 그것을 실었다고.`,
  },
  lost_errand: {
    title: '하물은 도착하지 않았다',
    tone: 'grave',
    body: () => `동행 열차는 역과 역 사이에서 멈췄다. 차장의 차가 열렸다. 서랍이 열렸다.

이후의 기록은 없다.

교통청의 마지막 행위는 겨울 시각표를 발행한 것이었다. 정시에, 더 이상 시각표를 필요로 하지 않게 된 왕국을 향하여. 좋은 시각표였다. 그 분기의 정시율은 91퍼센트, 교통청 역사상 최고의 수치였고, 그 수치를 유용하게 보고받을 이는 남아 있지 않았다.`,
  },
  shadow: {
    title: '동쪽이 서쪽으로 왔다',
    tone: 'grave',
    body: (s) => `그들은 레일 위로 왔다. 당연히 레일 위로 왔다 — 그것이 유일하게 합리적인 방법이었고, 교통청은 ${s.week}주를 들여 그것을 합리적으로 만들어 두었다.

간선은 끝까지 버텼다. 기관차는 달렸고, 신호는 작동했고, 연결기는 끊어지지 않았다. 교통청이 책임졌던 체계의 모든 부분은 설계된 그대로 정확히 작동하였다. 전속력으로, 잘못된 방향으로, 잘못된 것을 싣고.

장부의 마지막 기록은 브래큰포드 역장의 등불 교체 요청이다. 승인되었다.`,
  },
  dismissed: {
    title: '청장은 그간의 노고에 감사받았다',
    tone: 'bad',
    body: (s) => `교통청은 평의회가 회의에서 "창의적"이라고 표현한 액수만큼 당좌 초과 상태다.

청장은 그간의 노고에 감사받았다. 연금이 산정되었고, 회계를 고려하여, 다시 산정되었다.

철도는 남는다. ${s.links.length}개의 구간, 이전에는 이어지지 않았던 ${s.connectedCount()}곳의 연결, 그리고 선더링 산맥 아래의 터널 하나 — 그것을 놓고 다투었던 모든 이가 없어진 뒤에도 그곳에 있을 것이다. 평의회는 돈에 더 신중한 후임을 임명할 것이며, 그는 이 중 아무것도 짓지 않을 것이다.`,
  },
  concord: {
    title: '아무도 교통청과 말하지 않는다',
    tone: 'bad',
    body: () => `하플링들이 배달 수령 서명을 그만두었다. 굴착단은 기사들을 철수시켰고, 그들과 함께 도면 사용권도 거둬갔다. 항구는 비었다. 평의회는 청장을 부르지 않고 회의하며, 부른 것처럼 속기록을 작성한다.

선로는 온전하다. 그 위를 움직이는 것이 없다.

철도는 선로가 아니다. 철도는 선로에 관한 약정이며, 그 약정은 소멸하였다.`,
  },
  // ── the three ways Age III ends ────────────────────────────────────────
  held: {
    title: '선로는 버텨냈다',
    tone: 'good',
    body: (s) => `그들은 교통청이 실을 수 있도록 지어 둔 속도로 ${s.host?.fromName ?? '동쪽'} 길을 내려왔고, ${s.byId.get(s.host?.heartId)?.name ?? '왕국의 심장'}에서 멈췄다.

패배한 것이 아니다. 멈춘 것이다. 망루들은 서 있고, 절개지에는 벽이 있으며, 공사감독은 그 전 구간을 두 번 걸어 두 번 모두 검수에 서명하였다.

${s.connectedCount()}곳이 여전히 서로 이어져 있다. ${Math.round(s.stats.loadsMoved)}적재분이 운반되었고, 지난 4주간의 그 상당수는 사람이었다.

겨울 시각표가 작성되고 있다. 잠정일 것이다. 서기관이 말하듯, 이제 모든 것이 잠정이며, 교통청은 그것과 함께 살 수 있다고 판단하였다.`,
  },
  sundered: {
    title: '선로는 걷혔다',
    tone: 'grave',
    body: (s) => `교통청은 자신의 철도를 걷어 냈다. 서쪽으로, 대군의 앞에서 작업하며. 그리고 그것은 잘 먹혔다. 그들은 더 이상 오지 않는다. 내려올 것이 남아 있지 않기 때문이다.

레일들은 ${s.host?.road?.length ?? '여러'} 곳의 노반 옆에 쌓여 있다. 수는 세어졌다. 무엇에 쓸 것인지는 아무도 말하지 않았다.

걷히기 전까지 ${Math.round(s.stats.loadsMoved)}적재분이 운반되었다. 교통청이 측량하고, 견적 내고, 짓고, 완화하고, 그리고 자기 손으로 걷어 낸, ${Math.round(s.stats.builtLength ?? 0) || '수많은'} 마일의 선로 위에서.

청장의 이 건에 대한 기록은 한 줄이다. "옳은 일이었다. 그리고 내가 원하지 않았다는 사실을 기록해 두기 바란다."`,
  },
  overrun: {
    title: '동쪽이 선로를 따라 서쪽으로 왔다',
    tone: 'grave',
    body: (s) => `그들은 교통청 자신의 레일 위로, 정시에, 교통청이 ${s.week}주와 마련할 수 있는 모든 크라운을 들여 가능하게 만든 속도로, ${s.byId.get(s.host?.heartId)?.name ?? '왕국의 심장'}에 도착하였다.

사무실에서 제출된 마지막 보고서는 정시율 수치다. 기록된 것 중 최고다.

${s.connectedCount()}곳이 이어져 있었다. ${Math.round(s.stats.loadsMoved)}적재분이 운반되었다. 선로는 좋았다. 선로는 아주 좋았다.`,
  },
  survived: {
    title: '교통청은 계속된다',
    tone: 'good',
    body: (s) => `이번 분기, 위기 없음. 수입은 늘었다. 동쪽의 그림자는 있던 곳에 있으며 하던 일을 하고 있고, 동행 열차는 하루 네 번 그곳으로 곡물과 철과, 봄부터는, 관광객을 싣고 간다.

${s.connectedCount()}곳이 서로 이어져 있다. ${Math.round(s.stats.loadsMoved)}적재분이 운반되었다. 그린할로우는 한 번도 본 적 없는 산들을 먹인다. 네더 웸블리의 하플링은 저녁까지 아몬할에 갈 수 있고, 여정을 불평한다. 그것이 교통청이 성공했음을 아는 방법이다.

겨울 시각표는 인쇄소에 있다. 잠정이다.`,
  },
};
