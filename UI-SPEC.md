# UI contract — the DOM the stylesheet must dress

This is the full markup surface after the agency rework. Class and id names here
are final; style against these.

## Aesthetic direction — Tolkien, specifically

Not generic fantasy parchment. The reference is **Tolkien's own book design**:

- **Two-colour printing.** Black ink and vermilion on cream — the palette of the
  Ring-verse pages and the *Book of Mazarbul* facsimiles. Red is used for
  initials, rules, marginal marks and headings only. Never a third accent hue.
- **Double and triple rules.** Tolkien's title pages are framed by paired lines
  with a hairline gap. Panels should be framed that way, not with a single border.
- **Runes.** Tolkien wrote the Dwarves' language in Anglo-Saxon runes, which are
  in Unicode and need no font file: ᚠ ᚢ ᚦ ᚨ ᚱ ᚲ ᚷ ᚹ ᚺ ᚾ ᛁ ᛃ ᛇ ᛈ ᛉ ᛊ ᛏ ᛒ ᛖ ᛗ ᛚ ᛜ ᛞ ᛟ.
  Use them as ornament in rules and headers, and as the per-culture sigil beside
  settlement names. Sparingly — ornament, not decoration.
- **Map lettering.** Place names on the 3D view should read like the lettering on
  a hand-drawn map: letterspaced, slightly condensed, with a fine halo rather than
  a drop shadow.
- **Illuminated initials.** A major report or ending opens with a large red
  initial capital set into the first paragraph.
- Type: an old-style serif stack. Small caps and generous letterspacing for
  anything structural. No rounded corners anywhere. No glows. No gradients that
  read as glass.

Legibility over atmosphere where they conflict: this is a management game and the
numbers must be readable at a glance over a bright 3D scene.

---

## Existing structure (unchanged)

```
#boot .boot-inner h1 / .sub / .boot-bar > i / .boot-status
#title .title-card h1 / .sub / .brief > p(.dim) / .seedrow > label > input#seedInput
        / button#reroll.ghost / button#begin.big / .creds
#hud
  header#topbar
    .brand
    .stat#stWeek / .stat.money#stMoney / .stat#stFlow / .stat#stPros
    .stat#stConcord / .stat.shadow#stShadow      each: <b>value</b><span>label</span>
    .spacer
    button#charterBtn(.pulse, [hidden])
    .speeds > button[data-speed](.on)
    button#muteBtn.ghost
  aside#leftpanel
    section.card#concordCard  h3 + #regardList > .regard(.gone) > .rl > span + i , .meter > i
    section.card#fleetCard    h3 + .fleetline(span + b) x3 + #lineList
  aside#register  h3 + button#regToggle + #logList > .logEntry(.good/.bad/.grave/.big)
                                            > .wk + p...
  #inspector
  #hint(.show)
  #modal > .modal-card(.ending)
```

## NEW — the line dossier, replacing the old one-row-per-line list

`#lineList` now contains, per service:

```html
<div class="svc" data-line="3">
  <div class="svcHead">
    <s class="swatch" style="background:#c94f3d"></s>
    <span class="nm">the Verdant Way</span>
    <span class="svcBadge freight">freight</span>
    <span class="tn">3</span>
  </div>
</div>
```

Selecting one opens **`#linePanel`** (bottom-left, above `#inspector`):

```html
<div id="linePanel">
  <div class="lpHead">
    <s class="swatch"></s>
    <input class="lpName" value="the Verdant Way">
    <button class="ghost sm" data-act="closeLine">✕</button>
  </div>

  <div class="lpRow">
    <span class="lpLabel">Carries</span>
    <div class="seg" role="radiogroup">
      <button data-policy="passenger" class="on">Passengers</button>
      <button data-policy="mixed">Mixed</button>
      <button data-policy="freight">Freight</button>
      <button data-policy="troop">Troop</button>
    </div>
  </div>

  <div class="lpRow">
    <span class="lpLabel">Fares</span>
    <div class="seg">
      <button data-fare="0">Cheap</button>
      <button data-fare="1" class="on">Standard</button>
      <button data-fare="2">Dear</button>
    </div>
  </div>

  <div class="lpRow">
    <span class="lpLabel">Engines</span>
    <div class="stepper">
      <button data-tr="-1">−</button><b>3</b><button data-tr="1">+</button>
      <i>2 idle in shed</i>
    </div>
  </div>

  <div class="lpRow">
    <span class="lpLabel">Wardens</span>
    <label class="chk"><input type="checkbox" data-act="warden"> patrol this line (8/wk)</label>
  </div>

  <div class="lpStops">
    <span class="lpLabel">Calls at</span>
    <ol>
      <li data-stop="12">
        <span class="rune">ᚻ</span><span class="nm">Puddifoot</span>
        <span class="flag short">short of stone</span>
        <span class="ops">
          <button data-act="up">↑</button><button data-act="down">↓</button>
          <button data-act="drop">✕</button>
        </span>
      </li>
    </ol>
    <p class="lpAdd">Click a settlement on the map to add it to this service.</p>
  </div>

  <div class="lpStats">
    <div><i>carried</i><b>41</b><s>loads/wk</s></div>
    <div><i>receipts</i><b>128</b><s>cr/wk</s></div>
    <div><i>upkeep</i><b>31</b><s>cr/wk</s></div>
    <div><i>capacity used</i><b>86%</b><s class="warn">at Brackenford</s></div>
  </div>

  <div class="lpActions">
    <button data-act="split">Split here</button>
    <button class="alt" data-act="deleteLine">Withdraw the service</button>
  </div>
</div>
```

