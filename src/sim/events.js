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
  (a, b) => `Opened for traffic: ${a} to ${b}. Two workings each way, three on market days.`,
  // working man, plain
  (a, b) => `First train ${a} to ${b} went down at walking pace with the ganger riding the front step. He said the road was good. He does not say that.`,
  // halfling
  (a, b) => `${b} is much obliged and has sent a cake to ${a}, a second cake to the Authority, and a note explaining which is which.`,
  // authority, dry, not reversed
  (a, b) => `The ${a}–${b} works are complete. Final cost exceeded the estimate by a ninth, under the heading of weather.`,
  // dwarf
  (a, b) => `${a} to ${b}. Gauge true. Ballast sound. Signed for.`,
  // authority, flat
  (a, b) => `${a} and ${b} are joined. The signboards are painted and hung.`,
  // halfling, arrives at its grievance sideways
  (a, b) => `Mistress Puddifoot writes that the ${a} line is a fine thing, that her mother’s people came from ${b} and were not much thought of, and that the 6:40 is too early.`,
];

const TUNNEL_LINES = [
  (n) => `Bore through beneath the ${n}. Both headings met true. — T. Ironmoot, Master of Works`,
  (n) => `The ${n} tunnel is open to traffic. Length one mile and six chains, lined throughout.`,
  (n) => `Tunnel complete in the ${n}. The Delvers have cut KHAZAD into the crown, nine feet high, where no passenger will ever see it.`,
  (n) => `Bored under the ${n}. The stone came out dry. Thrain Ironmoot asks whether we want a second while the plant is on site.`,
];

const GREW_LINES = [
  (n, t) => `${n} is entered on the register as a ${t}.`,
  (n, t) => `${n} has grown to a ${t}. The inn has been extended twice and the innkeeper has stopped pretending to be surprised.`,
  (n, t) => `${n} is now a ${t} and has applied for a coat of arms. The application encloses a drawing.`,
  (n, t) => `${n}, ${t}. Population returns to follow.`,
  (n, t) => `Reclassified: ${n}, ${t}. The stationmaster has asked for a hat appropriate to the new standing and has been told to wait.`,
];

// A place slipping. No jokes in this pool.
const DECLINE_LINES = [
  (n) => `Population at ${n} continues to fall. The halt is still staffed.`,
  (n) => `${n} is entered a tier lower. The mill has stopped.`,
  (n) => `Fewer at ${n} again this quarter. The stationmaster keeps the lamp lit and is not paid to.`,
];

// A place ending. Grave register: concrete nouns, then stop.
const ABANDON_LINES = [
  (n) => `${n} is empty. The last family went on foot, along the line, in the direction of the railway they had been promised.`,
  (n) => `${n} is struck from the register. Its bell has gone to a place that still has people in it.`,
  (n) => `No one remains at ${n}. The signboard is down and stored. The name may be wanted again.`,
];

const INCIDENT_BLOCK = [
  (r) => `Rockfall, ${r} section. Line closed to traffic while the gang clears it. Ref ${ref()}.`,
  (r) => `A tree is across the road in the ${r}. It was not there yesterday and it has not been felled. Ref ${ref()}.`,
  (r) => `Something is standing in the cutting in the ${r}. It has been there since Thursday. Passengers are asked to keep their seats.`,
  (r) => `The ${r} section is obstructed. The Wardens describe the obstruction as livestock. Ref ${ref()}.`,
  (r) => `Signal held against us at the ${r} box four hours. The signal was working. The signalman was not certain, and I do not hold it against him. — Driver Halloway`,
  (r) => `${r} section: obstruction cleared, twelve tons, two wagon loads. No injuries.`,
];

const INCIDENT_BEAST = [
  (r) => `A train was set upon in the ${r}. The engine is sound. The brake van is a matter for the adjusters. Ref ${ref()}.`,
  (r) => `Wargs on the up road at dusk in the ${r}. I ran through them. They did not scatter. They stepped aside and watched us by. — Driver Mullet`,
  (r) => `The 4:15 came through the ${r} with the engine and nothing else. Ref ${ref()}.`,
  (r) => `A wagon is gone off the ${r} viaduct. The couplings were undone, not broken.`,
  (r) => `${r} section: night working suspended by the men’s own agreement. The Authority has not overruled them.`,
];

// The older powers. Grave register throughout.
const INCIDENT_WRATH = [
  (r) => `The ${r} section has been unmade. Not broken. The rails are lying in the grass in the order they were rolled. Ref ${ref()}.`,
  (r) => `Track through the ${r} was taken up overnight, with the embankment, the fence, and a surveyor’s coat. The coat was returned.`,
  (r) => `The works in the ${r} are gone. There is a hill where they were, and it is the right shape for the country.`,
];

// ---------------------------------------------------------------------------

/**
 * The firsts. These are the moments the whole game is arranged around. Each gets
 * a plate and a page. If the expanded corpus in src/text/reports.js offers an
 * alternative it is preferred; this is the floor, not the ceiling.
 */
