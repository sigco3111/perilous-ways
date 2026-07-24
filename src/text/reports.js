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
const P = (c, fb) => (c && c.place) || fb || 'the halt';
const P2 = (c, fb) => (c && c.placeB) || fb || 'the junction';
const RG = (c, fb) => (c && c.regionName) || fb || 'the wilds';
const G = (c, fb) => (c && c.goodName) || fb || 'general merchandise';
const ref = (c) => `RTA/${1147 + R(c, 800)}`;
const UP = (s) => String(s || '').toUpperCase();

// Gazetteer pickers, for the pools the host gives no place name to.
const SHIRE = (c) => one(c, ['Nether Wembly', 'Great Nubbin', 'Hobb’s Bottom',
  'Little Snoring', 'Mossy Bottom', 'Widdershin', 'Pipwick', 'Cheddington Parva',
  'Sixpenny Handley', 'Marrowmead', 'Tuckham', 'Nobbottle']);
const DELVE = (c) => one(c, ['Dhurunzol', 'Anvilgate', 'Thrumhold', 'Baraz Deep',
  'Kalgarûn', 'Zhaddun', 'Karag-Vor', 'Grimbeard’s Delve', 'the Underforge']);
const HAVEN = (c) => one(c, ['Lorindel', 'Nimrothel', 'Aelinquë', 'Celedhil',
  'Mithravel', 'Silverhithe', 'Elenmar', 'Thalanor']);
const BURG = (c) => one(c, ['Brackenford', 'Stonemarch', 'Highholt', 'Westermark',
  'Dunhollow', 'Kingsbridge', 'Thornwatch', 'Eryndale', 'Rillbridge', 'Amonwell']);
const HOLD = (c) => one(c, ['Gorgobal', 'Uzgrath', 'Nardûk', 'Cinderhold',
  'Grimtooth', 'Ushnak', 'the Slagworks']);

// ---------------------------------------------------------------------------
// AMBIENT — the running life of the railway
// ---------------------------------------------------------------------------

