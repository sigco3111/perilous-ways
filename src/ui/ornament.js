// Ornament — the printer's furniture. Markup-string helpers only: no DOM, no
// state, no side effects. Every function returns HTML for the caller to place.
//
// Tolkien set his own title pages in two colours, black and vermilion on cream:
// paired rules with a hairline gap, a large red initial to open a chapter, and
// Anglo-Saxon runes for the Dwarves. The runes are in Unicode and need no font
// file, so they are the cheapest way to make the interface belong to this world
// rather than to a spreadsheet. Sparingly: ornament, not decoration.
//
// The matching styles are in styles.css, section "ornament".

/** One rune per people, used as a sigil beside names. */
export const CULTURE_RUNE = {
  halfling: 'ᚻ',
  dwarf: 'ᚦ',
  elf: 'ᛊ',
  men: 'ᛗ',
  orc: 'ᛉ',
  watch: 'ᛏ',
};

/** The historical name of each of those runes, for the tooltip. */
export const RUNE_NAME = {
  halfling: '하이글', dwarf: '쏜', elf: '시겔',
  men: '만', orc: '에올', watch: '티르',
};

const CULTURE_TITLE = {
  halfling: '하플링', dwarf: '드워프', elf: '엘프',
  men: '변경의 인간', orc: '동쪽 세력', watch: '초소',
};

/** ᛜ (ing) is a lozenge and makes the best centred ornament; ᛞ (dæg) is the
 *  second choice, ᚦ (thorn) for anything dwarvish. */
export const ORNAMENT_RUNE = 'ᛜ';

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** `<span class="rune" title="Dwarves · rune thorn">ᚦ</span>` for a culture key. */
export function sigil(culture) {
  const key = String(culture || '').toLowerCase();
  const r = CULTURE_RUNE[key];
  if (!r) return '';
  const name = CULTURE_TITLE[key] || '';
  const title = RUNE_NAME[key] ? `${name} · 룬 문자 ${RUNE_NAME[key]}` : name;
  return `<span class="rune" title="${esc(title)}">${r}</span>`;
}

/** A CSS length from a number of pixels, or a string that carries its own unit. */
const len = (w) => (typeof w === 'number' ? `${w}px` : String(w));
/** A CSS length always has a digit in it; a rune never does. */
const looksLikeRune = (s) => !/\d/.test(s);

/**
 * A decorative rule: paired hairlines, one black and one vermilion, broken in
 * the middle by a rune. Both arguments are optional and either order works.
 *   runeRule()          → full width, lozenge
 *   runeRule(220)       → 220px wide
 *   runeRule('ᚦ')       → full width, thorn
 *   runeRule(220, 'ᚦ')  → both
 */
export function runeRule(width, rune) {
  let w = null;
  let r = ORNAMENT_RUNE;
  for (const a of [width, rune]) {
    if (a == null || a === '') continue;
    if (typeof a === 'number') w = a;
    else if (looksLikeRune(a)) r = a;
    else w = a;
  }
  const style = w == null ? '' : ` style="width:${esc(len(w))}"`;
  return `<div class="runeRule"${style}><i></i><span class="rune">${esc(r)}</span><i></i></div>`;
}

/**
 * Open a passage with a large red initial capital.
 *
 * Plain text is escaped and split on blank lines into paragraphs, the first of
 * which gets the initial — this is the form the register and the endings use.
 * A string that already begins with a tag is left alone structurally and the
 * initial is set inside that first tag, so pre-built markup also works.
 */
export function illuminate(text) {
  const s = String(text);

  // already markup: slip the initial inside the first element
  const tag = /^\s*<([a-z][\w-]*)\b[^>]*>/i.exec(s);
  if (tag) {
    const at = tag.index + tag[0].length;
    const rest = s.slice(at);
    const first = /^\s*(&[a-z]+;|&#\d+;|[^\s<])/i.exec(rest);
    if (!first) return s;
    return `${s.slice(0, at)}<span class="initial">${first[1]}</span>${rest.slice(first[0].length)}`;
  }

  return String(s).split(/\n{2,}/).map((p, i) => {
    const body = esc(p).replace(/\n/g, '<br>');
    if (i !== 0) return `<p>${body}</p>`;
    const m = body.match(/^\s*([A-Za-zÀ-ÿ])([\s\S]*)$/);
    if (!m) return `<p>${body}</p>`;
    return `<p class="hasInitial"><span class="initial">${m[1]}</span>${m[2]}</p>`;
  }).join('');
}

/** Structural lettering: letterspaced small caps. */
export function smallcaps(text) {
  return `<span class="sc">${esc(text)}</span>`;
}

/**
 * A signed figure in the two-colour convention of a ledger: gains in black,
 * losses in vermilion. A bare span, so it drops into a cell or a stat.
 */
export function signed(n, unit = '') {
  const v = Math.round(Number(n) || 0);
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `<span class="num ${v < 0 ? 'bad' : 'good'}">`
    + `${sign}${Math.abs(v).toLocaleString('en-GB')}${unit ? ` ${esc(unit)}` : ''}</span>`;
}

/** A load bar for a section of line. Takes 0..1 or 0..100. */
export function bar(frac) {
  let v = Number(frac) || 0;
  if (v <= 1.0001) v *= 100;
  v = Math.max(0, Math.min(100, v));
  return `<div class="bar"><i style="width:${v.toFixed(0)}%"></i></div>`;
}