## NEW — the standing orders (a light guided opening)

Sits in `#leftpanel` above the other cards. Uses `.card` so it inherits that look.

```html
<section class="card" id="guide">
  <h3>Standing Orders <button id="guideSkip" class="ghost sm">✕</button></h3>
  <div id="guideBody">
    <p class="guideStep">2 of 4</p>
    <p class="guideText">Open the service in <b>The Fleet</b> below…</p>
  </div>
</section>
```
`.guideStep` is a small-caps counter; `.guideText` is body copy with `<b>` used
for the controls being named.

## NEW — the ledger

Toggled by a top-bar button `#ledgerBtn`. Overlays the register column.

```html
<aside id="ledger">
  <h3>The Ledger <button id="ledgerClose" class="ghost sm">✕</button></h3>

  <div class="ledSection">
    <h4>Receipts this week</h4>
    <table class="ledTable">
      <tr><td><s class="swatch" style="background:#c94f3d"></s>the Vermilion Way</td>
          <td class="num">128</td><td class="num dim">−31</td><td class="num good">+97</td></tr>
      <tr class="ledTotal"><td>Fares and freight</td><td class="num"></td><td class="num"></td>
          <td class="num good">+412</td></tr>
      <tr><td>Council grant</td><td colspan="2"></td><td class="num good">+96</td></tr>
      <tr><td>Maintenance</td><td colspan="2"></td><td class="num bad">−118</td></tr>
      <tr class="ledTotal"><td>Net</td><td colspan="2"></td><td class="num good">+390</td></tr>
    </table>
  </div>

  <div class="ledSection">
    <h4>What moved</h4>
    <div class="flowRow">
      <s class="goodDot" style="background:#c9a94e"></s>
      <span class="fq">18</span>
      <span class="fg">Grain</span>
      <span class="fp">Puddifoot → Zhaddun</span>
      <span class="fx">2 changes</span>
    </div>
  </div>

  <div class="ledSection">
    <h4>Bottlenecks</h4>
    <div class="botRow">
      <span class="nm">Brackenford – Ostenmoor</span>
      <div class="bar"><i style="width:96%"></i></div>
      <span class="pc">96%</span>
    </div>
    <p class="ledNote">Freight is standing at Puddifoot for want of a path.</p>
  </div>

  <div class="ledSection">
    <h4>Wanting for something</h4>
    <div class="wantRow">
      <span class="rune">ᚦ</span><span class="nm">Zhaddun</span>
      <span class="wg">Grain</span>
      <span class="wr">no connected source</span>
    </div>
  </div>
</aside>
```

## CHANGED — the settlement dossier `#inspector`

```html
<h4>Zhaddun <em>Delve · town</em></h4>
<p class="sub2">the Sundering Peaks</p>
<div class="kv">
  <div><i>people</i><b>612</b></div> … as before …
</div>
<div class="needs">
  <div class="need short">
    <s style="background:#c9a94e"></s><span class="ng">Grain</span>
    <span class="nq">2.1 of 7.2</span>
    <span class="nwhy">capacity short at Brackenford</span>
  </div>
</div>
<div class="makes">
  <span class="chip">Iron Ore ↑</span><span class="chip">Steel ⚒</span>
</div>
<div class="actions">…</div>
```

`.nwhy` values: `no connected source`, `capacity short at <place>`, `too many
changes`, `source has none to spare`, `station closed`.

## CHANGED — the survey card, when two settlements are picked

Adds a service choice, so building a link is a decision and not an automatic act:

```html
<div class="svcChoice">
  <span class="lpLabel">Run it as</span>
  <div class="seg">
    <button data-svc="new" class="on">A new service</button>
    <button data-svc="3">Extend the Verdant Way</button>
  </div>
</div>
```

## Culture runes (use these exact characters)

halfling `ᚻ` · dwarf `ᚦ` · elf `ᛊ` · men `ᛗ` · orc `ᛉ` · watch `ᛏ`