export const AMBIENT = [
  // -- minutes ---------------------------------------------------------------
  {
    id: 'a_min_laid', form: 'minute', voice: 'authority', weight: 6,
    text: 'Board minute. Present: the Director; the Secretary; Traffic; Works, by his deputy. Apologies: the Master of Works, at a tunnel. Item 1: the accounts, laid. Item 2: the accounts, taken as read. Item 3: the fencing at Rillbridge. Item 4: the fencing at Rillbridge, second sheet. Resolved: that both sheets be held over.',
  },
  {
    id: 'a_min_seals', form: 'minute', voice: 'authority', weight: 5,
    text: 'Item 2: whether the Secretary’s seal or the District Engineer’s is to be set uppermost where a certificate requires both. The Secretary produced the standing order of the eleventh year. The District Engineer produced the standing order of the ninth, being earlier, and the Secretary’s, being later. Resolved: that the later order govern, and that the question be recorded as settled. It has been recorded as settled twice before.',
  },
  {
    id: 'a_min_week_one', form: 'minute', voice: 'authority', weight: 5,
    text: 'Item 5: which week is week one. The Authority’s year begins at Lady Day. The Greenhollow year begins at Yule and has two Lithes in the middle of it that the Authority’s year does not have at all. The Delvers reckon from the striking of the first ingot and will not say when that falls. Traffic asks only that the summer timetable be numbered from something. Resolved: that the numbering stand as printed. Item 6: deferred.',
  },
  {
    id: 'a_min_elberic', form: 'minute', voice: 'authority', weight: 5,
    text: 'Item 3: the Mirkholt fencing. Elberic the Grey was in the room for this item. He was not invited and he did not sit. He said the fence was in the wrong place. Asked in what respect, he left. Resolved: that the fence be moved. No grounds entered.',
  },
  {
    id: 'a_min_confidence', form: 'minute', voice: 'men', weight: 6,
    text: 'Minute of the Council at Amonhal, communicated. The Council requires that the eastern traffic be increased; that the smoke over Amonhal be reduced; that fares stand as they stand; and that the accounts be brought into surplus by Lady Day. The Council has every confidence. The Council has consulted its own minutes and does not find where the fourth of these was put to a vote.',
  },

  // -- letters ---------------------------------------------------------------
  {
    id: 'a_let_pud_11', form: 'letter', voice: 'halfling', weight: 6, kinds: ['shire'],
    text: 'To the Director. Sir. I write about the whistle for the eleventh time and I have kept every copy, and I mention that not to be disagreeable but so that you need not look them up.\n\nThe whistle is sounded at the crossing at twenty minutes past six. My hens are in the run at the top of the garden, which was my mother’s garden, and her people were Proudfoots out of Combe-under-Hill, who kept hens for four generations without one of them being frightened off the lay.\n\nI enclose a diagram. The bell is at A. The whistle is at B. The hens were at C.\n\nYrs &c, A. Puddifoot (Mistress)',
  },
  {
    id: 'a_let_ford_right', form: 'letter', voice: 'halfling', weight: 6, kinds: ['shire'],
    text: 'To the Authority. Sirs. Touching the right of way over the ford, my grandfather held it of his mother, who was a Bracegirdle, and it passed to my uncle Tolly on the understanding that it came back to our side of the family at his death, which it has, whatever the Tuckhams say about it. The Tuckhams are cousins on the wrong side of the marriage and were never in the deed.\n\nYour surveyor has driven a peg in the middle of it.\n\nI have not moved the peg. I am writing first, which is more than the Tuckhams would do.\n\n— Marmaduke Grubb, Buckleberry Ford',
  },
  {
    id: 'a_let_supper', form: 'letter', voice: 'halfling', weight: 6, kinds: ['shire'], tone: 'good',
    text: (c) => `To the Authority. My father walked to Amonhal for the Michaelmas market, four days out and four days home, and he did it forty times and thought nothing of it. I went on Tuesday and I was home for supper.\n\nI am not writing to complain. I did not know where else to write it down.\n\n— J. Nubbin, ${SHIRE(c)}`,
  },
  {
    id: 'a_let_etymology', form: 'letter', voice: 'halfling', weight: 5, kinds: ['shire'],
    text: 'To the Authority. The board at our halt is painted MOSSY BOTTOM. The name is Mossbotham, and was Mossbotham in the parish book before the Authority was thought of, mos being the moss and botham being the valley bottom and nothing to do with anybody’s bottom.\n\nThe Widdershin end holds that it is from Mosbaði, the mossy bath, on account of the spring. There is no spring. There has been no spring since my father’s time and I do not believe there was ever a bath.\n\nRepaint the board. Mossbotham. One word.\n\n— Cropp, parish clerk',
  },
  {
    id: 'a_let_crown_survey', form: 'letter', voice: 'men', weight: 5,
    text: 'From the Office of the King’s Surveyor, to the Railway Authority. Sirs. It has been represented to this Office that the Authority proposes to carry its road over the King’s water at Kingsbridge. The King’s water is crossed by leave and not by right. Leave is granted upon survey. Survey is made in the season after application, application being received in the season before. The Office is obliged to point out that the Authority applied in the same season, and that the Office is therefore not yet in a position to have received it.',
  },

  // -- wires -----------------------------------------------------------------
  {
    id: 'a_wire_snow', form: 'wire', voice: 'working', weight: 4, regions: [REG.FROSTMARCH],
    text: 'SNOW STOP THAT IS THE WHOLE WIRE STOP',
  },
  {
    id: 'a_wire_signal', form: 'wire', voice: 'working', weight: 5,
    text: (c) => `DOWN HOME AT ${UP(SHIRE(c))} WILL NOT COME OFF STOP HAVE CLIPPED IT AND AM WORKING BY HAND SIGNAL STOP SEND THE INSPECTOR IN THE MORNING NOT TONIGHT`,
  },
  {
    id: 'a_wire_bore_true', form: 'wire', voice: 'dwarf', weight: 5, kinds: ['delve'],
    text: 'BORE COMPLETE STOP TWELVE HUNDRED FEET STOP BOTH HEADINGS MET TRUE STOP THE STONE WAS SOUND STOP INVOICE FOLLOWS',
  },
  {
    id: 'a_wire_orc_count', form: 'wire', voice: 'orc', weight: 5, age: 2, kinds: ['hold'],
    text: 'CONSIGNMENT RECEIVED STOP COUNT CORRECT STOP SEALS CORRECT STOP WE HAVE NO COMPLAINT STOP SEND MORE STOP SAME DAY NEXT WEEK STOP WE WILL BE HERE',
  },

  // -- forms -----------------------------------------------------------------
  {
    id: 'a_form_measures', form: 'form', voice: 'authority', weight: 5,
    text: 'Return of distances, revised. Old measure: the Greenhollow mile, being the walk from a door to the next door but one, and reckoned generously in wet weather. New measure: the mile. Difference over the Nether Wembly branch: eleven chains. To be printed in the timetable: THE MILE. In use in the parish: THE OTHER.',
  },
  {
    id: 'a_form_saw', form: 'form', voice: 'working', weight: 5, tone: 'grave',
    text: 'Incident report. Time: 04:10. Weather: FINE. Visibility: EXCELLENT. Brakes: SOUND, TESTED SINCE. What the driver saw: HE HAS ASKED TO WRITE THIS PART HIMSELF AND HAS NOT YET DONE SO.',
  },
  {
    id: 'a_form_dwarf_cert', form: 'form', voice: 'dwarf', weight: 5, kinds: ['delve'],
    text: 'Weekly certificate of the working. Advance: 84 feet. Rock: SOUND. Water: A LITTLE, DRAINING. Timber standing: ALL OF IT. Men: FORTY-ONE. Men hurt: NONE. Powder used: 60 LB. Powder accounted: 60 LB. Signed, Bran son of Hafgar, deputy.',
  },
  {
    id: 'a_form_gauge', form: 'form', voice: 'authority', weight: 5,
    text: (c) => `Permanent way inspection, quarter ending. Miles walked: ${70 + R(c, 30)}. Gauge correct throughout. Ballast deficient: two miles above Rillbridge. Fencing deficient: none. Sleepers renewed: 240. Signed by the District Engineer and countersigned.`,
  },

  // -- invoices --------------------------------------------------------------
  {
    id: 'a_inv_thrain_tunnel', form: 'invoice', voice: 'dwarf', weight: 5,
    text: 'Ironmoot & Sons, per T. Ironmoot, Master of Works.\nTo driving one (1) tunnel not asked for: 240 crowns.\nTo the removal of the same: 40 crowns.\nTo the reinstatement of the same, on reflection: 240 crowns.\nTotal: 520 crowns. Terms: strict.',
  },
  {
    id: 'a_inv_lading_owl', form: 'invoice', voice: 'working', weight: 5,
    text: 'Bill of lading, down goods, Tuesday. Grain, forty sacks. Ale, nine barrels. Stone, two ton. Hurdles, eleven. Passengers, none booked, four carried. Owl, in a hat box, not ours, fed.',
  },
  {
    id: 'a_inv_orc_ashglass', form: 'invoice', voice: 'orc', weight: 5, age: 2, tone: 'grave',
    text: (c) => `Account of the eastern turn, rendered from ${HOLD(c)}.\nWagons in: 22. Wagons back: 22.\nOne wagon came back with the door broken. We broke it. Take it off the next payment and do not send anyone to talk about it.\nWe have put a crate of glass in with the empties for the guard who stayed out in the rain with the load. He did not ask for it. Give it to him.`,
  },
  {
    id: 'a_inv_halfling_teas', form: 'invoice', voice: 'halfling', weight: 5, kinds: ['shire'],
    text: 'Account rendered to the Authority by Mistress A. Puddifoot, of Nether Wembly.\nTo tea provided to your driver, four occasions: 4 pence.\nTo bread and dripping, the same occasions: 3 pence.\nTo a chair fetched out for him, no charge.\nTo the gate, left open by him twice and shut by me twice: no charge, but noted.\nI do not want the money. I want it on a piece of paper in your office that it was given.',
  },

  // -- notices ---------------------------------------------------------------
  {
    id: 'a_not_refreshment', form: 'notice', voice: 'authority', weight: 5, tone: 'plain',
    text: 'THE REFRESHMENT ROOM IS CLOSED. IT WAS NOT PROFITABLE. IT WAS LOVED.',
  },
  {
    id: 'a_not_east_waybill', form: 'notice', voice: 'authority', weight: 5, age: 2, tone: 'grave',
    text: 'EASTERN SERVICES. THIRD CLASS IS NOT ISSUED ON THIS ROAD. EVERY PASSENGER MUST BE NAMED UPON THE WAYBILL. THE WAYBILL IS COUNTED AT BOTH ENDS OF THE JOURNEY AND THE TWO COUNTS ARE SENT TO THIS OFFICE SEPARATELY.',
  },
  {
    id: 'a_not_haven_bell', form: 'notice', voice: 'elf', weight: 5, kinds: ['haven'], tone: 'grave',
    text: (c) => `The bell at ${HAVEN(c)} was rehung this week. It rings at dusk and at the turning of the tide, as it has rung. It is older than the road you have laid beneath it, and it is louder than your engines. We have measured both.`,
  },
  {
    id: 'a_not_amonhal_market', form: 'notice', voice: 'men', weight: 5, regions: [REG.MARCHLANDS],
    text: 'AMONHAL CENTRAL. BY ORDER OF THE CITY. THE CONCOURSE IS NOT A MARKET. PERSONS SELLING UPON IT WILL BE PUT OFF IT BY THE CITY AND NOT BY THE AUTHORITY. THE FISH SELLERS HAVE BEEN WRITTEN TO SEPARATELY AND AT LENGTH.',
  },

  // -- lines -----------------------------------------------------------------
  {
    id: 'a_line_nothing', form: 'line', voice: 'authority', weight: 5,
    text: 'Nothing has been reported this week.',
  },
  {
    id: 'a_line_coal', form: 'line', voice: 'authority', weight: 5,
    text: 'Coal stocks at Brackenford: adequate.',
  },
  {
    id: 'a_line_lorindel', form: 'line', voice: 'elf', weight: 4, kinds: ['haven'], tone: 'grave',
    text: (c) => `The lamps at ${HAVEN(c)} were lit late this week.`,
  },

  // -- margins ---------------------------------------------------------------
  {
    id: 'a_marg_printed', form: 'margin', voice: 'authority', weight: 5,
    text: 'In the margin of the winter timetable, in the Director’s own hand: “this cannot be done”. Beneath it, in the Secretary’s: “it has been printed”.',
  },
  {
    id: 'a_marg_amicable', form: 'margin', voice: 'working', weight: 5,
    text: 'The entry above reads “settled amicably”. Underneath, in a heavier hand: “Settled. Not amicably. I was there.”',
  },
  {
    id: 'a_marg_midsummer', form: 'margin', voice: 'authority', weight: 5, tone: 'grave',
    text: 'Against “no cause for concern”, in a third hand nobody in the office has identified: “ask again at midsummer”.',
  },
  {
    id: 'a_marg_elf_name', form: 'margin', voice: 'elf', weight: 4, kinds: ['haven'], tone: 'grave',
    text: 'Against the felling return, where the clerk has written “wood, unnamed”, there is a fair hand that is not the clerk’s. It has written the name of the wood. It has written nothing else.',
  },

  // -- verse -----------------------------------------------------------------
  {
    id: 'a_verse_willow', form: 'verse', voice: 'elf', weight: 3, kinds: ['haven'], tone: 'grave',
    text: 'Nine years the willow, ninety the oak,\none afternoon the saw.',
  },
  {
    id: 'a_verse_cost', form: 'verse', voice: 'elf', weight: 3, kinds: ['haven'], tone: 'grave',
    text: 'A claim, entered against the Authority, in a fair hand, upon paper that is not the Authority’s:\n\nFor the alder at the water’s edge, felled: one hundred and forty years.\nFor the heron that nested in it: nine seasons, and it will not return.\nFor the quiet: unmeasured.\n\nNo sum is named. The claim is filed every year, on the same day, by the same hand.',
  },
  {
    id: 'a_verse_doggerel', form: 'verse', voice: 'halfling', weight: 4, kinds: ['shire'],
    text: 'Oh the six-forty goes to Brackenford,\nand the six-forty comes back,\nand my uncle Tolly went up on her once\nand he did not care for the track.\n\nHe did not care for the tunnel,\nhe did not care for the fare,\nbut he had a very good dinner at Brackenford\nand he says they do well, up there.\n\n(Sung at the Green Man. Taken down by the stationmaster, who says there are nine more verses and they are all about the dinner.)',
  },

  // -- footnotes -------------------------------------------------------------
  {
    id: 'a_foot_tuesday', form: 'footnote', voice: 'authority', weight: 5,
    text: '‡ The 9:20 does not run on the second Tuesday. There is no second Tuesday in the working timetable. The arrangement is older than the working timetable and has been allowed to stand.',
  },
  {
    id: 'a_foot_ladyday', form: 'footnote', voice: 'authority', weight: 4,
    text: '* Sundays excepted. † Sundays included after Lady Day. ‡ Where * and † disagree, † is the later footnote and governs. § Where † and § disagree, see *.',
  },
  {
    id: 'a_foot_elevenses', form: 'footnote', voice: 'halfling', weight: 5, kinds: ['shire'],
    text: (c) => `‡ ${SHIRE(c)} reckons the day by meals and not by the clock, and the parish has asked that the timetable be printed accordingly. The Authority has printed the clock. Passengers are advised that the 11:20 is the one before elevenses and not the one after, and that the one after is the 11:20 as well, on Thursdays.`,
  },
  {
    id: 'a_foot_mail_precedence', form: 'footnote', voice: 'men', weight: 4,
    text: '§ Where the King’s mail and the Authority’s traffic contend for the road, the mail has precedence. Where the mail and a person of the King’s household contend, the mail has precedence. This was settled in the reign before this one and the Crown has not asked to have it settled again.',
  },

  // -- testimony -------------------------------------------------------------
  {
    id: 'a_test_downline', form: 'testimony', voice: 'working', weight: 5, tone: 'grave',
    text: '“I seen lamps go by on the down line, and I were stood on the down line. So they weren’t our lamps. That’s all I’ll put my name to.”\n\n— Driver Halloway, statement taken at Brackenford',
  },
  {
    id: 'a_test_goat', form: 'testimony', voice: 'working', weight: 6,
    text: '“She were stood in the four-foot, this goat, or something with a goat’s confidence about it, and she looked at me as though I were the one out of place. I give way. You do give way.”\n\n— Guard Pettifer',
  },
  {
    id: 'a_test_coal', form: 'testimony', voice: 'working', weight: 5,
    text: '“She were sluggish on the bank all week and I put it down to the coal. It were the coal. New lot come in Thursday and she went up like she used to. It come on to rain about then and all.”\n\n— Driver Mullet',
  },
  {
    id: 'a_test_cobb_snow', form: 'testimony', voice: 'working', weight: 5, age: 2, tone: 'grave',
    text: (c) => `“We come out the bore at ${DELVE(c)} and there’s the whole valley white with it, and my mate says that’s snow, and I says it’s not the season, and he says it’s snow, and we run through it eleven minutes and it weren’t snow. I don’t know what it were. I know it weren’t snow, because snow don’t —”\n\n— statement of Driver Cobb, taken at the enquiry. The witness did not complete the sentence and was not pressed.`,
  },
  {
    id: 'a_test_orc_better', form: 'testimony', voice: 'orc', weight: 5, age: 2, kinds: ['hold'], tone: 'plain',
    text: 'Taken down at the hold, at their asking, and sent on unaltered. “The train comes. We load it. It goes. Nothing is late. In the old way we carried the iron over the ash and half of it did not arrive, and we killed the ones who lost it, and still it did not arrive. This is better. Tell the ones who own the engines that we said it was better.”',
  },

  // -- returns ---------------------------------------------------------------
  {
    id: 'a_ret_arrived', form: 'return', voice: 'authority', weight: 6,
    text: (c) => {
      const run = 1180 + R(c, 90);
      return `Quarterly return. Services run: ${run}. Services arrived: ${run}. Services arrived at the timetabled station: ${run - 6}.`;
    },
  },
  {
    id: 'a_ret_lost', form: 'return', voice: 'working', weight: 6,
    text: (c) => `Lost property, quarter to Michaelmas: umbrellas ${30 + R(c, 20)}; swords 3; teeth, not human, one box; grey cloaks 9, identical; and one item the clerk has entered as “bell?” and locked in the safe.`,
  },
  {
    id: 'a_ret_signalmen', form: 'return', voice: 'authority', weight: 5,
    text: 'Signalmen on the register at the close of the year. Aldo Beck. Tam Beck. Wilfrid Chaffey. Hurd. Ianto Lowe. Merric Lowe. Osbert Nye. Padwick. Rook. Sallow the elder. Sallow the younger. Tarrow. Weatherby. Wick.\n\nFourteen boxes, fourteen men. No vacancy this year.',
  },
  {
    id: 'a_ret_fatal', form: 'return', voice: 'authority', weight: 5, tone: 'grave',
    text: 'Return of fatal accidents upon the works, year ending. Nine.\n\nCob Hardy, at the Rillbridge slip. Alder Pipp, at the Rillbridge slip. Nym, shunting. Dwalek son of Bruni, at the deep heading. Two men of the Nether Wembly gang, brothers, at the same slip as Hardy and Pipp. Two men of the eastern gang, whose names the contractor has not sent and has been asked for twice.\n\nAnd one not found.\n\nThe Authority has paid the burials.',
  },
  {
    id: 'a_ret_parish', form: 'return', voice: 'halfling', weight: 5, kinds: ['shire'],
    text: (c) => `Parish return, ${SHIRE(c)}, made up by the clerk as required and later than required, for which he is sorry.\n\nHouses: ${40 + R(c, 30)}. Households: the same, less two, there being two families sharing since the fire. Persons: 214. Persons in the parish who have now been on a train: 61. Persons who have been on a train twice: 61. Nobody has gone once.`,
  },

  // -- the rest of the ambient run -------------------------------------------
  {
    id: 'a_let_vurmath_siding', form: 'letter', voice: 'men', weight: 5, age: 2,
    text: 'To the Board. I have asked three times for a siding at my tower and for coal at the ordinary rate, and I am told that the ordinary rate is for ordinary customers. I have surveyed the branch myself: eleven miles, and easy the whole way.\n\nI should like the matter put to the Board at its next sitting, and I should like to be at the Board when it is put.\n\nVurmath, the White',
  },
  {
    id: 'a_form_halt_app', form: 'form', voice: 'halfling', weight: 5, kinds: ['shire'],
    text: (c) => `Application for a Halt. Name of place: ${UP(SHIRE(c))}. Population: ${60 + R(c, 90)}. Distance to the nearest halt: TWO MILES AND A HALF. Reason a halt is required: THE OTHER PLACE HAS ONE.`,
  },
  {
    id: 'a_test_gang_names', form: 'testimony', voice: 'working', weight: 5,
    text: '“You want to know who was on the length that night. Ives, ganger. Me. Young Rook. The two Becks. Padwick, who was supposed to be off. That is six and there should have been eight, and I will say to the enquiry what I said to the inspector, which is that six men cannot walk eleven miles of road in a night, and we did not.”\n\n— Lengthman Chaffey',
  },
  {
    id: 'a_not_whistle_law', form: 'notice', voice: 'authority', weight: 5, kinds: ['shire'],
    text: 'NOTICE TO PASSENGERS AND TO OCCUPIERS OF LAND. THE WHISTLE WILL BE SOUNDED AT THE LEVEL CROSSING BECAUSE THE LAW REQUIRES IT TO BE SOUNDED. COMPLAINTS TOUCHING THE WHISTLE ARE PROPERLY ADDRESSED TO THE LAW.',
  },
  {
    id: 'a_inv_demurrage', form: 'invoice', voice: 'working', weight: 5, tone: 'plain',
    text: (c) => `Demurrage account, ${BURG(c)} yard. ${G(c, 'Grain')}, forty loads, standing eleven days for want of a path: 22 crowns against the consignor, waived by the district. The consignor has written to say that he did not ask for it to be waived and would rather have had the path.`,
  },
  {
    id: 'a_marg_hafgar', form: 'margin', voice: 'dwarf', weight: 4, kinds: ['delve'], tone: 'grave',
    text: 'Against the entry for the deep heading, where the Authority has written “progress satisfactory”, in a hand cut rather than written: “Dwalek son of Bruni. Mile two. The sixth of ours in this rock.”',
  },
  {
    id: 'a_line_delve_quiet', form: 'line', voice: 'dwarf', weight: 4, kinds: ['delve'], tone: 'plain',
    text: 'The forges at the delve ran all week. Nothing to report and nothing owed.',
  },
  {
    id: 'a_ret_warm', form: 'return', voice: 'working', weight: 5, tone: 'grave',
    text: 'Weekly return, Brackenford. Trains booked in: 96. Trains booked out: 96. Trains standing in the yard at the close of business: 3. The stationmaster has been asked to reconcile these figures and has replied that he cannot, that all three are there, and that one of them is warm.',
  },
  {
    id: 'a_verse_doggerel_2', form: 'verse', voice: 'halfling', weight: 3, kinds: ['shire'],
    text: 'The Authority sent a gentleman down\nwith a chain and a pole and a hat,\nand he measured our lane and he measured our field\nand he would not be told where to sat.\n\nHe says it is fourteen and three-quarter mile\nfrom the Bottom to Brackenford town.\nWell it never was more than a morning before,\nand we shall not be writing that down.',
  },
  {
    id: 'a_line_resign', form: 'line', voice: 'authority', weight: 3,
    text: 'Nobody has resigned this week.',
  },
  {
    id: 'a_not_haven_notice', form: 'notice', voice: 'elf', weight: 4, kinds: ['haven'], tone: 'grave',
    text: 'The felling at the wood’s edge is finished. Eleven acres. We have counted them and we have written the count in our own book, where it will stay after your book is gone.',
  },
  {
    id: 'a_let_dwarf_grain', form: 'letter', voice: 'dwarf', weight: 5, kinds: ['delve'],
    text: 'To the Authority. The grain came on the ninth. It should have come on the second. We ate what was in the lower store and the lower store is now empty.\n\nWe have paid the account in full. We are not asking for the difference. We are telling you the date, so that it is on paper somewhere that we know it.',
  },
];