const CROSSING_FALLBACK = {
  first_bridge: () =>
    'The river is bridged. It took eleven weeks, four revisions and a diver, and the Authority '
    + 'would like it recorded that the diver was not in the original estimate.\n\n'
    + 'The first train across went at walking pace with the Bridgewrights standing on the deck. '
    + 'That is either confidence or hostage-taking and nobody has asked which.',

  first_bore: () =>
    'The Sundering Peaks are bored through.\n\n'
    + 'Twelve hundred feet of rock, driven from both ends, meeting within a hand-breadth. Thrain '
    + 'Ironmoot walked the length of it before the rails were laid and said nothing at all for the '
    + 'whole distance, which those who know him report is the highest praise available.\n\n'
    + 'A journey that took nine days now takes an afternoon. Nobody has worked out what the realm '
    + 'will do with the other eight.',

  first_pass: () =>
    'A line is over the pass without a tunnel, up one side and down the other on gradients the '
    + 'Delvers have described in writing as brave.\n\n'
    + 'It will drift shut every winter. It cost a tenth of a bore. Both of those are now permanent.',

  first_marsh: () =>
    'The causeway across the Weeping Marsh is open, and is already an inch lower than it was on '
    + 'Tuesday.\n\nThe Marsh is not hostile. The Marsh is patient, which is far harder to budget for.',

  first_wood: () =>
    'Track through Mirkholt. The gangs worked in daylight only, by their own agreement, and nobody '
    + 'argued with them.\n\n'
    + 'The trees on either side of the cutting are nearer the line this week than the survey says '
    + 'they were. The survey has been rechecked. The survey is correct.',

  first_east: () =>
    'A line is through the Wracklands and into the Ashenreach.\n\n'
    + 'The gap in the ridge was undefended. Nobody stopped the gangs, nobody watched them, and '
    + 'nothing whatever was asked of them.\n\n'
    + 'The Authority spent some weeks deciding whether that was luck. It has stopped deciding.',

  first_wrack: () =>
    'The line has reached Mount Wrack.\n\n'
    + 'There is a buffer stop, a water tower, and a signboard with the name on it in the standard '
    + 'lettering. The signwriter took four days over it and has asked not to be thanked publicly.\n\n'
    + 'The tariffs are extraordinary. The first consignment east was arms, and the paperwork for it '
    + 'is correct in every particular.',

  first_quays: () =>
    'The Grey Quays are on the timetable.\n\n'
    + 'The Elves came down to see the first train and did not board it. They stood on the quay in '
    + 'the manner of people watching weather, and when it left they went back to whatever it is '
    + 'they do there.',
};

/** The three-step thread that answers: does anything mind if you tunnel deep? */
const DEEP_BORE = {
  1: 'The gangs in the deep heading report a draught.\n\n'
    + 'There is no shaft above them and no adit beside them and the air is moving anyway. Thrain '
    + 'Ironmoot has been down. He has ordered the heading advanced with the timbers doubled, and he '
    + 'has not said why.',
  2: 'The deep heading has holed into a gallery.\n\n'
    + 'It is not ours. Dressed stone, older than the Delvers will put a figure to, running across '
    + 'our alignment at an angle that suggests it was going somewhere specific.\n\n'
    + 'At the eastern end of it there is a door. The door is shut. The Authority has issued an '
    + 'instruction that it remain shut and has been asked, politely, by whom.',
  3: 'The door is open.\n\n'
    + 'The night shift came up. All of them, which the Authority records with relief, and without '
    + 'their lamps, which it records without any.\n\n'
    + 'The deep heading is sealed: twelve feet of masonry and a second wall behind the first. The '
    + 'Delvers laid both without being asked and invoiced for neither. Thrain Ironmoot has requested '
    + 'reassignment to signalling.\n\n'
    + 'The tunnel above remains in service. Trains are instructed not to stop in it.',
};

// The proactive corpus — reports that fire on the state of the realm
// ---------------------------------------------------------------------------