// ---------------------------------------------------------------------------
// REGIONAL — specific to one named land
// ---------------------------------------------------------------------------

export const REGIONAL = [
  // -- the Greenhollow -------------------------------------------------------
  {
    id: 'r_green_letter', form: 'letter', voice: 'halfling', weight: 5, regions: [REG.GREENHOLLOW],
    text: (c) => `To the Authority. Sirs. The excursion train on the last Sunday in the month comes in at half past ten, which is the hour of the service, and the whole of it walks up past the church, and some of them look in.\n\nWe do not mind them looking in. My aunt Rosamunda looked in at a church at Highholt once and nobody said anything to her about it.\n\nIt is the whistle at the crossing, which comes in the middle of the reading. If the excursion could be brought in at ten, or at eleven, or on the Saturday, the parish would be obliged. If it cannot, the parish will move the reading, but there will be talk about who moved it and I would rather it were you.\n\n— Odo Bramble, churchwarden, ${SHIRE(c)}`,
  },
  {
    id: 'r_green_peril', form: 'form', voice: 'authority', weight: 5, regions: [REG.GREENHOLLOW],
    text: 'Peril assessment, the Greenhollow. Wights: NONE. Wolves: NONE. Bandits: NONE. Ill report of any kind in living memory: NONE. Assessor’s remarks: I HAVE CHECKED TWICE.',
  },
  {
    id: 'r_green_test', form: 'testimony', voice: 'working', weight: 5, regions: [REG.GREENHOLLOW],
    text: '“It is the easiest road on the system and I will say that to anybody. Level, fenced, six halts and a well at every one of them. They bring you things. You have to watch the crossings at haymaking and that is the whole of it. It has been fine all month.”\n\n— Driver Halloway',
  },
  {
    id: 'r_green_foot', form: 'footnote', voice: 'authority', weight: 5, regions: [REG.GREENHOLLOW],
    text: (c) => `† Greenhollow halts are worked on request between the turn of the year and Lady Day. Request stops in the last quarter: ${180 + R(c, 60)}. Booked stops in the same quarter: 96. Both figures are correct and the district has been asked not to submit them on one sheet again.`,
  },
  {
    id: 'r_green_marg', form: 'margin', voice: 'halfling', weight: 5, regions: [REG.GREENHOLLOW],
    text: 'On the Authority’s deposited plan, against the field the surveyor has marked as waste, in a round parish hand: “this is not waste. This is Bramble’s. It has been Bramble’s since the old Bramble, and there is a Bramble in it now, and if you go and look you will see him.”',
  },

  // -- the Grey Quays --------------------------------------------------------
  {
    id: 'r_quays_verse', form: 'verse', voice: 'elf', weight: 5, regions: [REG.QUAYS], tone: 'grave',
    text: 'The tide at Mithravel turns twice in the day, and has turned so since before there was a reckoning to count it in.\n\nThe Authority’s timetable gives four workings to the Quays on weekdays and two upon the Sabbath. We have set the four against the tides. They do not agree with the tides.\n\nNobody who is sailing has need of a train at ten past four.',
  },
  {
    id: 'r_quays_sailings', form: 'return', voice: 'working', weight: 5, regions: [REG.QUAYS], tone: 'grave',
    text: 'Sailings from the Grey Quays this quarter: 4. Vessels returning: 0. The clerk has queried the second figure and has been told to leave the column in, and to keep leaving it in.',
  },
  {
    id: 'r_quays_notice', form: 'notice', voice: 'authority', weight: 5, regions: [REG.QUAYS], tone: 'grave',
    text: 'PASSENGERS FOR THE LAST QUAY. THERE IS NO RETURN FARE. THIS IS NOT AN OMISSION IN THE TARIFF.',
  },

  // -- the Barrowdowns -------------------------------------------------------
  {
    id: 'r_barrow_moon', form: 'line', voice: 'authority', weight: 6, regions: [REG.BARROWDOWNS],
    text: 'The Barrowdowns section is closed until the moon changes.',
  },
  {
    id: 'r_barrow_letting', form: 'testimony', voice: 'working', weight: 5, regions: [REG.BARROWDOWNS], tone: 'grave',
    text: '“It’s not that they stop you. They let you by. It’s the letting I don’t care for.”\n\n— Driver Sallow, night goods',
  },
  {
    id: 'r_barrow_spoil', form: 'minute', voice: 'authority', weight: 5, regions: [REG.BARROWDOWNS],
    text: 'Item 3: the Barrowdowns earthworks. Works reports the spoil heap smaller every morning by about a barrow-load. Resolved: that the spoil be counted. Item 4: who is to count it, and when. Deferred.',
  },

  // -- Elderwood -------------------------------------------------------------
  {
    id: 'r_elder_thrushes', form: 'verse', voice: 'elf', weight: 5, regions: [REG.ELDERWOOD], tone: 'grave',
    text: 'The felling in Elderwood is entered by the Authority’s measure: forty loads, and forty paid for.\n\nBy ours the wood is Eryn Lathrieth, and was called nothing before that, there being nobody yet to call it. The thrushes came late and have nested in the same nine beeches for as long as we have kept the count.\n\nTwo of the nine are sleepers under your line at mile eleven.',
  },
  {
    id: 'r_elder_fortyone', form: 'margin', voice: 'elf', weight: 5, regions: [REG.ELDERWOOD], tone: 'grave',
    text: 'Beside “timber, forty loads, Elderwood”, in a fair hand that is not the clerk’s: “forty-one”.',
  },
  {
    id: 'r_elder_halted', form: 'wire', voice: 'working', weight: 5, regions: [REG.ELDERWOOD], tone: 'grave',
    text: 'HAVE HALTED FELLING AT MILE NINE STOP NOT ORDERED TO STOP DID NOT WANT TO GO ON STOP WILL EXPLAIN IN PERSON',
  },

  // -- the Marchlands --------------------------------------------------------
  {
    id: 'r_march_levy', form: 'invoice', voice: 'men', weight: 5, regions: [REG.MARCHLANDS],
    text: 'Account of the King’s Levy upon the works.\nTo the Crown, for leave to cross the King’s water: 60 crowns.\nTo the Crown, for leave to cross it back: 60 crowns.\nTo the King’s Surveyor, for certifying that it is the same water: 15 crowns.\nTotal: 135 crowns.',
  },
  {
    id: 'r_march_clock', form: 'minute', voice: 'men', weight: 5, regions: [REG.MARCHLANDS],
    text: 'Minute of the Common Council of Amonhal, touching the clock upon the new station. Resolved: that the clock be permitted. Resolved: that it be set no higher than the clock upon the Guildhall, the Guildhall being the elder foundation. Resolved: that the Authority be informed of the second resolution and not of the reasons for it. Resolved: that the matter be reported to the Chamberlain, who is abroad.',
  },
  {
    id: 'r_march_ninehundred', form: 'testimony', voice: 'working', weight: 5, regions: [REG.MARCHLANDS], age: 2, tone: 'grave',
    text: '“We took nine hundred men east in a day and a half. My grandfather took a fortnight to get to Stonemarch. Nine hundred men, a day and a half. I keep saying it over because it don’t sound right when I say it.”\n\n— Guard Ansel, troop special',
  },

  // -- Mirkholt --------------------------------------------------------------
  {
    id: 'r_mirk_coat', form: 'wire', voice: 'working', weight: 6, regions: [REG.MIRKHOLT], tone: 'grave',
    text: 'SOMETHING IN THE WEBS AT MILE FOURTEEN STOP NOT AN ANIMAL STOP IT IS WEARING A COAT STOP SEND TWO MEN NOT ONE',
  },
  {
    id: 'r_mirk_dusk', form: 'footnote', voice: 'authority', weight: 5, regions: [REG.MIRKHOLT],
    text: '‡ Mirkholt services do not run after dusk. Dusk is determined by the driver, and the driver is not to be argued with.',
  },
  {
    id: 'r_mirk_lamps', form: 'return', voice: 'working', weight: 5, regions: [REG.MIRKHOLT],
    text: 'Lamp account, Mirkholt section. Issued: 40. Returned: 12. Returned still burning, having been three weeks in the wood: 1.',
  },

  // -- Wodenholt -------------------------------------------------------------
  {
    id: 'r_woden_letter', form: 'letter', voice: 'authority', weight: 5, regions: [REG.WODENHOLT],
    text: 'Received this week, in one sheet, nine feet long, in bark:\n\n“To - the - Authority. We - have - considered - your - letter - of - the - spring. We - are - considering - it - still. Do - not - write - again - before - the - leaf - fall.”\n\nThe Secretary has replied. The Secretary has since been advised that a reply was not asked for.',
  },
  {
    id: 'r_woden_fourth_year', form: 'line', voice: 'authority', weight: 5, regions: [REG.WODENHOLT],
    text: 'The Wodenholt hearing entered its fourth year this week.',
  },
  {
    id: 'r_woden_court', form: 'form', voice: 'men', weight: 5, regions: [REG.WODENHOLT],
    text: 'Return of the King’s Court upon the Wodenholt reference. Sittings this year: 2. Sittings adjourned: 2. Grounds of the first adjournment: THE PARTY WAS NOT PRESENT. Grounds of the second: THE PARTY WAS PRESENT AND HAD NOT FINISHED. Next sitting: NOT FIXED. Costs to date: BORNE BY THE AUTHORITY.',
  },

  // -- the Sundering Peaks ---------------------------------------------------
  {
    id: 'r_peaks_thrain', form: 'invoice', voice: 'dwarf', weight: 5, regions: [REG.PEAKS],
    text: 'Ironmoot & Sons.\nTo one pass, surveyed, at the Authority’s instruction: 40 crowns.\nTo one tunnel, surveyed instead, at nobody’s instruction: 120 crowns.\nTo the plan of the tunnel, kept in this office against the day the Authority asks for it: nil.',
  },
  {
    id: 'r_peaks_bore', form: 'testimony', voice: 'working', weight: 5, regions: [REG.PEAKS],
    text: '“Up over the pass you can see both halves of the world at once and you don’t want to. Give me a bore. You know where you are in a bore.”\n\n— Driver Mull',
  },
  {
    id: 'r_peaks_cert', form: 'form', voice: 'dwarf', weight: 5, regions: [REG.PEAKS],
    text: 'Certificate of the summit works. Height above the sea: 4,180 feet. Ruling gradient: 1 IN 34. Curvature, sharpest: 9 CHAINS. Masonry: DRY, NO MORTAR, AS SPECIFIED. Frost damage after two winters: NONE. It will stand.',
  },

  // -- the Frostmarch --------------------------------------------------------
  {
    id: 'r_frost_return', form: 'return', voice: 'working', weight: 5, regions: [REG.FROSTMARCH], tone: 'good',
    text: 'Frostmarch return, month of the thaw. Days the line was open: 31. Days the line was clear: 9. Days a train ran: 31.',
  },
  {
    id: 'r_frost_watch', form: 'letter', voice: 'men', weight: 5, regions: [REG.FROSTMARCH], tone: 'plain',
    text: 'To the Authority. We do not need a station. We need the train to slow at the beacon, and we will do the rest. We have been doing the rest for two hundred years.\n\n— the Watch at Coldfell',
  },
  {
    id: 'r_frost_drift', form: 'line', voice: 'working', weight: 5, regions: [REG.FROSTMARCH],
    text: 'The line drifted over above Northkeep on the Tuesday and was open again by the Friday. Four men and two shovels each.',
  },

  // -- the Weeping Marsh -----------------------------------------------------
  {
    id: 'r_weep_sunk', form: 'wire', voice: 'working', weight: 5, regions: [REG.WEEPING],
    text: 'CAUSEWAY DOWN AGAIN STOP NOT WASHED OUT STOP SUNK STOP SAME PLACE SAME DEPTH STOP SEND PILES',
  },
  {
    id: 'r_weep_piles', form: 'form', voice: 'authority', weight: 5, regions: [REG.WEEPING],
    text: 'Ground condition, the Weeping Marsh. Bearing: NONE. Remedy: PILES. Depth of piles required: NOT YET DETERMINED. Depth driven to date: NINETY FEET. Bottom: NOT YET.',
  },
  {
    id: 'r_weep_invoice', form: 'invoice', voice: 'dwarf', weight: 5, regions: [REG.WEEPING],
    text: 'Ironmoot & Sons, for work in the marsh.\nPiles, nine thousand, driven: 2,700 crowns.\nBrushwood, four hundred loads, sunk: 160 crowns.\nWaiting on the tide, six days: 90 crowns.\nWe do not warrant work in water. We have said so before and it is on the estimate.\nTotal: 2,950 crowns.',
  },

  // -- the Ashenreach --------------------------------------------------------
  {
    id: 'r_ash_letter', form: 'letter', voice: 'orc', weight: 5, regions: [REG.ASHENREACH], age: 2, tone: 'grave',
    text: 'This is not a letter. It is a count.\n\nIron, forty ton, in. Coal, sixty ton, in. Timber, twenty ton, in. Ashglass, twelve crates, out. Nine hundredweight. Weighed at both ends.\n\nYour guard asked what the glass is for. We told him. He wrote down something else.',
  },
  {
    id: 'r_ash_minute', form: 'minute', voice: 'authority', weight: 5, regions: [REG.ASHENREACH], age: 2, tone: 'grave',
    text: 'Item 1: the eastern accounts. Read, and admired. Item 2: the eastern accounts again, at the Secretary’s request, aloud, slowly. Item 3: none. The Board adjourned early, and left separately.',
  },
  {
    id: 'r_ash_best_year', form: 'margin', voice: 'authority', weight: 5, regions: [REG.ASHENREACH], age: 2, tone: 'grave',
    text: 'Against the eastern receipts, in the Director’s hand: “the best year the Authority has ever had”. Underneath, the same hand, later ink: “yes”.',
  },
];

// ---------------------------------------------------------------------------
// CROSSING — the big moments. A page in a book, not a status line.
// ---------------------------------------------------------------------------

export const CROSSING = {
  first_bridge: [
    {
      id: 'x_bridge_minute', form: 'minute', voice: 'authority', tone: 'good',
      text: 'Item 1: the bridge over the Silverflood, declared open. The Director spoke for four minutes. The King’s brother spoke for twenty. Thrain Ironmoot, invited to speak, instead walked out onto the middle span, stood there while the 2:10 went over him at speed, came back, and said that it would do. Resolved: that this be entered as the Master of Works’ remarks in full.',
    },
    {
      id: 'x_bridge_test', form: 'testimony', voice: 'working', tone: 'good',
      text: '“You want to know what it’s like. It’s like nothing. That’s the trick of it. You’re on the bank, and then you’re over four hundred foot of water, and then you’re on the other bank, and you’ve not felt a thing and neither has the tea. My father swam cattle across there. I keep thinking about my father.”\n\n— Driver Halloway, first booked crossing',
    },
    {
      id: 'x_bridge_invoice', form: 'invoice', voice: 'authority', tone: 'good',
      text: 'Final account, the Silverflood bridge.\nTo ironwork, six spans: 1,900 crowns.\nTo masonry, two piers: 740 crowns.\nTo the coffer dam, twice: 480 crowns.\nTo a boy named Wren, who went down with the second dam and came up again, and is to have a place in the works for life: 12 crowns weekly, in perpetuity.\nThe Authority is not to query the last item.',
    },
  ],
  first_bore: [
    {
      id: 'x_bore_letter', form: 'letter', voice: 'dwarf', tone: 'good',
      text: 'To the Director. It is through. The headings met within the thickness of a hand. You will be told that this is remarkable. It was arithmetic.\n\nThe east gang and the west gang have shaken hands and will not work together again, each having decided the other was late.\n\nSend the second one.\n\nT. Ironmoot, Master of Works',
    },
    {
      id: 'x_bore_line', form: 'line', voice: 'authority', tone: 'good',
      text: 'The Sundering Peaks no longer sunder anything, and the Delvers have not once stopped saying so.',
    },
    {
      id: 'x_bore_notice', form: 'notice', voice: 'authority', tone: 'good',
      text: 'PASSENGERS ARE ADVISED THAT THE TUNNEL TAKES ELEVEN MINUTES. LAMPS WILL BE LIT THROUGHOUT. THE SINGING IS THE GANGS AND IS NOT INCLUDED IN THE FARE.',
    },
  ],
  first_pass: [
    {
      id: 'x_pass_test', form: 'testimony', voice: 'working', tone: 'good',
      text: '“No bore, no gallery, nothing over our heads but the sky and whatever the sky was doing. We went up the zigzags with two engines and a third pushing, and at the summit the fireman took his cap off. I never asked him why and he never said.”\n\n— Driver Mull, the first over the pass',
    },
    {
      id: 'x_pass_form', form: 'form', voice: 'dwarf', tone: 'good',
      text: 'Certificate of the summit line. Height above the sea: 4,180 feet. Ruling gradient: 1 IN 34. Method of construction: NONE OF THE USUAL. Master of Works’ remarks, appended at his insistence: A TUNNEL WOULD HAVE BEEN BETTER. Countersigned nonetheless.',
    },
  ],
  first_marsh: [
    {
      id: 'x_marsh_wire', form: 'wire', voice: 'working', tone: 'good',
      text: 'CAUSEWAY HOLDING STOP ELEVEN DAYS NOW STOP HAVE STOPPED HOLDING OUR BREATH STOP BEGIN BOOKING TRAFFIC',
    },
    {
      id: 'x_marsh_invoice', form: 'invoice', voice: 'authority',
      text: 'Account of the Weeping Marsh crossing.\nTo nine thousand piles, driven: 2,700 crowns.\nTo four hundred loads of brushwood, sunk: 160 crowns.\nTo one locomotive, sunk, recovered: 90 crowns.\nTo one locomotive, sunk, not recovered, now part of the causeway and carrying trains over itself daily: nil.\nTotal: 2,950 crowns.',
    },
    {
      id: 'x_marsh_foot', form: 'footnote', voice: 'authority',
      text: '† The marsh crossing is walked and inspected every week, and will be for as long as there is an Authority. This is not a precaution. It is the arrangement under which the marsh permits it.',
    },
  ],
  first_wood: [
    {
      id: 'x_wood_minute', form: 'minute', voice: 'authority',
      text: 'Item 2: the Mirkholt road, opened. Traffic asks whether it may be timetabled at night. Works says no. Traffic asks on what grounds. Works says on the grounds that he has been in there at night. Resolved: daylight working only, no reason to be entered in the register.\nItem 3: deferred, as ever.',
    },
    {
      id: 'x_wood_margin', form: 'margin', voice: 'working', tone: 'grave',
      text: 'The entry above records the Mirkholt line as complete, thirty-one miles, no lives lost. Beneath it, in the surveyor’s hand: “no lives lost belonging to us”.',
    },
  ],
  first_east: [
    {
      id: 'x_east_notice', form: 'notice', voice: 'authority', tone: 'grave',
      text: 'THE EASTERN ROAD IS OPEN. FIRST CLASS AND SECOND CLASS ONLY. THERE IS NO THIRD CLASS ON THIS SERVICE AND PASSENGERS ARE ASKED NOT TO ENQUIRE WHY.',
    },
    {
      id: 'x_east_verse', form: 'verse', voice: 'elf', tone: 'grave',
      text: 'You have brought iron over the Sundering Peaks, which were Aeglonath while they were ours to name.\n\nElberic of the Havens crossed it afoot in the spring of the year our reckoning gives as one thousand two hundred and four. He lost two of his company upon the col and cut their names into the stone at the summit.\n\nYour engineers have taken that stone for the abutment of the viaduct. It is a good stone. It was always a good stone.',
    },
    {
      id: 'x_east_return', form: 'return', voice: 'authority', tone: 'grave',
      text: 'Abstract, the first eastern week. Loads east: 44. Loads west: 61. Receipts: 9,400 crowns, against a weekly average of 1,100. Smoke: up. Every column in this return is the best column the Authority has ever entered. The Secretary has asked whether there is a form for reporting a record and regretting it on the same sheet.',
    },
  ],
  first_wrack: [
    {
      id: 'x_wrack_line', form: 'line', voice: 'authority', tone: 'grave',
      text: 'The line reached Mount Wrack on a Tuesday, at 4:20, eight minutes early.',
    },
    {
      id: 'x_wrack_test', form: 'testimony', voice: 'working', tone: 'grave',
      text: '“They was waiting on the platform. Not a crowd, mind. Drawn up. Somebody had chalked the road where each carriage was to stop, and they’d got it right, every one, and we had never sent them the lengths.”\n\n— Guard Weatherby, eastern turn',
    },
    {
      id: 'x_wrack_form', form: 'form', voice: 'orc', tone: 'grave',
      text: 'Sent down from the hold on the Authority’s own paper, filled in throughout.\n\nName of station: WRACK. Platform, length: 240 FEET, CHALKED. Water: YES. Coal: YES, OURS. Persons to meet the train: NAMED ON THE BACK. Persons to travel: NONE YET. Remarks: WE HAVE READ THE TIMETABLE. IT IS A GOOD TIMETABLE. WE WILL KEEP TO IT.',
    },
  ],
  first_quays: [
    {
      id: 'x_quays_verse', form: 'verse', voice: 'elf', tone: 'grave',
      text: 'Iron to the shore, then. The ships at the Quays are seven. They were seventy. Before that there was no counting them, they not being for going away in.\n\nMaster Celebrin has asked whether the Authority will want the quay-stone afterward. He is told there is no afterward in the estimates.',
    },
    {
      id: 'x_quays_letter', form: 'letter', voice: 'elf', tone: 'grave',
      text: 'To the Director. The rails are at the water now. We have walked the length of them. The work is good work and the last hundred yards are the best of it — the curve onto the quay especially, which was hard, and which your man Aelfward solved with a transition we had not seen before.\n\nWe are asked whether we are content. We are not content. Both things are true and the Authority may enter them in whichever column it keeps for such.\n\nFor the Havens, Celebrin',
    },
    {
      id: 'x_quays_foot', form: 'footnote', voice: 'authority', tone: 'grave',
      text: '* Tickets to the Grey Quays are issued single or return at the passenger’s discretion. The Authority has been asked to stop printing the return half and has declined, printing costing nothing.',
    },
  ],
  deep_bore_1: [
    {
      id: 'x_deep1_wire', form: 'wire', voice: 'dwarf', tone: 'grave',
      text: 'AT MILE THREE UNDER THE PEAKS STOP THERE IS AIR COMING OUT OF THE FACE STOP COLD AIR MOVING STEADY STOP WE ARE THE ONLY WORKING IN THIS ROCK STOP CONFIRM WE ARE THE ONLY WORKING IN THIS ROCK',
    },
    {
      id: 'x_deep1_form', form: 'form', voice: 'dwarf', tone: 'grave',
      text: 'Deep working, weekly certificate. Depth from the adit: 3.1 MILES. Rock: SOUND. Water: NONE. Ventilation required: NO. Ventilation observed: YES. Direction of flow: OUT. Source: NOT ESTABLISHED. Signed by the deputy, who has added, unasked: I HAVE PUT MY CANDLE TO IT AND IT LEANS.',
    },
  ],
  deep_bore_2: [
    {
      id: 'x_deep2_test', form: 'testimony', voice: 'working', tone: 'grave',
      text: '“We took the last of the loose stuff out and it weren’t rock behind it. It were dressed. Jambs, lintel, the lot, and a lintel is a made thing, you can’t argue with a lintel. Old work. Older than their old work. Thrain come down and put his hand flat on it and stood a long while and then he says, well.\n\nHe don’t say well.”\n\n— Deputy Bran, deep working',
    },
    {
      id: 'x_deep2_minute', form: 'minute', voice: 'authority', tone: 'grave',
      text: 'Item 4: the door beneath the Peaks. Works has surveyed it: eleven feet, dressed stone, no hinge found, no inscription in any hand the Delvers read. Traffic asks whether the heading may be turned to go around it. Works says it may, at 400 crowns. The Director asks what going through would cost. Nobody answers, and the Secretary has minuted the silence, there being nothing else to minute.\nItem 5: deferred.',
    },
  ],
  deep_bore_3: [
    {
      id: 'x_deep3_wire', form: 'wire', voice: 'working', tone: 'grave',
      text: 'DOOR IS OPEN STOP WE DID NOT OPEN IT STOP GANG OF NINE WENT IN AT SIX STOP NINE CAME OUT STOP COUNT AGAIN STOP NINE CAME OUT STOP I HAVE COUNTED FOUR TIMES AND IT IS NINE AND I HAVE WORKED WITH ALL OF THEM TWENTY YEAR AND I DO NOT KNOW ONE OF THEM STOP SEALING THE HEADING TONIGHT WITHOUT ORDERS STOP DO NOT COUNTERMAND',
    },
    {
      id: 'x_deep3_margin', form: 'margin', voice: 'authority', tone: 'grave',
      text: 'The register entry reads, in full: “Deep heading, mile 3.1. Sealed with rubble and lime. 400 crowns. Charge to contingencies.”\n\nBeneath it there is a second hand. Small, pencil, a script the office does not use:\n\n“thank you”',
    },
  ],
  dragon_wakes: [
    {
      id: 'x_dragon_wire', form: 'wire', voice: 'working', tone: 'grave',
      text: (c) => `DELVE AT ${UP(P(c, DELVE(c)))} STOP DO NOT SEND THE 5:40 STOP DO NOT SEND ANYTHING STOP HEAT IN THE ADIT UP FORTY DEGREE SINCE NOON STOP THE DWARVES HAVE STOPPED WORK STOP THEY HAVE NEVER ONCE STOPPED WORK`,
    },
    {
      id: 'x_dragon_notice', form: 'notice', voice: 'authority', tone: 'grave',
      text: 'ALL SERVICES TO THE DELVE ARE CANCELLED. PASSENGERS HOLDING TICKETS WILL BE REFUNDED IN FULL. PASSENGERS ARE NOT TO GO AND LOOK.',
    },
    {
      id: 'x_dragon_line', form: 'line', voice: 'dwarf', tone: 'grave',
      text: 'The Dwarves are coming up. All of them. They are bringing nothing with them.',
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
      text: 'ROCK ON THE ROAD AT MILE SEVEN STOP TWO WAGON LOADS OF IT STOP HAVE SENT FOR THE GANG STOP WILL WIRE WHEN THE ROAD IS CLEAR',
    },
    {
      id: 'i_b_form_tree', form: 'form', voice: 'authority', weight: 6,
      text: (c) => `Obstruction report. Section: ${RG(c)}. Nature: TREE. Was the tree felled: NO. Was the tree there yesterday: NO. Ref ${ref(c)}.`,
    },
    {
      id: 'i_b_test_wall', form: 'testimony', voice: 'working', weight: 5, tone: 'grave',
      text: '“I come round the curve and there was a wall across the road where no wall is. Not fell there. Built. Coursed, and capped along the top. I had her stopped inside ninety yards and I do not know how I did it.”\n\n— Driver Sallow',
    },
    {
      id: 'i_b_notice_cart', form: 'notice', voice: 'authority', weight: 6, tone: 'bad',
      text: 'THE LINE IS BLOCKED. THERE IS NO REPLACEMENT SERVICE. THERE IS A CART. THE CART IS NOT OURS AND THE CARTER’S PRICES ARE HIS OWN.',
    },
    {
      id: 'i_b_margin_cleared', form: 'margin', voice: 'working', weight: 5,
      text: 'Against “obstruction cleared, line reopened”, in the gangers’ hand: “cleared to one side. Still there.”',
    },
    {
      id: 'i_b_minute_held', form: 'minute', voice: 'authority', weight: 5,
      text: (c) => `Item 6: the ${RG(c)} obstruction. Works reports the road clear. Traffic reports the road clear. The permanent way inspector declines to report and has asked that the item be held over. Held over.`,
    },
    {
      id: 'i_b_foot_longway', form: 'footnote', voice: 'authority', weight: 5,
      text: '† While the section is closed, passengers travel the long way round and are charged the short way’s fare. Excess collected on this account this week: nil. The excess clerk has been told, twice.',
    },
    {
      id: 'i_b_line_standing', form: 'line', voice: 'working', weight: 6, tone: 'grave',
      text: 'Something is standing in the cutting. It has been there since Thursday.',
    },
    {
      id: 'i_b_invoice_ganger', form: 'invoice', voice: 'working', weight: 5,
      text: 'Ganger’s account, clearing the road.\nLabour, nine men, two days: 18 crowns.\nPowder: 4 crowns.\nOne crowbar, replaced, the first having been taken: 1 crown.\nAle, at the ganger’s discretion and the Authority’s expense: 3 crowns.',
    },
    {
      id: 'i_b_return_weather', form: 'return', voice: 'authority', weight: 6, tone: 'bad',
      text: 'Delay attribution. Cause: obstruction. Minutes lost: 340. Minutes attributed to the permanent way: 0. Minutes attributed to weather: 340. Weather that day: fine.',
    },
    {
      id: 'i_b_letter_cart', form: 'letter', voice: 'halfling', weight: 5, kinds: ['shire'], tone: 'bad',
      text: (c) => `To the Authority. Sirs. The road being shut, the carrier’s cart is going again, and I have had two people in my kitchen this week telling me that the cart was always good enough for their fathers.\n\nThe cart was not good enough for their fathers. Their fathers complained about the cart. I have heard them do it, in this kitchen, at that table.\n\nGet the road open before the argument settles the other way.\n\n— Mistress A. Puddifoot, ${SHIRE(c)}`,
    },
  ],
  beast: [
    {
      id: 'i_a_test_order', form: 'testimony', voice: 'working', weight: 6, tone: 'grave',
      text: '“You don’t stop. Whatever is on the road you don’t stop, that is the standing order and it is the right order, and I want it minuted that I kept to it. Because I could hear the brake van. And I kept to it.”\n\n— Driver Cobb',
    },
    {
      id: 'i_a_wire_wargs', form: 'wire', voice: 'working', weight: 6,
      text: 'WARGS ON THE UP ROAD AT DUSK STOP RAN THROUGH THEM STOP THEY DID NOT SCATTER STOP THEY STEPPED ASIDE AND WATCHED US BY STOP PUTTING IT IN THE BOOK BECAUSE I SAID I WOULD',
    },
    {
      id: 'i_a_invoice_van', form: 'invoice', voice: 'authority', weight: 5,
      text: 'Claim, brake van No. 14.\nTo the van, written off: 60 crowns.\nTo the guard’s lamp, hat and dinner: 2 crowns.\nTo the guard, one week at his own hearth on full pay, allowed by the Director without reference to the Council: 3 crowns.',
    },
    {
      id: 'i_a_form_couplings', form: 'form', voice: 'authority', weight: 6, tone: 'grave',
      text: 'Loss report. Vehicle: ONE WAGON, ORE. Where lost: THE VIADUCT. Manner of loss: TAKEN. Couplings: UNDONE. Couplings damaged: NO. Remarks of the loss adjuster: I WOULD RATHER THEY HAD BEEN BROKEN.',
    },
    {
      id: 'i_a_return_alongside', form: 'return', voice: 'authority', weight: 5,
      text: 'Livestock and traction return. Horses conveyed: 40. Dogs: 12. Hawks: 4. Beasts conveying themselves alongside the 4:15 for eleven miles at speed: 1.',
    },
    {
      id: 'i_a_letter_sister', form: 'letter', voice: 'halfling', weight: 6, tone: 'bad',
      text: (c) => `To the Authority. Sirs. I was to meet my sister Daisy off the 4:15 at ${P2(c, BURG(c))} on Thursday. I had a basket with me and I had made up her room.\n\nThe 4:15 came in. It had the engine and the coal and a smell in it, and the guard would not open the doors, and there was nobody to get off.\n\nI have asked at the booking office and they were very kind and they did not know anything. I am to be told, in writing, by somebody whose name is on the letter, whether I am to wait for the next one.\n\n— Mrs Ferrers-Bolger, at her brother’s house, Marrowmead`,
    },
    {
      id: 'i_a_notice_windows', form: 'notice', voice: 'authority', weight: 5,
      text: 'PASSENGERS ARE ASKED TO KEEP THE WINDOWS SHUT BETWEEN THE TUNNEL AND THE VIADUCT. THE COMPANY DOES NOT SAY WHY AND THE GUARD WILL NOT BE DRAWN.',
    },
    {
      id: 'i_a_margin_adjuster', form: 'margin', voice: 'working', weight: 5, tone: 'bad',
      text: 'Against the claim for the brake van, in the loss adjuster’s hand: “allow it in full. Do not send me out there again.”',
    },
    {
      id: 'i_a_minute_plate', form: 'minute', voice: 'authority', weight: 5,
      text: 'Item 3: wargs. Traffic proposes armour plate on the brake vans. Works proposes a tunnel. The Director proposes the two departments settle it between themselves and report, and both have since written to say they would rather not. Item 4: deferred.',
    },
    {
      id: 'i_a_line_lamp', form: 'line', voice: 'working', weight: 5,
      text: 'Wargs on the section three nights running. Nobody hurt. The men are asking for a second lamp on the brake van.',
    },
    {
      id: 'i_a_wire_dwarf', form: 'wire', voice: 'dwarf', weight: 5, kinds: ['delve'],
      text: 'TOOK A BEAST OFF THE ADIT ROAD WITH POWDER STOP ONE OF OURS HURT NOT BADLY STOP THE ROAD IS OPEN STOP THIRTY POUND OF POWDER TO THE AUTHORITY ACCOUNT',
    },
  ],
  wrath: [
    {
      id: 'i_w_wire_gone', form: 'wire', voice: 'working', weight: 7, tone: 'grave',
      text: 'TRACK GONE STOP NOT DAMAGED GONE STOP ADVISE',
    },
    {
      id: 'i_w_verse_place', form: 'verse', voice: 'elf', weight: 5, tone: 'grave',
      text: 'We did not take your iron.\nWe took the place you had put it.',
    },
    {
      id: 'i_w_form_none', form: 'form', voice: 'authority', weight: 6, tone: 'grave',
      text: (c) => `Damage report. Section: ${RG(c)}. Nature of damage: NONE. Track present: NO. Reconcile these two answers: THE CLERK CANNOT. Ref ${ref(c)}.`,
    },
    {
      id: 'i_w_margin_oldplan', form: 'margin', voice: 'working', weight: 6, tone: 'grave',
      text: 'Against “embankment removed”, in the surveyor’s hand: “the field is as it was before we came. I have the old plan out. It matches.”',
    },
    {
      id: 'i_w_test_oldtrees', form: 'testimony', voice: 'working', weight: 6, tone: 'grave',
      text: '“They come at walking pace. That is the part you will not credit. Walking pace, all night, and by morning there was wood where the cutting was, and the trees was old. Not new trees. Old ones. I have stopped putting it in the book because of how it reads.”\n\n— Ganger Ives',
    },
    {
      id: 'i_w_minute_unmade', form: 'minute', voice: 'authority', weight: 6,
      text: (c) => `Item 1: the ${RG(c)} section, unmade. Item 2: whether “unmade” is a term the accounts recognise. Item 3: what term the accounts do recognise. Resolved: “abandonment, involuntary”. Item 4: deferred, and the Secretary has asked to be excused.`,
    },
    {
      id: 'i_w_line_rolled', form: 'line', voice: 'working', weight: 6, tone: 'grave',
      text: 'The rails are lying in the grass in the order they were rolled.',
    },
    {
      id: 'i_w_return_found', form: 'return', voice: 'authority', weight: 6, tone: 'grave',
      text: (c) => {
        const m = 180 + R(c, 90);
        return `Permanent way return. Miles of line: ${m}. Miles inspected: ${m}. Miles found: ${m - 5}.`;
      },
    },
    {
      id: 'i_w_foot_older', form: 'footnote', voice: 'authority', weight: 5, tone: 'grave',
      text: '† The section is not shown on this timetable. It is not shown on the last one either. Passengers holding an older timetable are asked to bring it to the office, and not to discuss it on the platform.',
    },
    {
      id: 'i_w_letter_redd', form: 'letter', voice: 'working', weight: 6, tone: 'grave',
      text: 'To the Director. You will have had the wire. I write because a wire cannot say this properly: nothing is wrong. The ground is not disturbed. The fence is standing and it is old fence. The gorse is old gorse.\n\nEleven months of my work is not gone from the field. It is gone from the year. I have asked the men and they remember laying it and they do not remember the field.\n\nI have paid them off and sent them home. I should like to be sent somewhere with houses.\n\n— J. Redd, resident engineer',
    },
    {
      id: 'i_w_invoice_dwarf', form: 'invoice', voice: 'dwarf', weight: 5, tone: 'grave',
      text: 'Ironmoot & Sons, to the Authority.\nTo attending upon the ground, two of us, one day: no charge.\nTo relaying the section: no estimate given.\n\nWe have stood on it. There is nothing to lay track onto and nothing there that will hold a spike. We will not tender for this work. Ask us for anything else.',
    },
  ],
};