const FLAVOUR = [
  {
    id: 'hens', weight: 5, cooldown: 9,
    when: (s) => s.sites.some((x) => x.kind === 'shire' && x.connected),
    text: (s) => `Mistress Amaranth Puddifoot writes to say the whistle frightens her hens and asks that it be changed to a bell. She has written eleven times. The hens have not commented.`,
  },
  {
    id: 'hens2', weight: 3, cooldown: 14, after: 'hens',
    when: (s) => true,
    text: () => `Mistress Puddifoot has written again. The letter contains a diagram. The diagram is of a bell.`,
  },
  {
    id: 'lost_property', weight: 5, cooldown: 7,
    when: () => true,
    text: (s) => {
      const items = [
        'one umbrella, black', 'a sword, unclaimed', 'a bundle of maps of somewhere else',
        'a wedding ring and a note reading “no”', 'a live goose', 'a box of teeth, not human',
        'nine identical grey cloaks', 'a bill of lading for a cargo we have never carried',
        'a small harp, tuned', 'a hat with a hole burned through the crown',
        'a child’s shoe, and only the one', 'a key, iron, to nothing on the system',
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
        `Lost property, quarter to Michaelmas. Held: ${a}; ${b}. Claimed: none of it. The room is full and the surplus has been put in the room next door, which was also full.`,
        `Lost property. The clerk asks for a ruling on ${a}, eleven months on the shelf now, and on ${b}, which he would like to take home. Ruling: no to both, and he is not to ask again in writing.`,
        `Lost property, and a complaint attached. Handed in at the halt: ${a}. Handed in at the same halt, by the same man: ${b}. He says he found them on the train. The guard says he came in with them.`,
      ]);
    },
  },
  {
    id: 'punctuality', weight: 5, cooldown: 8,
    when: (s) => s.links.length > 5,
    text: (s) => {
      const pc = 61 + Math.floor(s.rng() * 33);
      return `Punctuality this period: ${pc} per cent. The Authority notes that the figure is calculated against the revised timetable, and that the timetable was revised in order to improve the figure.`;
    },
  },
  {
    id: 'dwarf_invoice', weight: 4, cooldown: 10,
    when: (s) => s.can.tunnel && s.regard.dwarf > 30,
    text: () => `The Delvers have submitted an invoice itemised in a script the Authority cannot read, totalling an amount the Authority cannot dispute. It has been paid.`,
  },
  {
    id: 'elf_objection', weight: 5, cooldown: 8,
    when: (s) => !s.elvesGone && s.regard.elf < 55,
    text: (s) => pick(s.rng, [
      `A representation has been received from the Havens. It is nine lines long, it is in verse, and it is about a tree that is no longer there.`,
      `The Elves object to the smoke. They have not said what they would like done about the smoke. They have simply established, at length, that they object to it.`,
      `An Elvish deputation attended the Board and declined refreshment. They stayed four hours. They said nothing after the first ten minutes, and the minute-taker reports that this was worse.`,
    ]),
  },
  {
    id: 'vurmath1', weight: 6, cooldown: 99, once: true,
    when: (s) => s.week > 5 && s.links.length > 6,
    text: () => `Vurmath the Grey has taken an interest in the railway. He arrived unannounced at the works, asked eleven questions about coal, and left with a copy of the survey. He has offered his assistance, which the Authority has accepted, having no procedure for refusing it.`,
    chronicle: true,
  },
  {
    id: 'vurmath2', weight: 6, cooldown: 99, once: true, after: 'vurmath1',
    when: (s) => s.age >= 2 && s.smokeIndex > 8,
    text: () => `Vurmath now styles himself Vurmath the White and has submitted proposals. He would like a branch to his tower, three additional smelters, and a seat on the Board. He has been given the branch. The Board is a matter for the Council, and the Council is not answering.`,
    chronicle: true,
  },
  {
    id: 'elberic', weight: 4, cooldown: 16,
    when: (s) => s.week > 8,
    text: (s) => pick(s.rng, [
      `Elberic the Grey travelled from Brackenford to Amonhal without a ticket. When challenged he agreed that he had no ticket, complimented the guard on his diligence, and continued to have no ticket for the remainder of the journey.`,
      `Elberic the Grey was seen on the ${pick(s.rng, ['down', 'up'])} platform, looking east. He declined to say what he was looking at. The Authority has looked east and seen nothing, which it has decided to find reassuring.`,
    ]),
  },
  {
    id: 'goblin_market', weight: 4, cooldown: 20, once: true,
    when: (s) => s.can.tunnel && s.links.some((L) => L.tunnels > 0),
    text: () => `An unlicensed market has established itself in the middle of a tunnel. It trades at night, accepts no coin the Authority recognises, and pays a rent to somebody. The Authority has resolved to determine whom, after the summer timetable.`,
  },
  {
    id: 'barrow', weight: 4, cooldown: 12,
    when: (s) => s.links.some((L) => {
      const a = s.byId.get(L.a);
      return a && REGION_NAME[a.region] === 'the Barrowdowns';
    }),
    text: () => `Night services across the Barrowdowns are again running slow. Drivers report that the section takes longer than it is long. The Authority has re-measured the section. The section is the length it has always been.`,
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
      return `Freight is standing at ${a.name} for want of a path. The ${a.name}–${b.name} section is carrying everything it can and is being asked to carry more. Traffic recommends additional engines, in the tone of a department that has recommended this before.`;
    },
  },
  {
    id: 'boom', weight: 6, cooldown: 8,
    when: (s) => s.sites.some((x) => x.tier >= 3 && x.connected),
    text: (s) => {
      const big = s.sites.filter((x) => x.tier >= 3 && !x.abandoned);
      if (!big.length) return null;
      const c = pick(s.rng, big);
      return `${c.name} has outgrown its station for the third time. The Authority has been offered land for a larger one, on terms, by a consortium that turns out on inspection to be the stationmaster.`;
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
      return `${st.name} has acquired a quarter where four peoples live within a hundred yards of one another. There are three bakeries, none of which will acknowledge the others, and a dispute about bells that has now gone to the Council. Trade is up thirty per cent.`;
    },
  },
  {
    id: 'orc_commuters', weight: 8, cooldown: 9,
    when: (s) => s.concession && s.orcTradeTotal > 12,
    text: (s) => pick(s.rng, [
      `Orkish passengers are now using the eastern services in numbers. They pay, they travel in silence, and they leave the carriages cleaner than they found them, which the Authority finds more unsettling than the alternative.`,
      `A complaint has been received about orkish passengers on the 6:40. The complaint is that they queue. The Authority has declined to act on it.`,
      `Traffic reports that eastbound freight is up again and that the consignees have begun asking for the timetable in advance. They have been sent the timetable. There was no reason not to send them the timetable. The Authority has thought about this several times since.`,
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
    title: 'The Road They Are Coming Down Is Ours',
    from: 'the Master of Works, in person, having not sat down',
    body: `They are on the ${H.fromName ?? 'eastern'} road, and they are making better time than the `
      + `Authority's own goods services, for the reason that it is the Authority's own road.\n\n`
      + `Ahead of them: ${road.length} sections, and then ${heart?.name ?? 'the heart of the realm'}.\n\n`
      + 'Works will do whichever of these the Director signs for, and would like it noted that '
      + 'he has said, in this room, that there is no good answer.',
    options: [
      {
        label: 'Fortify the road',
        note: `Blockhouses and walled cuttings the whole length. ${fortifyCost} crowns, and upkeep after.`,
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
          st.note(`The road is being fortified along its whole length, at ${Math.round(paid)} crowns, `
            + 'which the Authority does not have and has undertaken to find.\n\n'
            + 'The works are of dressed stone and are going up in front of the host at very nearly '
            + 'the speed the host is moving. Two gangs have asked to be relieved. Neither has been.',
            'grave', { chronicle: true });
        },
      },
      {
        label: 'Requisition it for the evacuation',
        note: 'Every train westward, full of people, carrying nothing that pays.',
        apply: (st) => {
          st.host.answer = 'requisition';
          st.host.evacuating = true;
          for (const site of st.sites) {
            if (site.abandoned || !site.connected) continue;
            if (site.x > (st.byId.get(st.host.heartId)?.x ?? 0)) {
              site.fled = Math.min(1, (site.fled || 0) + 0.3);
            }
          }
          st.note('Every service is requisitioned. The timetable has been suspended — not amended, '
            + 'suspended — and the word appears in a minute of the Authority for the first time.\n\n'
            + 'The trains are going west full and coming back empty, and they are carrying no '
            + 'grain, no iron and no fares. The Authority is, from this week, a charity with '
            + 'locomotives.', 'grave', { chronicle: true });
        },
      },
      {
        label: 'Tear up the road behind them',
        note: 'The greatest thing you ever built, lifted. They cannot march on rails that are gone.',
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
          st.note(`${lifted} sections have been lifted by the Authority's own gangs, working `
            + 'from the west end back, ahead of the host.\n\n'
            + 'The rails are stacked beside the formation. The Master of Works walked the last '
            + 'mile of it and has not filed a report on what he saw, and has not been asked to.',
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
    title: 'The Onodrim Standing Committee on Right-of-Way',
    from: 'Wodenholt',
    body: `A delegation from Wodenholt has arrived at the works. It arrived over four days, which the Authority initially took for rudeness and now understands differently.

They wish it recorded that the wood is not available. They are willing to discuss a route around the wood. They are willing to discuss it at length.`,
    options: [
      {
        label: 'Route around the wood',
        note: 'Costs 180 crowns in resurveying. The Elves will hear of it.',
        apply: (s) => {
          s.treasury -= 180;
          s.regard.elf += 9;
          s.woodCare = Math.min(0.9, s.woodCare + 0.15);
          s.note('The line will go around Wodenholt. The resurvey is charged at 180 crowns, and the wood is entered on the working plans under its own name, at the delegation’s request, in full.', 'good', { chronicle: true });
        },
      },
      {
        label: 'Proceed as surveyed',
        note: 'Saves the money. Wodenholt has a long memory and a slow one.',
        apply: (s) => {
          s.regard.elf -= 14;
          s._entAngry = true;
          s.note('The Authority has elected to proceed as surveyed. The delegation was informed. It did not reply, which has been minuted as assent.', 'bad', { chronicle: true });
        },
      },
    ],
  },
  {
    id: 'grain_levy', once: true,
    when: (s) => s.week > 9 && s.sites.some((x) => x.kind === 'shire' && x.tier >= 2),
    title: 'A Petition of the Greenhollow',
    from: 'the Halflings',
    body: `Forty-one signatures, several of them the same signature. The Greenhollow observes that its grain now feeds mountains it has never seen, at prices set in Amonhal, and that a fair share of the fare would not be unreasonable.

They have costed their proposal. The costing is legible and, irritatingly, correct.`,
    options: [
      {
        label: 'Grant the rebate',
        note: 'A standing charge on fares. The Halflings will remember it.',
        apply: (s) => {
          s.fareRebate = 0.12;
          s.regard.halfling += 16;
          s.note('The rebate is granted: a twelfth part of the fare on Greenhollow grain, standing until revoked. A barrel arrived at the office by way of thanks. Ale, dark, nine gallons.', 'good', { chronicle: true });
        },
      },
      {
        label: 'Decline, with regret',
        note: 'Keeps the revenue. Unrest in the Greenhollow.',
        apply: (s) => {
          s.regard.halfling -= 15;
          for (const st of s.sites) if (st.culture === 'halfling') st.unrest = Math.min(1, st.unrest + 0.3);
          s.note('The petition is declined with regret. The regret runs to a page and a half, was signed on the Thursday, and went down to the Greenhollow by the morning service.', 'bad', { chronicle: true });
        },
      },
    ],
  },
  {
    id: 'concession_offer', once: true,
    when: (s) => s.age >= 2 && !s.concession && s.week > 13,
    title: 'An Approach from the East',
    from: 'the Eastern Party',
    body: `A letter has arrived at the Authority. It was not delivered; it was found, on the Director's desk, in the morning.

It proposes tariffs. The tariffs are extraordinary — four times what any western consignment returns, paid in ashglass and iron, in advance. The terms are otherwise unobjectionable. The Authority has read them eleven times looking for the objection.

There is no signature. There is a mark.`,
    options: [
      {
        label: 'Accept the concession',
        note: 'Enormous revenue. Every crate moved east feeds the Shadow.',
        apply: (s) => {
          s.concession = true;
          s.treasury += 400;
          s.shadow += 6;
          s.regard.elf -= 10;
          s.note('The concession is accepted. The advance has cleared: 400 crowns, entered under eastern receipts, a head of account that did not exist last week.', 'grave', { chronicle: true });
        },
      },
      {
        label: 'Return it unanswered',
        note: 'Forgoes the money. The Council will ask why.',
        apply: (s) => {
          s.regard.men -= 6;
          s.regard.elf += 12;
          s.shadow = Math.max(0, s.shadow - 4);
          s.note('The letter has been returned unanswered. It is not clear to whom it was returned. It is no longer on the desk.', 'good', { chronicle: true });
        },
      },
    ],
  },
  {
    id: 'plague_quarantine',
    when: (s) => s.sites.some((x) => x.plague > 0.3 && x.connected),
    title: 'A Matter of Public Health',
    from: 'the Surgeons of Amonhal',
    body: (s) => {
      const sick = s.sites.filter((x) => x.plague > 0.3 && x.connected);
      const n = sick[0];
      return `The sweating sickness is at ${n ? n.name : 'a station on the trunk'} and it is travelling by rail, because everything travels by rail now.

The Surgeons request closure of the affected stations. Traffic points out that closure will strand the grain. Both are correct, and they have been arguing in the corridor for two days.`;
    },
    options: [
      {
        label: 'Close the stations',
        note: 'Stops the spread. Freight stops with it.',
        apply: (s) => {
          for (const st of s.sites) if (st.plague > 0.2) { st.quarantined = true; st.quarantineWeeks = 3; }
          s.regard.men += 5;
          s.note('The affected stations are closed. The grain is standing in wagons at Brackenford and the Authority is being written to about it hourly.', 'plain', { chronicle: true });
        },
      },
      {
        label: 'Keep the line open',
        note: 'Freight keeps moving. So does the sickness.',
        apply: (s) => {
          for (const st of s.sites) if (st.plague > 0.15) st.plague += 0.25;
          s.regard.halfling -= 8;
          s.regard.men -= 4;
          s.note('The line stays open. The reasoning is recorded in the minute book. It runs to four pages.', 'bad', { chronicle: true });
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
          `Returns for the week show falling numbers at ${list}${more}.\n\n`
          + 'Traffic has been asked whether these places have anything in common. '
          + 'Traffic has answered that they are all on the same line, and has left the room.',
          'bad',
        );
      }
    }
    if (abandonQueue.length) {
      const names = abandonQueue.splice(0, abandonQueue.length).map((x) => x.name);
      if (names.length === 1) {
        const c = fromCorpus(s2, 'ABANDONED', null, { place: names[0] });
        s2.note(c ? c.text : `${names[0]} is empty. The last family left on foot, in the direction of the railway they were promised.`,
          'bad', { chronicle: true });
      } else {
        s2.note(
          `Struck from the register this week: ${names.join(', ')}.\n\n`
          + 'Their signboards have been taken down and stored, on the reasoning that the names may be wanted again.',
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
      kind: 'siege', class: 'freight', client: 'the Crown',
      good: 'arms', need, to: st.id, weeks,
      fee: priceOf('arms', need, weeks, 1.5),
      urgent: true,
      title: `${st.name} is invested`,
      body: `Riders came in overnight. ${st.name} is surrounded and is asking for arms, `
        + `by rail, because there is no other way in that anybody would survive.\n\n`
        + `${need} loads of arms, within ${weeks} weeks. The Crown will pay. `
        + `The Crown has also observed, in writing, that it has no other means of getting them there.`,
      onDone: (s2, c) => {
        const site = s2.byId.get(c.to);
        s2.regard.men = Math.min(100, s2.regard.men + 14);
        s2.note(`The siege of ${site?.name ?? 'the watch'} is lifted. The arms went up in ordinary `
          + 'goods wagons under a tarpaulin marked AGRICULTURAL IMPLEMENTS. The garrison '
          + 'commander has asked for the tarpaulin to keep.', 'good', { chronicle: true });
      },
      onFail: (s2, c) => {
        const site = s2.byId.get(c.to);
        if (site) { site.abandoned = true; s2.markDirty(); }
        s2.regard.men = Math.max(0, s2.regard.men - 20);
        s2.shadow = Math.min(100, s2.shadow + 6);
        s2.note(`${site?.name ?? 'The watch'} has fallen.\n\n`
          + 'The Authority is able to state the exact quantity of arms standing in its yards on the '
          + 'day it fell, because the Authority counts things. That figure has been removed from the '
          + 'published return.', 'grave', { chronicle: true, big: true });
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
        kind: 'pilgrims', client: 'the Havens', from: from.id, to: quays.id, weeks: 6,
        need: 26, label: 'passage west',
        title: 'Passage to the Grey Quays',
        body: `A party from ${from.name} asks for passage to the Grey Quays. Forty-one of them, `
          + 'with baggage they will not let anybody else carry.\n\n'
          + 'They have not said whether they intend to come back, and the clerk who asked has '
          + 'apologised.',
      });
    }
    const burgs = kindsOf('burg');
    if (burgs.length >= 2) {
      const [a, b] = s.rng.shuffled(burgs).slice(0, 2);
      options.push({
        kind: 'fair', client: 'the Marchfolk', from: a.id, to: b.id, weeks: 4,
        need: 20, label: 'excursion traffic',
        title: `The ${b.name} fair`,
        body: `${b.name} holds its fair in a month and expects half the Marchlands to attend. `
          + `${a.name} would like a train, or several.\n\n`
          + 'Traffic notes that the last time the Authority ran an excursion the return working was '
          + 'four hours late and nobody minded, which it has decided not to plan around.',
      });
    }
    const delves = kindsOf('delve');
    if (delves.length && burgs.length) {
      const from = pick(s.rng, delves), to = pick(s.rng, burgs);
      options.push({
        kind: 'delegation', client: 'the Khazadrim', from: from.id, to: to.id, weeks: 5,
        need: 14, label: 'a delegation',
        title: 'A delegation, travelling in state',
        body: `Thrain Ironmoot is going to ${to.name} to argue about gauge, and will not go by road.\n\n`
          + 'He requires a carriage, a second carriage for the documents, and an assurance that the '
          + 'train will not be late. Two of those three can be provided.',
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
      kind: 'physic', class: 'freight', client: 'the Surgeons of Amonhal',
      good: 'athelas', need, to: st.id, weeks: 4,
      fee: priceOf('athelas', need, 4, 1.4),
      urgent: true,
      title: `Athelas for ${st.name}`,
      body: `The Surgeons want athelas at ${st.name}, and athelas grows in one place on this `
        + 'continent and is picked by people who do not hurry.\n\n'
        + 'Four loads. The Surgeons have costed the alternative, which is a quarantine, and have '
        + 'attached the costing. It is not a document the Authority enjoyed reading.',
      onDone: (s2, c) => {
        const site = s2.byId.get(c.to);
        if (site) { site.plague = 0; site.quarantined = false; s2.markDirty(); }
        s2.regard.halfling = Math.min(100, s2.regard.halfling + 6);
        s2.regard.elf = Math.min(100, s2.regard.elf + 8);
        s2.note(`The sickness at ${site?.name ?? 'the station'} is broken. The Surgeons have thanked `
          + 'the Elves. The Elves have replied that they were not thanked for the wood.', 'good');
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
        kind: 'forge', client: 'the Khazadrim', good: 'grain', need, to: st.id, weeks: 5,
        fee: priceOf('grain', need, 5, 1.25),
        title: `${st.name} is short of bread`,
        body: `${st.name} has iron, coal, stone and no food whatever, which is the ordinary `
          + 'condition of a delve and becomes an emergency about twice a year.\n\n'
          + `${need} loads of grain. They have offered to pay in advance, in coin they have struck `
          + 'themselves, which the Council has agreed to accept after some discussion about the face.',
      });
    }
    if (burgs.length) {
      const st = pick(s.rng, burgs);
      const need = 2;
      opts.push({
        kind: 'mithril', client: 'the Council', good: 'mithril', need, to: st.id, weeks: 8,
        fee: priceOf('mithril', need, 8, 1.1),
        title: 'A quantity of mithril, for the Crown',
        body: `The Council requires two loads of mithril delivered to ${st.name}. It has not said `
          + 'what for.\n\n'
          + 'Mithril comes out of exactly those delves that have a shaft deep enough to reach it, in '
          + 'quantities best described as a nuisance to schedule. The fee reflects this. The fee is '
          + 'the largest single figure in the Authority’s history.',
      });
    }
    if (burgs.length && s.sites.some((x) => x.kind === 'shire' && x.connected)) {
      const st = pick(s.rng, burgs);
      const need = 8;
      opts.push({
        kind: 'wedding', client: 'the House of ' + st.name, good: 'wine', need, to: st.id, weeks: 3,
        fee: priceOf('wine', need, 3, 1.3),
        title: `A wedding at ${st.name}`,
        body: `There is to be a wedding at ${st.name} and there is not enough wine in the Marchlands `
          + 'to hold it.\n\n'
          + 'Eight loads, within three weeks, and the Authority is asked to understand that the date '
          + 'cannot move. The Authority does understand. The Authority has been married.',
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
      `A consignment has been booked with the Authority. One item, small, carried by hand. `
      + `Origin ${west.name}. Destination Mount Wrack. The booking is countersigned by the Council, by the Havens, and by a third party whose seal the clerk did not recognise and has been told not to ask about.\n\n`
      + `The docket specifies: do not weigh it, do not open it, do not leave it standing on a platform. `
      + `Under “value” the shipper has written “no”.\n\n`
      + `Enclosed with the docket, without explanation or conditions, is a draft on the Treasury `
      + `for ${advance} crowns. The Secretary observes that this is roughly what it would cost to `
      + `build a railway to Mount Wrack, and that nobody has said so.`,
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
            s.note(`The consignment has been taken by cart to ${railhead.name}, the nearest place `
              + `the Authority actually reaches. The carter was not told what it was and did not ask, `
              + `which the Secretary notes is the first sensible thing anyone has done about it.`, 'plain');
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
        s.note(`The road to ${goal.name} was opened in week ${s.firsts.first_wrack} and is `
          + `open no longer.\n\n`
          + 'The consignment has been carried back to the last station the Authority still '
          + 'holds. It has not been opened. The Secretary has asked Works for a date by which '
          + 'the road can be made good, and Works has asked the Secretary for the loan of the '
          + 'gangs that are presently rebuilding everything else.',
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
            const nth = e.initials === 4 ? 'a fourth time'
              : e.initials === 5 ? 'a fifth time'
              : e.initials === 6 ? 'a sixth time' : `for the ${e.initials}th time`;
            s.note(`The consignment has gone forward to ${far.site.name}, which is as far as the `
              + `Authority's metals reach.\n\n`
              + `From the buffer stops to ${goal.name}: ${miles} miles, and no rail on any of it. `
              + `The docket has been re-dated and initialled ${nth}.`,
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
        ? `no rail reaches ${goal ? goal.name : 'the destination'} at all`
        : !here || !here.connected
          ? `nothing reaches ${here ? here.name : 'the consignment'}, where it is standing`
          : `the road is not continuous: there is track at ${here.name} and track at ${goal.name}, `
            + `and no run of rail joining the two`;
      if (e.weeks > 2 && !e.nagged1) {
        e.nagged1 = true;
        s.note(`The Council enquires after the consignment. It is at ${here ? here.name : 'the railhead'}, `
          + `in a locked drawer. The Authority has replied that the route is in hand.\n\n`
          + `The route is not in hand: ${why}.`, 'bad');
      } else if (e.weeks > 5 && !e.nagged2) {
        e.nagged2 = true;
        s.note(`The Council enquires again. The tone of the enquiry has changed. The consignment `
          + `remains in the drawer, and the drawer is now guarded, which nobody ordered.\n\n`
          + `The obstacle is unchanged: ${why}.`, 'bad');
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
            s.note(pick(s.rng, TUNNEL_LINES)((REGION_NAME[a.region] ?? 'hills').replace(/^the /, '')), 'good');
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
          s.note(`${data.commission.title}. Asked by ${data.commission.client}.`,
            data.commission.urgent ? 'bad' : 'plain');
          s.audio?.('petition');
          break;
        case 'commission_done':
          s.note(`Commission discharged: ${data.commission.title}. `
            + `${Math.round(data.commission.fee)} crowns received.`, 'good');
          s.audio?.('coin');
          break;
        case 'commission_failed':
          s.note(`Commission not discharged: ${data.commission.title}. `
            + 'The Authority has entered the reason in the register and the register is not '
            + 'persuaded.', 'bad');
          break;

        case 'works': {
          const L = data.link, st = data.site;
          const a = L ? s.byId.get(L.a) : null, b = L ? s.byId.get(L.b) : null;
          const where = a && b ? `${a.name}–${b.name}` : (st?.name ?? 'the works');
          if (data.kind === 'double') {
            s.note(`Second road laid, ${where}. The Delvers were pleased to be asked and have said `
              + 'so at a length that has been minuted.', 'good');
            s.audio?.('build_works');
          } else if (data.kind === 'regrade') {
            s.note(`Gradients eased on the ${where} section. Nine chains of it are now level that `
              + 'were not level before.', 'good');
          } else if (data.kind === 'fortify') {
            s.note(`Blockhouses on the ${where} section, and the cuttings walled. `
              + 'The Wardens have moved in and put up curtains.', 'good');
          } else if (data.kind === 'station') {
            s.note(`Station works at ${where}. A second platform, a canopy, and a room in which `
              + 'to wait rather than merely to stand.', 'good');
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
            () => `There is a place at ${st.name} that was not there last year.\n\n`
              + 'Nobody granted it, nobody surveyed it, and nobody has told the Council. It has '
              + 'eleven roofs, a well, and a man who says he is the stationmaster of a station the '
              + 'Authority has not built.',
            () => `${st.name}, ${lore ? lore.name : 'the wilds'}. Founded, in the sense that people are living there.\n\n`
              + 'The Authority has added it to the register under protest, the protest being its own, '
              + 'on the grounds that this is how the last four came about as well.',
            () => `Application received from ${st.name} for a halt, a signboard, and a name in the timetable.\n\n`
              + 'The application is written on the back of a bill of lading for our own coal. They are '
              + 'not asking whether the railway will come. They are asking when.',
            () => `New entry: ${st.name}. Reason for entry: it is there.`,
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
            ? ` The ${GOODS[top.g].name.toLowerCase()} is arriving.`
            : ' The railway is credited, at some length, by the railway.';
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
            ? ` It is short of ${GOODS[worst.good].name.toLowerCase()}: ${worst.why}.`
            : ' Nothing has arrived for some time.';
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
          s.note(`Charter granted: ${data.charter.name}. ${data.charter.note ?? ''}`.trim(), 'good',
            firstCharter ? { chronicle: true, plate: 'charter' } : { chronicle: true });
          break;
        }
        case 'insolvent':
          if (data.weeks === 1) s.note('The Authority is overdrawn. The Council has been informed by the Council\'s own auditors, which is the worst way for the Council to be informed of anything.', 'bad');
          else if (data.weeks >= 4 && !s.over) { s.over = 'dismissed'; }
          else s.note(`Overdrawn for a ${['', 'first', 'second', 'third', 'fourth'][Math.min(4, data.weeks)]} week. The Secretary has begun using the word "retrenchment" in meetings.`, 'bad');
          break;
        case 'incident': {
          const L = data.link;
          const a = s.byId.get(L.a);
          // bare, because every template supplies its own article
          const rn = (a ? (REGION_NAME[a.region] ?? 'wilds') : 'wilds').replace(/^the /, '');
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
            s.note('Traffic reports that the eastern halts have stopped sending their weekly returns. Not late. Stopped.\n\n'
              + 'The Authority has written to each of them. The letters have not come back, which the Secretary observes is not the same as being answered.',
              'grave', { chronicle: true });
          } else if (data.stage === 2 && data.link) {
            s.note(data.held
              ? `The road at ${data.where} was attacked in the night and held. The blockhouse is scarred and standing, the gangers are accounted for, and the line will be open again within the week.\n\n`
                + 'The Master of Works has asked that the cost of the blockhouse be entered again, in a larger hand, beside this week’s return.'
              : `The road at ${data.where} is gone. Not blocked — gone: the rails lifted, the sleepers burnt, the embankment opened in four places.\n\n`
                + 'It can be made good. It will cost what it cost the first time, and rather more.',
              'bad', { chronicle: true });
          } else if (data.stage === 3) {
            s.note('The westbound services are full and the eastbound are empty, and no timetable the Authority prints will change that this month.\n\n'
              + 'People are coming west along the line, with what they can carry. The stationmasters have stopped asking for tickets. Nobody instructed them to stop, and nobody has instructed them to start again.',
              'grave', { chronicle: true, big: true });
          } else if (data.stage === 4) {
            s.note(`A host has come out of the east and is moving on the Authority’s own road, from ${data.from} toward ${data.to}.\n\n`
              + 'The Surveyor has been asked how fast. He has answered that they are moving at the speed of the road — which the Authority built, and eased, and doubled — and that he would rather not put a date on it in writing.',
              'grave', { chronicle: true, big: true, plate: 'age3' });
            s.audio?.('doom');
          }
          break;
        }
        case 'age':
          if (data.age === 2) {
            s.note('The Authority has been reconstituted with an enlarged mandate and a smaller building. Traffic is up. Everything is up. The Council has begun using the word “Age”, capitalised, which is never a good sign in a minute.', 'plain', { chronicle: true, big: true });
          } else if (data.age === 3) {
            s.note(
              'A memorandum has been circulated to all stationmasters. It is one page. It concerns what to do if the eastern services do not stop where they are timetabled to stop.\n\n'
              + 'It does not say what to do. It says whom to tell.',
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
            ? 'A letter from the Havens, shorter than their letters usually are.\n\n'
              + `“The smoke of your works has been counted at ${data.smoke} parts. We do not `
              + 'ask you to stop. We are telling you what we are counting, and that we have '
              + 'begun to discuss among ourselves what the counting is for.”\n\n'
              + 'The Secretary notes that the Havens have never before mentioned a number.'
            : 'A letter from the Havens. It concerns the timetable, at length, and the '
              + 'condition of a bridge the Authority did not build.\n\n'
              + 'The last paragraph observes that no service of the Authority has called at '
              + 'a haven this quarter, and that the Elves had not expected one, and that they '
              + 'mention it only so that it is written down somewhere.',
            'bad', { chronicle: true });
          break;
        case 'elves_warn':
          s.note('The Havens have given notice. Not of a grievance — of a departure. The Authority is asked to note that the ships at the Grey Quays are being provisioned, and to draw its own conclusions, which it has.', 'grave', { chronicle: true });
          break;
        case 'elves_depart':
          s.note(
            'The Elves have gone from the Grey Quays. They went at dawn, without ceremony, and they took the lamps.\n\n'
            + 'The havens are standing empty and in good order. Nothing has been broken and nothing has been left behind except, at Lorindel, a single ticket, unpunched, for a journey the Authority does not run and cannot find in any timetable.\n\n'
            + 'Lore has been struck from the schedule of carried goods. There is no longer anywhere to carry it from.',
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
          s.note(`The sickness has reached ${data.to.name}. It came on the 9:20 from ${data.from.name}, in a carriage the Authority had cleaned and certified.`, 'bad');
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
          s.note('The section through Wodenholt is gone. The trees are back. They are the same trees, at the same ages, which the Authority\'s botanist confirms is not possible and has asked to stop being consulted about.', 'grave', { chronicle: true });
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
          s.note(`A sweating sickness has been reported at ${st.name}. The Surgeons are calling it a local matter. ${st.name} has a station, four services a day, and connections to eleven other places.`, 'bad', { chronicle: true });
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
          s.note(c ? c.text : (st.name + ' has stopped loading ore. The Delvers will not say why, and '
            + 'the Authority has been asked to move its rolling stock back a mile and to stop asking.'),
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
    title: 'The Consignment Was Delivered',
    tone: 'good',
    body: (s) => `The item reached Mount Wrack on the eastbound service, in a locked drawer, in the guard's van, under a docket describing it as "sundries".

What happened to it afterwards is not the Authority's concern and does not appear in the Authority's records. What appears in the Authority's records is that the consignment was collected at ${s.byId.get(s.errand?.from)?.name ?? 'its origin'}, carried ${Math.round(s.links.reduce((n, L) => n + L.length, 0))} units of line, transferred without loss, and signed for.

The Shadow in the east is gone. The Ashenreach services have been suspended pending a review of demand. Two hundred orkish season tickets have been refunded, which took longer than the war.

The Director is commended. The commendation is filed. Below it, in the same folder, is a note from the Traffic department observing that the trunk line was built to carry grain, and that on the one occasion it was asked to carry something else, it did.`,
  },
  lost_errand: {
    title: 'The Consignment Did Not Arrive',
    tone: 'grave',
    body: () => `The eastbound service was stopped between stations. The guard's van was opened. The drawer was opened.

There is no further entry.

The Authority's final act was to publish the winter timetable, which it did, on time, to a realm that had stopped needing one. It was a good timetable. Punctuality that quarter was ninety-one per cent, the best figure in the Authority's history, and there was nobody left to whom the figure could usefully be reported.`,
  },
  shadow: {
    title: 'The East Came West',
    tone: 'grave',
    body: (s) => `They came on the rails. Of course they came on the rails — it was the only sensible way to come, and the Authority had spent ${s.week} weeks making it sensible.

The trunk line held to the end. The engines ran, the signals worked, the couplings did not fail. Every part of the system the Authority was responsible for performed exactly as designed, at speed, in the wrong direction, carrying the wrong thing.

The last entry in the register is a request from the stationmaster at Brackenford for a replacement lamp. It was approved.`,
  },
  dismissed: {
    title: 'The Director Is Thanked For Their Service',
    tone: 'bad',
    body: (s) => `The Authority is overdrawn by an amount the Council has described in session as "creative".

The Director is thanked for their service. A pension has been calculated and, in view of the accounts, calculated again.

The railway remains. ${s.links.length} sections of line, ${s.connectedCount()} places joined to one another that were not joined before, and a tunnel under the Sundering Peaks that will be there when everyone who argued about it is not. The Council will appoint a successor who will be more careful with money and will build none of it.`,
  },
  concord: {
    title: 'Nobody Is Speaking To The Authority',
    tone: 'bad',
    body: () => `The Halflings have stopped signing for deliveries. The Delvers have withdrawn their engineers and, with them, the right to use their designs. The Havens are empty. The Council meets without inviting the Director and minutes the meetings as if it had.

The line is intact. Nothing is moving on it.

A railway is not track. A railway is an agreement about track, and the agreement has lapsed.`,
  },
  // ── the three ways Age III ends ────────────────────────────────────────
  held: {
    title: 'The Road Held',
    tone: 'good',
    body: (s) => `They came down the ${s.host?.fromName ?? 'eastern'} road at the speed the Authority had built it to carry, and at ${s.byId.get(s.host?.heartId)?.name ?? 'the heart of the realm'} they stopped.

Not defeated. Stopped. The blockhouses are standing, the cuttings are walled, and the Master of Works has walked the length of it twice and signed for it both times.

${s.connectedCount()} places are still joined to one another. ${Math.round(s.stats.loadsMoved)} loads have been carried, and a great many of them in the last four weeks were people.

The winter timetable is being drawn up. It will be provisional. Everything, the Secretary observes, is now provisional, and the Authority has decided that it can live with that.`,
  },
  sundered: {
    title: 'The Road Was Lifted',
    tone: 'grave',
    body: (s) => `The Authority tore up its own railway, working westward, ahead of the host, and it worked well. They are not coming any further, because there is nothing left to come down.

The rails are stacked beside the formation in ${s.host?.road?.length ?? 'several'} places. They have been counted. Nobody has said what they are to be used for.

${Math.round(s.stats.loadsMoved)} loads were carried before the lifting, over ${Math.round(s.stats.builtLength ?? 0) || 'many'} miles of road that the Authority surveyed, priced, built, eased and then took up with its own hands.

The Director's minute on the matter is one line: "It was the right thing and I would like it recorded that I did not want to."`,
  },
  overrun: {
    title: 'The East Came West Along the Line',
    tone: 'grave',
    body: (s) => `They reached ${s.byId.get(s.host?.heartId)?.name ?? 'the heart of the realm'} on the Authority's own metals, on time, at a speed the Authority had spent ${s.week} weeks and every crown it could raise making possible.

The last return filed from the office is a punctuality figure. It is the best one ever recorded.

${s.connectedCount()} places were joined. ${Math.round(s.stats.loadsMoved)} loads were carried. The road was good. The road was very good.`,
  },
  survived: {
    title: 'The Authority Continues',
    tone: 'good',
    body: (s) => `No crisis, this quarter. Receipts are up. The Shadow in the east is where it was, doing what it does, and the eastbound services run to it four times a day carrying grain, iron and, since the spring, tourists.

${s.connectedCount()} places are joined to one another. ${Math.round(s.stats.loadsMoved)} loads have been carried. The Greenhollow feeds mountains it has never seen. A halfling in Nether Wembly can be in Amonhal by dinner, and complains about the journey, which is how the Authority knows it has succeeded.

The winter timetable is at the printers. It is provisional.`,
  },
};