// ---------------------------------------------------------------------------
// OPENED / FOUNDED / GREW / DECLINED / ABANDONED
// ---------------------------------------------------------------------------

export const OPENED = [
  {
    id: 'o_min_band', form: 'minute', voice: 'authority', weight: 6,
    text: (c) => `Item 1: the ${P(c)}–${P2(c)} line, opened. Present: the Director, the Secretary, the stationmaster, a brass band engaged by the parish and paid for by the parish, and one person in grey at the back of the platform whom nobody could place and who did not stay for the tea. Item 2: the tea, overspent. Item 3: deferred.`,
  },
  {
    id: 'o_inv_scissors', form: 'invoice', voice: 'authority', weight: 6,
    text: 'Opening account.\nTo ribbon, three yards: nil, donated.\nTo scissors: nil, borrowed.\nTo the band: 8 crowns.\nTo the band, second hour, unengaged and unavoidable: 8 crowns.\nTotal: 16 crowns. The Authority no longer owns any scissors.',
  },
  {
    id: 'o_foot_request', form: 'footnote', voice: 'authority', weight: 6,
    text: (c) => `† Calls at ${P2(c)} on request. Passengers request it by standing where the driver can see them and looking as though they mean it.`,
  },
  {
    id: 'o_form_wrongend', form: 'form', voice: 'authority', weight: 6,
    text: (c) => `Certificate of opening. Line: ${P(c)} to ${P2(c)}. Gauge: CORRECT. Ballast: SUFFICIENT. Fencing: COMPLETE BOTH SIDES. Station buildings: ONE, TIMBER. Station: AT THE WRONG END OF THE VILLAGE. By whose decision: THE LANDOWNER’S. Signed, the District Engineer.`,
  },
  {
    id: 'o_let_tibb', form: 'letter', voice: 'halfling', weight: 6, tone: 'good',
    text: (c) => `To the Authority. Sirs. The line is open and I have walked the length of our platform eleven times this morning for no reason at all. I am fifty-one years of age.\n\n— Tibb, postmaster, ${P2(c)}`,
  },
  {
    id: 'o_marg_fares', form: 'margin', voice: 'working', weight: 6,
    text: 'Against “first train, four passengers”, in the booking clerk’s hand: “four fares. Nine passengers.”',
  },
  {
    id: 'o_not_provisional', form: 'notice', voice: 'authority', weight: 6,
    text: 'THE LINE IS NOW OPEN. THE TIMETABLE IS PROVISIONAL. THE TIMETABLE WILL BE PROVISIONAL FOR SOME YEARS AND PASSENGERS ARE ASKED TO MAKE THEIR PEACE WITH IT.',
  },
  {
    id: 'o_ret_firstweek', form: 'return', voice: 'authority', weight: 6,
    text: (c) => `First week of working. Services booked: 12. Services run: 12. Fares taken: ${30 + R(c, 24)} crowns. Parcels: 9. Complaints: 1, from a person who has not used the line and does not intend to.`,
  },
  {
    id: 'o_test_fourthnight', form: 'testimony', voice: 'working', weight: 6, tone: 'good',
    text: '“They come down to the fence to watch her go by, the whole village, three nights running. On the fourth night nobody come. That is when I knew it were a railway.”\n\n— Driver Mull',
  },
  {
    id: 'o_verse_written', form: 'verse', voice: 'elf', weight: 4, tone: 'grave',
    text: 'The road is open, and it is swift.\n\nBetween the ford at Lathrieth and the stone we set for Míriel there were four hundred years of walking, and a song for the walking. The song is nine verses. The journey is now a morning.\n\nWe will not be shortening the song.',
  },
  {
    id: 'o_line_sixty', form: 'line', voice: 'authority', weight: 6,
    text: (c) => `${P(c)} and ${P2(c)} are joined. They have not spoken in sixty years.`,
  },
  {
    id: 'o_inv_piano', form: 'invoice', voice: 'working', weight: 5,
    text: (c) => `Bill of lading, first down goods. Grain, twenty sacks. Ale, four barrels. Stone, one ton. Nails, a keg. One piano, insured, addressed to a house at ${P2(c)} that is not yet built.`,
  },
  {
    id: 'o_foot_cart', form: 'footnote', voice: 'authority', weight: 5, tone: 'plain',
    text: '‡ Where this timetable and the carrier’s cart disagree, the cart was right for two hundred years and is right no longer.',
  },
  {
    id: 'o_wire_odd', form: 'wire', voice: 'working', weight: 6, tone: 'plain',
    text: 'ROAD OPEN STOP FIRST TRAIN THROUGH STOP EVERYTHING EXACTLY AS PLANNED STOP FEEL VERY ODD ABOUT IT STOP',
  },
  {
    id: 'o_let_dwarf', form: 'letter', voice: 'dwarf', weight: 5, cultures: ['dwarf'],
    text: (c) => `To the Authority. The road to ${P(c)} is open. Gauge true, ballast deep enough, the cutting sides at the angle we specified and not the angle your surveyor wanted.\n\nIt will carry what you said it would carry. It will carry more. Do not test that this year.\n\nT. Ironmoot, Master of Works`,
  },
];

export const FOUNDED = [
  {
    id: 'f_form_register', form: 'form', voice: 'authority', weight: 6,
    text: (c) => `Addition to the register of places. Situation: ${RG(c)}, beside the road at mile ${8 + R(c, 30)}. Houses at first count: ${9 + R(c, 14)}. Inn: ONE, ALREADY. Name of the place: ${UP(P(c))}, SUBJECT TO THE PARISH. Name given by the gangs while they were building: NOT TO BE ENTERED.`,
  },
  {
    id: 'f_let_name', form: 'letter', voice: 'halfling', weight: 6, cultures: ['halfling'],
    text: (c) => `To the Authority. Sirs. There is a difficulty about the name.\n\nYour board calls it ${P(c)}. The four families who put up the first roofs call it the Sidings, because that is what was here. My wife’s people, who came over from Pipwick and were here a fortnight earlier, call it New Pipwick, and there is nothing new about it and it is not Pipwick.\n\nThe schoolmaster holds that it should be Siddings with two d’s, from an older word for a slope, and he has written it that way on the school door, and the school has been open nine days.\n\nWe are content to have it settled by the Authority, provided the Authority settles it the way I have put first.\n\n— Hamfast Tunnelly, for the four families`,
  },
  {
    id: 'f_ret_census', form: 'return', voice: 'authority', weight: 6,
    text: (c) => `First return of the new place at ${P(c)}. Houses: ${10 + R(c, 12)}. Households: the same. Persons: ${44 + R(c, 60)}. Inn: 1. Smith: 1. Well: 1, shared. Church: none. Burial ground: none required yet. Rateable value: to be assessed at the next quarter day.`,
  },
  {
    id: 'f_test_grew', form: 'testimony', voice: 'working', weight: 6,
    text: (c) => `“There was nothing there. I want that understood, because it will be in the timetable next year as though there always was. Two years ago it were a fence and a spoil heap and somewhere to leave the wagons. Now there is a lane and a smith on it, and last Tuesday a woman waved me down to ask when the up train goes, and I did not know, because there never was an up train from there.”\n\n— Driver Mullet, on ${P(c)}`,
  },
  {
    id: 'f_min_status', form: 'minute', voice: 'authority', weight: 6,
    text: (c) => `Item 4: the new place at ${P(c)}. Traffic asks that it be made a halt. Works asks who is to pay for the nameboard, the nameboard being the whole of the expense and the parish having no rate yet to pay it from. The Director has offered to pay for the nameboard himself, and has been told that this cannot be recorded. Resolved: that it be a halt. Item 5: the nameboard. Deferred.`,
  },
  {
    id: 'f_line_lamps', form: 'line', voice: 'working', weight: 5,
    text: (c) => `A lamp was lit at ${P(c)} on the Thursday. There was no lamp there in the spring.`,
  },
  {
    id: 'f_foot_jurisdiction', form: 'footnote', voice: 'men', weight: 5,
    text: (c) => `§ The Office of the King’s Clerk observes that the new settlement at ${P(c)} lies in no hundred, pays into no court, and is entered in no muster roll. The Office does not say that this is irregular. The Office says that it is not yet regular, and asks to be told which hundred the Authority considers it to be in, so that the Office may consider that answer.`,
  },
  {
    id: 'f_inv_dwarf', form: 'invoice', voice: 'dwarf', weight: 5, cultures: ['dwarf'],
    text: (c) => `Sold to the settlers at ${P(c)}, on their own asking.\nStone, dressed, for eleven doorways: 44 crowns.\nStone, rough, for footings: 20 crowns.\nOne well, sunk, lined, twenty-two feet, water at nineteen: 60 crowns.\nPaid in full on the day. They did not ask for terms and we did not offer any.`,
  },
];

export const GREW = [
  {
    id: 'g_inv_fee', form: 'invoice', voice: 'halfling', weight: 6,
    text: (c) => `Application from ${P(c)}, with fee enclosed.\nA second platform: applied for.\nA coat of arms: applied for.\nA stationmaster’s house with a bay window: applied for.\nFee enclosed: 2 crowns.\nFee required: 20 crowns.`,
  },
  {
    id: 'g_form_counting', form: 'form', voice: 'authority', weight: 6,
    text: (c) => `Reclassification. Place: ${UP(P(c))}. Grounds: POPULATION. Population at the last return: AS PRINTED. Population at this return: MORE. Precise figure: THE PARISH CLERK IS COUNTING AND HAS ASKED FOR MORE TIME.`,
  },
  {
    id: 'g_marg_hat', form: 'margin', voice: 'authority', weight: 6,
    text: 'Against the stationmaster’s request for a larger hat, in the Secretary’s hand: “allow it”. Against that, the Director: “allow it and say nothing. He has earned the hat.”',
  },
  {
    id: 'g_let_inn', form: 'letter', voice: 'halfling', weight: 6,
    text: (c) => `To the Authority. Our inn has been extended twice and is still not large enough, and my wife says I am to write and thank you, and I am not writing to thank you.\n\nOn a market Tuesday I have people in the yard and people on the stairs, and last week a party of Delvers who wanted meat at eleven at night and paid for it, and I have had to take on my sister’s boy, who is willing but who is not a cook.\n\nThis is a complaint. I wish to be clear that it is a complaint.\n\n— Barrow, licensee, the Green Man, ${P(c)}`,
  },
  {
    id: 'g_not_platform', form: 'notice', voice: 'authority', weight: 5,
    text: (c) => `PASSENGERS FOR ${UP(P(c))} SHOULD ALIGHT AT THE FAR END. THE PLATFORM HAS BEEN LENGTHENED TWICE THIS YEAR AND WILL BE LENGTHENED AGAIN.`,
  },
  {
    id: 'g_foot_market', form: 'footnote', voice: 'authority', weight: 5,
    text: '† Two additional services on market days. Market days are now most days.',
  },
  {
    id: 'g_min_consortium', form: 'minute', voice: 'authority', weight: 6,
    text: (c) => `Item 5: ${P(c)}. Traffic reports the goods yard full every night and the sidings full every morning, and asks for land. Land has been offered, on terms, by a consortium that turns out on inspection to be the stationmaster. Resolved: buy the land. Resolved further: that nobody say anything.`,
  },
  {
    id: 'g_ret_ninemiles', form: 'return', voice: 'authority', weight: 6, tone: 'good',
    text: (c) => `Booking office return, ${P(c)}. Tickets issued this quarter: ${900 + R(c, 700)}. Same quarter last year: a quarter of that. Tickets issued to persons who had never in their lives been more than nine miles from where they were born: most of them.`,
  },
  {
    id: 'g_test_lad', form: 'testimony', voice: 'working', weight: 6, tone: 'good',
    text: '“There’s a lad on my train every Tuesday, going to the school at Amonhal. His father were a carter. His father has never been to Amonhal.”\n\n— Guard Pettifer',
  },
  {
    id: 'g_verse_hill', form: 'verse', voice: 'elf', weight: 4, tone: 'grave',
    text: (c) => `Sixty houses at ${P(c)} where there were twelve. We remember the twelve, and who was in them.\n\nThe orchard that stood where your coal-yard stands was planted by a man named Osric, who is not remembered by you. He grafted the trees himself, and badly, and they bore for ninety years regardless.`,
  },
  {
    id: 'g_line_gate', form: 'line', voice: 'dwarf', weight: 5, cultures: ['dwarf'],
    text: (c) => `${P(c)} has opened a second gate. Forty more hands below. The account is settled monthly and has never yet been late.`,
  },
];

export const DECLINED = [
  {
    id: 'd_foot_doctor', form: 'footnote', voice: 'authority', weight: 6, tone: 'bad',
    text: (c) => `† The ${P(c)} service is reduced to two trains. The second is kept on because one is not enough to fetch a doctor and take him home again.`,
  },
  {
    id: 'd_marg_lit', form: 'margin', voice: 'working', weight: 6, tone: 'bad',
    text: 'Against “halt to be closed”, in the stationmaster’s hand: “I will keep it lit. You need not pay me for it.”',
  },
  {
    id: 'd_let_mill', form: 'letter', voice: 'halfling', weight: 6, tone: 'bad',
    text: (c) => `To the Authority. The mill has stopped. Nobody will say why it has stopped, and I have asked properly, at the door, and I have asked in the shop, and the shop has stopped too.\n\nMy husband’s people were millers here and his father before that. There has been a mill on that water since the parish book begins. I am not writing about the trains. I am writing because you are the only office that answers.\n\n— Widow Marsden, ${P(c)}`,
  },
  {
    id: 'd_form_notyet', form: 'form', voice: 'authority', weight: 6, tone: 'bad',
    text: (c) => `Traffic review. Station: ${UP(P(c))}. Passengers weekly: 40, formerly 190. Goods weekly: NIL. Recommendation of the district: WITHDRAW THE SERVICE. Recommendation of the district, second sheet, unsigned: DO NOT WITHDRAW IT YET.`,
  },
  {
    id: 'd_inv_fire', form: 'invoice', voice: 'working', weight: 6, tone: 'bad',
    text: (c) => `Account, ${P(c)} station, quarter ending.\nLamp oil: 1 crown.\nCoal for the waiting room fire: 2 crowns.\nWhitewash: nil, none used.\nReceipts for the quarter: 3 crowns.\nThe waiting room fire has been kept in every day.`,
  },
  {
    id: 'd_min_nomotion', form: 'minute', voice: 'authority', weight: 5, tone: 'bad',
    text: (c) => `Item 4: ${P(c)}. The figures were read out. Nobody spoke against withdrawal and nobody moved it. Item 5: deferred. Item 4 also deferred, on the Director’s motion, no reason given and none asked for.`,
  },
  {
    id: 'd_line_mill', form: 'line', voice: 'working', weight: 5, tone: 'bad',
    text: 'The mill has stopped. Nobody has said why.',
  },
  {
    id: 'd_test_names', form: 'testimony', voice: 'working', weight: 5, tone: 'bad',
    text: '“It’s the same station. Same lamps, same bench, same clock going slow. It is only that I know all their names now, and I never used to.”\n\n— Driver Sallow',
  },
  {
    id: 'd_verse_fewer', form: 'verse', voice: 'elf', weight: 4, tone: 'grave',
    text: 'Fewer lamps this year than last year.\nWe counted them last year also.\nWe did not tell you we were counting.',
  },
];

export const ABANDONED = [
  {
    id: 'z_ret_signboard', form: 'return', voice: 'authority', weight: 6, tone: 'bad',
    text: (c) => `Register amendment. Places on the register: ${55 + R(c, 12)}, formerly one more. Bells transferred to places that still have people in them: 1. Signboards taken down and stored: 1. Signboards destroyed: none, the name being possibly wanted again.`,
  },
  {
    id: 'z_let_toolate', form: 'letter', voice: 'halfling', weight: 7, tone: 'grave',
    text: (c) => `To the Authority. This is the last of us. We are going west along your line on foot, not being able to pay the fare, and I want it known that we are not going because of the railway.\n\nWe are going because it came too late.\n\n— Hob Tarrow, ${P(c)}`,
  },
  {
    id: 'z_foot_shown', form: 'footnote', voice: 'authority', weight: 6, tone: 'bad',
    text: '† No service. No staff. The halt is shown on this timetable because it was shown on the last one.',
  },
  {
    id: 'z_marg_opened', form: 'margin', voice: 'authority', weight: 6, tone: 'grave',
    text: 'Against “station closed”, in a hand the office does not know: a date, forty years earlier, and the single word “opened”.',
  },
  {
    id: 'z_verse_waited', form: 'verse', voice: 'elf', weight: 5, tone: 'grave',
    text: (c) => `${P(c)} is empty. Four generations of it, and the name is older than the town — it was the name of the moor first, and the moor is still there, and still called that.\n\nThe last to go was the widow Ancred, who took the door of her house with her.`,
  },
  {
    id: 'z_wire_anyway', form: 'wire', voice: 'working', weight: 6, tone: 'grave',
    text: (c) => `HALT AT ${UP(P(c))} CLOSED STOP NO PASSENGERS STOP NO PARCELS STOP NO ONE LEFT TO WIRE TO STOP AM WIRING ANYWAY`,
  },
  {
    id: 'z_ret_households', form: 'return', voice: 'authority', weight: 5, tone: 'grave',
    text: (c) => `Households struck from the rate book at ${P(c)}, being the last of them. Bramble. Chaffey. Two of Cropp. Grubb. Hardy. Nubbin. Pipp. Three of Tarrow. Tunnelly. Wick.\n\nFourteen. Where they have gone is not the Authority’s to record, and has not been recorded.`,
  },
];
