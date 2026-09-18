/* Original artwork by Try Jesus Media. No remote assets or user content. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TJMReadingBadges = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  const catalog = /* CATALOG */ [];
  const byId = new Map(catalog.map(badge => [badge.id, badge]));
  const palettes = [
    ['#186059', '#063D38', '#E5B55B', '#FDFAF2'], ['#25456A', '#102840', '#8AC9E2', '#FFF0BD'],
    ['#723F52', '#3B233A', '#E8A5AC', '#FCEAD2'], ['#72623B', '#383C2E', '#D9CC85', '#FFF1C5'],
    ['#97583E', '#4B2C2B', '#F0BC77', '#F9E0C1'], ['#514B79', '#252840', '#C2B1EA', '#FAE9C2'],
    ['#277A78', '#10414B', '#8EE0C8', '#FFE7AD'], ['#8D6A27', '#4B371C', '#FFE29C', '#FDFAF2'],
    ['#546983', '#263547', '#BECFE5', '#F9DD9D'], ['#4D704C', '#223F37', '#ABD599', '#FFF0CB'],
    ['#7A3943', '#42232C', '#EBAF8B', '#FFF0CB'], ['#526F79', '#263F4B', '#B4DDDC', '#F5E6B7'],
  ];
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  // Icons use one 100 × 100 drawing space. Layered fills, cut lines, and
  // silhouettes remain legible at the shared 64px thumbnail size.
  function illustration(kind, p, detail) {
    const [base, dark, accent, light] = p;
    const line = `stroke="${dark}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;
    const g = body => `<g ${line}>${body}</g>`;
    const shape = (d, fill = light) => `<path d="${d}" fill="${fill}"/>`;
    const stroke = d => `<path d="${d}" fill="none"/>`;
    const circle = (x, y, r, fill = accent) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
    const rect = (x, y, w, h, fill = light, radius = 3) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}"/>`;
    const branch = shape('M48 88Q48 43 58 12', 'none') + [26, 42, 58, 74].map((y, i) => shape(`M50 ${y + 10}Q${i % 2 ? 20 : 83} ${y - 20} ${50 + (i % 2 ? -3 : 3)} ${y - 4}Z`, accent)).join('');
    const book = shape('M50 24Q29 12 10 21V77Q30 68 50 82Q70 68 90 77V21Q71 12 50 24Z') + stroke('M50 24V82M19 31L40 33M19 43L40 45M19 55L40 57M60 33L81 31M60 45L81 43M60 57L81 55');
    const scroll = shape('M23 17H76Q89 17 89 30H76V72Q76 84 62 84H17Q30 84 30 70V30H12Q12 17 23 17Z', light) + stroke('M30 30V23M41 34H66M41 46H66M41 58H61M17 72H62Q72 72 72 84');
    const cup = shape('M26 18H74V46Q74 66 53 69V81H70V89H30V81H47V69Q26 66 26 46Z', accent) + stroke('M32 27H68M33 38H67');
    const flame = shape('M51 6Q59 34 72 34Q91 66 67 85Q30 106 18 69Q13 48 35 28Q30 55 43 55Q55 37 51 6Z', accent) + shape('M49 48Q74 74 50 88Q29 78 49 48Z', light);
    const crown = shape('M17 34L34 47L50 19L66 47L83 34L76 79H24Z', accent) + rect(24, 70, 52, 12, light) + [17, 50, 83].map((x, i) => circle(x, i === 1 ? 17 : 31, 5, light)).join('') + circle(50, 58, 5, base);
    const tree = shape('M43 51L39 90H66L57 51Z', accent) + circle(32, 41, 19) + circle(68, 41, 19) + circle(50, 23, 23) + stroke('M48 84L50 49M50 61L35 50M51 68L68 53');
    const boat = shape('M8 59H93L78 83H24Z', accent) + stroke('M16 91Q26 85 36 91T56 91T76 91T96 91M50 10V59') + shape('M53 14L82 50H53Z', light) + shape('M45 25L25 50H45Z', light);
    const house = shape('M15 44L50 14L85 44Z', accent) + rect(23, 44, 54, 42) + rect(42, 59, 18, 27, base) + rect(28, 51, 9, 11, accent);
    const gate = rect(12, 20, 18, 68, accent) + rect(70, 20, 18, 68, accent) + shape('M30 87V47Q50 20 70 47V87Z', light) + stroke('M43 45V87M57 45V87M30 61H70M30 76H70') + rect(9, 13, 24, 12) + rect(67, 13, 24, 12);
    const lamp = shape('M14 64Q49 45 78 56L91 40Q91 65 77 72Q49 99 14 74Z', accent) + shape('M15 60Q-1 43 10 26Q30 46 15 60Z', light) + stroke('M28 70H65');
    const jar = shape('M35 12H65V25L62 30Q91 51 76 85Q50 98 24 85Q9 51 38 30L35 25Z', light) + rect(32, 11, 36, 9, accent) + shape('M25 55Q51 65 75 55V80Q50 92 25 80Z', accent) + stroke('M33 40Q25 48 28 58');
    const grain = stroke('M50 92V13') + [23, 39, 55, 71].map(y => shape(`M49 ${y + 12}Q22 ${y} 29 ${y - 9}Q46 ${y - 7} 49 ${y + 12}ZM51 ${y + 12}Q78 ${y} 71 ${y - 9}Q54 ${y - 7} 51 ${y + 12}Z`, accent)).join('');
    const stone = shape('M17 70L22 43L42 26L69 21L89 55L79 80L39 87Z', light) + stroke('M22 43L52 54L69 21M52 54L79 80M52 54L39 87');
    const fish = shape('M17 51Q48 12 77 47L95 28V75L77 56Q48 94 17 51Z', light) + circle(33, 47, 3, dark) + stroke('M44 29Q57 51 44 73M56 41L67 51L57 62');
    const bread = shape('M13 60Q6 27 48 26Q83 22 90 56L88 74H17Z', accent) + stroke('M31 34L24 53M49 31L42 51M68 32L61 51M18 64H86');
    const chain = [0, 1, 2, 3].map(i => `<rect x="${17 + i * 14}" y="${14 + i * 16}" width="25" height="35" rx="12" fill="none" stroke="${light}" stroke-width="7" transform="rotate(-34 ${30 + i * 14} ${31 + i * 16})"/>`).join('');
    const motifs = {
      earth: circle(50, 49, 37, base) + shape('M21 29L39 18L49 26L44 43L27 48L16 40M53 48L76 36L85 51L67 61L61 82L47 74Z', accent) + stroke('M12 50H87M50 12Q22 48 50 86Q78 49 50 12'),
      tree, fig: tree + [31, 56, 74].map(x => circle(x, 44, 5, accent)).join(''),
      cedar: shape('M50 8L16 45H30L10 65H40V90H60V65H90L69 45H83Z', accent) + stroke('M50 20V81M33 42L50 53L68 42'),
      stump: shape('M32 35H69L67 72L82 85L59 82L48 90L35 81L19 84L34 68Z', accent) + `<ellipse cx="50" cy="34" rx="20" ry="10" fill="${light}"/>` + stroke('M39 36Q52 26 63 35M44 49V73M59 46V68'),
      altar: rect(19, 49, 62, 38, accent) + stroke('M19 62H81M19 75H81M38 49V62M63 62V75M40 75V87') + shape('M27 47Q17 28 38 13Q34 35 46 38Q51 15 63 11Q91 36 72 48Z', light),
      footsteps: `<g transform="rotate(-20 50 50)">${rect(22, 17, 19, 35, light, 10)}${circle(32, 62, 8)}${rect(59, 36, 19, 35, accent, 10)}${circle(68, 82, 8, light)}</g>`,
      ark: shape('M6 52H95L82 80H22Z', accent) + rect(25, 27, 52, 25) + shape('M19 28L49 13L83 28Z', accent) + rect(33, 34, 10, 10, base) + rect(52, 34, 10, 10, base) + stroke('M15 66H87M12 91Q22 84 33 91T55 91T77 91T99 91'),
      rainbow: `<path d="M9 76A41 41 0 0 1 91 76" stroke="${accent}" stroke-width="11" fill="none"/><path d="M22 76A28 28 0 0 1 78 76" stroke="${light}" stroke-width="9" fill="none"/><path d="M34 76A16 16 0 0 1 66 76" stroke="${base}" stroke-width="8" fill="none"/>`,
      tower: shape('M18 89V72H27V54H34V36H41V17H59V36H66V54H73V72H82V89Z', light) + stroke('M27 72H73M34 54H66M41 36H59') + rect(44, 72, 12, 17, accent),
      tent: shape('M7 85L50 16L94 85Z', accent) + shape('M50 16L34 85H72Z', light) + shape('M50 47L44 85H65Z', dark) + stroke('M7 85H94M50 16V8'),
      stars: [circle(50, 46, 22, accent), ...[[15, 22], [83, 20], [23, 79], [77, 79]].map(([x, y]) => shape(`M${x} ${y - 9}L${x + 3} ${y - 3}L${x + 9} ${y}L${x + 3} ${y + 3}L${x} ${y + 9}L${x - 3} ${y + 3}L${x - 9} ${y}L${x - 3} ${y - 3}Z`, light))].join(''),
      ram: shape('M22 57Q9 27 35 27H65Q91 27 78 57L63 80H37Z') + circle(21, 40, 15, accent) + circle(79, 40, 15, accent) + circle(21, 40, 7, dark) + circle(79, 40, 7, dark) + circle(39, 55, 3, dark) + circle(61, 55, 3, dark) + shape('M43 69H57L50 76Z', dark),
      fire: flame, flame,
      jar, perfume: jar + shape('M37 36L50 27L64 36L50 46Z', base), oil: jar + shape('M49 57Q69 77 49 84Q29 77 49 57Z', light), flask: jar,
      bowl: shape('M12 44H89Q84 82 51 84Q19 82 12 44Z', accent) + `<ellipse cx="50" cy="44" rx="38" ry="10" fill="${light}"/>` + [27, 41, 55, 68].map((x, i) => circle(x, 42 + i % 2 * 4, 3, base)).join(''),
      ladder: stroke('M27 90L41 10M61 90L75 10M33 68H66M37 47H69M40 27H73') + circle(69, 18, 10, accent),
      moon: shape('M70 14A39 39 0 1 0 82 72A33 33 0 0 1 70 14Z', light) + circle(73, 35, 4, accent) + circle(87, 50, 3, accent),
      coat: shape('M31 18L13 31L6 53L22 59L30 43V88H70V43L78 59L94 53L87 31L69 18L50 29Z', light) + shape('M38 23V88H49V29M58 24V88H69V18', accent) + stroke('M30 55H70M30 69H70'),
      grain, wheat: `<g transform="rotate(-12 50 50)">${grain}</g>`,
      sack: shape('M32 9H68L58 29Q78 42 84 70Q88 91 51 92Q11 91 16 70Q22 42 42 29Z', accent) + stroke('M34 28H66M29 70Q25 84 47 84M64 46L70 60') + shape('M45 9L50 28L55 9', light),
      basket: shape('M12 48H89L80 88H21Z', accent) + stroke('M21 48Q19 13 50 13Q82 13 81 48M17 61H85M19 74H82M32 49L36 86M49 48V87M67 49L64 87') + shape('M25 45Q50 29 75 45Z', light),
      frog: `<ellipse cx="50" cy="58" rx="30" ry="23" fill="${accent}"/>` + circle(30, 32, 12, light) + circle(70, 32, 12, light) + circle(30, 32, 4, dark) + circle(70, 32, 4, dark) + stroke('M35 61Q50 73 65 61M22 66L10 81L29 83M78 66L90 81L71 83'),
      lamb: [circle(31, 46, 17), circle(52, 38, 22), circle(67, 49, 19), circle(44, 56, 21)].join('') + shape('M69 28L85 33L87 56L72 61L63 47Z', accent) + circle(79, 40, 3, dark) + stroke('M29 69V85M54 70V85'),
      sea: shape('M3 18Q36 31 31 77L7 88Z', accent) + shape('M97 18Q64 31 69 77L93 88Z', light) + shape('M46 20L33 92H68L56 20Z', accent) + stroke('M6 39Q25 47 25 60M95 39Q75 47 76 60'),
      bread, loaf: bread,
      tablets: shape('M10 83V30A19 19 0 0 1 38 13L49 20L61 13A19 19 0 0 1 90 30V83Z', light) + stroke('M50 20V83M21 33H39M21 47H39M21 61H39M62 33H80M62 47H80M62 61H80'),
      calf: shape('M22 54L17 33L32 41L44 36L71 40L83 55L76 74H30Z', accent) + shape('M68 40L73 17L83 14L80 38L91 32L94 39L88 59L78 58Z', light) + stroke('M32 74V88M65 74V88') + circle(84, 44, 2, dark),
      shield: shape('M50 8L85 22V55Q81 82 50 94Q19 82 15 55V22Z', accent) + shape('M50 20L73 30V55Q70 73 50 82Q30 73 27 55V30Z', light) + stroke('M50 32V70M34 48H66'),
      sanctuary: shape('M8 40L50 16L92 40V87H8Z', accent) + shape('M29 87V41H70V87Z', light) + rect(45, 43, 10, 44, base) + stroke('M16 40H84M20 49V80M81 49V80'),
      censer: shape('M19 62H81Q75 87 50 89Q24 87 19 62Z', accent) + stroke('M23 62L50 11L78 62M50 11V61M37 54Q26 40 38 28M63 53Q76 42 63 30'),
      scroll, deed: scroll + circle(57, 69, 8, accent), letter: rect(11, 27, 78, 53, light) + shape('M11 27L50 57L89 27Z', accent),
      trumpet: shape('M9 51L37 54Q59 59 76 33L81 13L97 24L87 45Q71 76 40 68L8 64Z', accent) + stroke('M76 33L87 45M37 54L39 68'),
      grapes: stroke('M49 25L59 8') + shape('M50 23Q21 2 26 27Q37 37 50 23Z', light) + [[36,39],[61,39],[26,57],[50,57],[73,57],[38,76],[62,76],[50,91]].map(([x,y])=>circle(x,y,10,accent)).join(''),
      staff: shape('M42 91V29Q42 4 68 12Q89 19 75 39L65 33Q73 22 62 22Q53 22 54 32V91Z', accent) + (detail % 2 ? shape('M54 62Q83 44 76 67Q65 80 54 73Z', light) : ''),
      sandals: `<g transform="rotate(-18 50 50)">${rect(15, 12, 29, 75, accent, 13)}${rect(57, 18, 29, 75, light, 13)}${stroke('M18 36L40 49M18 56L40 43M60 42L82 55M60 62L82 49')}</g>`,
      rock: stone + `<path d="M53 55Q48 83 64 92M63 59Q61 83 77 90" stroke="${accent}" stroke-width="7" fill="none"/>`,
      snake: stroke('M50 8V91M30 28H72') + `<path d="M70 22Q12 22 31 47Q74 50 69 67Q68 80 44 76" stroke="${accent}" stroke-width="9" fill="none"/>` + circle(70, 22, 6, light),
      gate, door: gate,
      donkey: shape('M23 49L65 44L68 18L77 9L79 36L89 46L85 61L73 59L64 74H25L16 65Z', light) + stroke('M27 73V91M56 73V91M15 54L8 42') + circle(78, 46, 3, dark) + rect(33, 43, 22, 17, accent),
      river: shape('M41 9Q81 23 49 43Q16 61 60 91H81Q42 60 72 41Q99 15 61 9Z', light) + stroke('M47 16Q67 23 42 42M47 66L64 82'),
      mountain: shape('M5 87L48 12L96 87Z', accent) + shape('M48 12L29 46L45 39L56 50L65 41Z', light) + stroke('M48 51L37 77'),
      mountains: shape('M3 88L32 29L65 88Z', accent) + shape('M40 88L68 12L98 88Z', light),
      stones: `<g transform="translate(5 25) scale(.57)">${stone}</g><g transform="translate(41 20) scale(.57)">${stone}</g><g transform="translate(24 45) scale(.57)">${stone}</g>`,
      stone, map: shape('M9 24L36 14L65 25L91 15V78L65 88L36 77L9 87Z', light) + stroke('M36 14V77M65 25V88') + `<path d="M20 62Q28 34 49 54T81 40" stroke="${accent}" stroke-width="5" fill="none" stroke-dasharray="4 5"/>`,
      torch: shape('M34 48L43 91H59L67 48Z', accent) + `<g transform="translate(20 -5) scale(.6)">${flame}</g>` + stroke('M34 51H67M39 63H62'),
      pillars: rect(17, 26, 19, 54, light) + rect(64, 26, 19, 54, light) + rect(11, 15, 32, 13, accent) + rect(57, 15, 32, 13, accent) + rect(10, 81, 80, 10, accent),
      pillar: rect(33, 21, 34, 60) + rect(25, 12, 50, 12, accent) + rect(24, 81, 52, 12, accent) + stroke('M43 32V72M56 32V72'),
      lamp, chest: rect(13, 38, 74, 43, accent) + shape('M13 38Q16 14 50 14Q84 14 87 38Z', light) + stroke('M23 24V81M77 24V81M13 48H87') + rect(45, 45, 11, 16, light),
      crown, throne: crown + rect(22, 83, 56, 9, accent), horn: shape('M16 85Q72 89 85 18L67 11Q70 62 16 70Z', accent) + stroke('M62 34L80 41M48 54L66 66'),
      sword: shape('M67 8L83 8L83 24L47 60L40 53Z', light) + shape('M23 47L53 77L61 69L30 40Z', accent) + shape('M34 59L16 77L23 85L42 67Z', accent),
      robe: shape('M31 17L12 32L5 54L25 62L29 48L21 91H80L71 48L75 62L95 54L88 32L68 17L50 29Z', light) + stroke('M50 30V91M32 62H69') + rect(42, 58, 16, 9, accent),
      sling: `<path d="M25 18Q27 55 45 68L55 68Q74 55 78 18" fill="none" stroke="${light}" stroke-width="4"/>` + shape('M36 62Q50 54 65 62L58 79H43Z', accent) + circle(50, 66, 6, light) + stroke('M43 78L28 94M57 78L74 94'),
      cave: shape('M7 89L15 41L39 15L68 13L91 42L95 89Z', accent) + shape('M26 89V56Q29 36 51 36Q75 40 76 59V89Z', dark) + stroke('M16 40L35 30M81 45L70 28'),
      harp: shape('M19 18L34 88H72L90 15Q72 6 55 19Q40 28 19 18Z', accent) + stroke('M29 24L42 76M43 23L48 77M58 18L55 78M73 13L63 79'),
      lyre: shape('M19 16Q-2 85 48 91Q99 86 80 16L67 17Q78 70 49 76Q22 70 33 17Z', accent) + stroke('M20 28H80M41 29V75M52 29V75M63 29V73'),
      heart: shape('M50 87L16 53Q-1 26 22 16Q39 9 50 28Q61 9 79 16Q102 26 85 53Z', light) + stroke('M27 30Q17 39 28 51'),
      book, vine: branch + [circle(31, 49, 7), circle(72, 60, 7), circle(29, 71, 7)].join(''),
      temple: shape('M9 29L50 9L91 29Z', accent) + rect(14, 31, 72, 9) + [23, 45, 67].map(x=>rect(x,40,11,38,light)).join('') + rect(9,79,82,10,accent),
      coins: [circle(31,65,19),circle(63,61,22,light),circle(48,34,21)].join('') + stroke('M48 23V44M39 34H57M63 50V73M54 61H72'),
      coin: circle(50,50,34,accent) + circle(50,50,26,light) + shape('M50 28Q68 29 65 48L58 57L63 71H34L41 57Q29 42 39 32Z', accent),
      twocoins: circle(32,58,24,accent) + circle(70,43,24,light) + stroke('M32 44V73M20 58H44M70 30V55M59 43H82'),
      scale: stroke('M50 12V87M19 26H81M17 89H83M25 27L11 64M25 27L39 64M75 27L61 64M75 27L89 64') + shape('M7 63H43Q27 88 7 63ZM57 63H93Q77 88 57 63Z', accent) + circle(50,17,6,light),
      raven: shape('M16 59Q13 34 36 31L47 8L57 34Q78 34 80 59L93 69L74 72Q65 88 45 76L24 88L28 70Z', accent) + circle(44,43,3,dark) + stroke('M39 52Q57 48 66 66'),
      cloud: shape('M14 70Q-1 46 22 41Q23 14 50 20Q67 9 80 35Q104 36 95 63Q96 75 81 76H26Z', light) + stroke('M24 85L19 94M48 85L43 94M72 85L67 94'),
      plough: stroke('M12 21L73 84L91 84M43 55L74 16M63 30L85 20') + shape('M17 78L44 58L59 74L40 88Z', accent),
      salt: shape('M15 62H86Q72 90 50 87Q28 90 15 62Z', accent) + shape('M23 62L40 40L50 49L64 30L79 62Z', light) + circle(53,20,3,light) + circle(35,29,3,light),
      fish, axe: shape('M28 88L62 12L72 16L39 93Z', accent) + shape('M44 27L58 4Q91 4 93 30L80 47Z', light),
      ship: boat + stroke('M17 74H84'), boat,
      chain, coal: shape('M23 70L29 42L52 27L77 42L81 70L53 85Z', accent) + shape('M37 65L41 49L57 44L68 59L61 73Z', light) + stroke('M34 30L26 18M66 29L73 15'),
      eagle: shape('M50 74L29 91L35 63Q10 56 4 15Q28 29 44 43L51 27L62 33L58 46Q81 25 96 16Q89 61 65 63L72 91Z', light) + stroke('M15 29L34 51M82 31L66 51') + circle(54,35,2,dark),
      sundial: `<ellipse cx="50" cy="63" rx="40" ry="22" fill="${accent}"/>` + shape('M36 65L60 11L66 65Z', light) + stroke('M16 65H84M28 51L73 74M32 78L73 48'),
      sun: circle(50,50,25,accent) + [0,45,90,135,180,225,270,315].map(deg=>`<path d="M50 5V15" transform="rotate(${deg} 50 50)" stroke="${light}" stroke-width="5"/>`).join(''),
      banner: stroke('M22 9V93') + shape('M23 13H85L71 33L85 52H23Z', accent) + circle(49,31,10,light),
      branch, olive: branch,
      yoke: shape('M9 32Q27 55 50 37Q74 53 91 32V49Q75 65 51 51Q27 66 9 49Z', accent) + stroke('M28 52V71Q29 95 44 72V55M64 55V72Q74 96 79 72V56'),
      statue: circle(50,15,10,accent) + shape('M33 28H67L77 56L62 61L61 79L74 91H50L49 62L44 91H27L39 74L38 59L22 54Z', light) + stroke('M33 42H68M38 59H61M44 77H60'),
      furnace: shape('M15 91V39L29 19H71L85 39V91Z', accent) + shape('M29 91V49Q50 27 71 49V91Z', dark) + `<g transform="translate(25 41) scale(.51)">${flame}</g>` + stroke('M15 39H85'),
      writing: rect(9,15,82,73,accent) + stroke('M20 32H51M20 47H63M20 62H45M55 63L77 39') + shape('M63 24Q73 9 86 18L88 37L74 46L65 36Z',light),
      lion: [circle(50,49,37,accent),circle(21,27,11,accent),circle(79,27,11,accent)].join('') + shape('M28 35Q49 18 72 35L70 64L51 82L29 65Z',light) + circle(38,47,3,dark) + circle(62,47,3,dark) + shape('M42 61H58L50 70Z',dark) + stroke('M37 74L50 78L63 74'),
      hammer: shape('M27 85L66 29L74 36L37 93Z',accent) + shape('M37 19L54 5L88 30L75 47L61 35L48 40L39 32L48 27Z',light),
      menorah: stroke('M50 21V87M17 88H83') + `<path d="M15 32V52Q50 88 85 52V32M30 28V47Q50 66 70 47V28" fill="none" stroke="${accent}" stroke-width="7"/>` + [15,30,50,70,85].map((x,i)=>shape(`M${x} ${i===2?3:12}Q${x+10} ${i===2?21:30} ${x} ${i===2?23:32}Q${x-10} ${i===2?21:30} ${x} ${i===2?3:12}Z`,light)).join(''),
      scepter: shape('M30 89L67 27L75 32L41 94Z',accent) + circle(72,23,14,light) + circle(72,23,7,accent),
      quill: shape('M18 90L83 10Q94 47 56 63L44 62L42 76Z',light) + stroke('M24 83L73 24M45 64L43 43M56 51L55 30M39 73L59 72'),
      cup, trowel: shape('M33 39L80 83L10 75Z',light) + shape('M38 47L65 15L74 23L48 56Z',accent),
      lily: branch + shape('M51 53Q22 49 20 23Q43 20 51 40Q59 19 82 23Q79 49 51 53Z',light),
      star: shape('M50 5L62 35L96 39L70 60L80 93L50 74L20 93L30 60L4 39L38 35Z',accent) + shape('M50 23L57 45L76 47L62 59L66 77L50 65L34 77L38 59L24 47L43 45Z',light),
      hourglass: rect(23,8,54,8,accent) + rect(23,84,54,8,accent) + shape('M30 16Q26 36 46 50Q27 65 30 84H70Q74 65 54 50Q74 35 70 16Z',light) + shape('M34 72L50 58L66 72V83H34ZM35 28H65L50 44Z',accent),
      manger: shape('M11 42H89L75 68H27Z',accent) + stroke('M25 68L16 89M73 68L84 89M27 57H74') + shape('M28 39Q47 18 75 40Z',light) + circle(38,31,8,light),
      dove: shape('M13 52L40 43Q50 5 71 12L62 42Q83 36 90 47L98 50L84 55Q70 78 44 66L14 83L24 63Z',light) + circle(82,46,2,dark) + stroke('M43 54L64 27'),
      gifts: rect(13,37,34,42,accent) + rect(50,25,38,54,light) + stroke('M30 37V79M50 48H88M69 25V79') + shape('M68 25Q48 24 51 11Q67 5 69 23Q72 4 85 11Q93 24 68 25Z',accent),
      carpenter: shape('M13 22L24 13L86 80L75 90Z',accent) + shape('M70 8L90 24L40 69L24 48Z',light) + stroke('M32 42L46 58M46 31L59 46M59 20L72 33'),
      reed: stroke('M37 91L46 9M65 91L67 17') + shape('M43 31Q13 25 23 57L39 72M45 48Q77 31 69 59L42 75',accent),
      waterpots: `<g transform="translate(-2 19) scale(.63)">${jar}</g><g transform="translate(37 10) scale(.63)">${jar}</g>`,
      whip: shape('M24 88L49 42L57 46L33 94Z',accent) + stroke('M50 43Q12 15 41 11Q60 8 62 30Q97 5 89 39Q71 54 63 26M58 42Q81 70 91 51'),
      well: rect(20,57,61,32,accent) + stroke('M20 70H81M39 57V70M62 70V89M16 57V26M85 57V26M15 31H85M53 31V66') + shape('M9 25L50 6L91 25Z',light) + rect(45,65,18,17,light),
      house, pool: shape('M9 51L52 31L91 51V80L49 97L9 80Z',accent) + shape('M18 55L52 40L82 55L49 69Z',light) + stroke('M26 57L50 48L71 56M49 70V96'),
      net: shape('M12 14L86 22L78 80Q43 100 22 78Z',light) + stroke('M17 32L83 39M19 49L81 56M22 65L79 72M30 18L38 88M48 18L53 89M66 20L68 85') + circle(26,80,5,accent),
      mat: shape('M15 16L71 12L87 77L34 88Z',accent) + stroke('M24 28L73 23M28 43L76 37M31 59L80 52M36 74L83 67'),
      helmet: shape('M18 57Q16 19 52 17Q91 21 83 60H68L70 84H56L46 59H18Z',light) + shape('M25 29Q30 4 67 10L85 26L72 34L61 20L43 20Z',accent) + stroke('M19 52H80'),
      seed: [circle(32,63,9,accent),circle(56,75,8,light),circle(75,58,7,accent)].join('') + stroke('M48 57V17') + shape('M48 39Q18 35 26 15Q48 17 48 39ZM49 32Q73 29 77 11Q53 8 49 32Z',light),
      fringe: shape('M18 12L79 19L83 70L16 69Z',light) + stroke('M18 53H81M21 69V89M34 69V92M48 69V89M62 69V92M77 69V89') + shape('M17 45H80V54H17Z',accent),
      palm: stroke('M48 93Q62 52 53 24') + shape('M53 26Q8 6 6 43Q24 25 49 33Q12 36 17 63Q30 45 52 35Q94 39 93 67Q70 44 56 36Q102 26 89 10Q71 17 56 29Z',accent),
      breadfish: `<g transform="translate(-5 4) scale(.72)">${bread}</g><g transform="translate(26 40) scale(.72)">${fish}</g>`,
      wave: shape('M5 83Q17 69 35 67Q22 20 55 13Q88 12 82 42Q70 29 61 36Q46 50 68 65Q91 60 97 82Z',light) + stroke('M15 79Q31 66 50 79T88 79'),
      basin: shape('M10 39H90Q81 78 49 80Q19 76 10 39Z',accent) + `<ellipse cx="50" cy="39" rx="40" ry="11" fill="${light}"/>` + shape('M56 39H75L85 89L58 87Z',light) + stroke('M62 71H80M63 78H82'),
      crumbs: `<g transform="translate(4 -3) scale(.88)">${bread}</g>` + [circle(24,86,4,light),circle(44,91,3,accent),circle(69,82,5,light)].join(''),
      keys: circle(34,30,18,accent) + circle(34,30,7,dark) + shape('M43 42L84 84L92 77L85 69L77 76L69 68L76 61L67 52L61 58L49 36Z',light),
      fishcoin: `<g transform="translate(0 16) scale(.86)">${fish}</g>` + circle(26,27,14,accent) + stroke('M26 19V35'),
      branches: `<g transform="rotate(-22 50 50)">${branch}</g><g transform="translate(17 3) rotate(17 50 50) scale(.83)">${branch}</g>`,
      flower: stroke('M50 59V93') + [circle(36,26,16,accent),circle(64,26,16,accent),circle(27,48,16,light),circle(73,48,16,light),circle(50,62,16,accent),circle(50,40,16,light)].join('') + circle(50,40,7,accent),
      tomb: shape('M9 89V47Q12 14 49 13Q85 14 88 47V89Z',accent) + shape('M28 89V52Q28 33 48 33Q68 33 68 52V89Z',dark) + circle(79,72,22,light),
      leaf: branch + circle(35,50,5,light),
      breadcup: `<g transform="translate(-4 33) scale(.67)">${bread}</g><g transform="translate(38 -3) scale(.7)">${cup}</g>`,
      rooster: shape('M26 60Q4 34 23 26L39 54L51 46L50 25L58 18L72 23L77 41L87 47L72 50Q76 75 48 80L31 72Z',accent) + shape('M52 22L49 9L61 15L70 6L72 23Z',light) + circle(64,32,3,dark) + stroke('M47 80L42 92M60 77L66 91'),
      thorns: `<ellipse cx="50" cy="52" rx="37" ry="25" fill="none" stroke="${accent}" stroke-width="9"/>` + stroke('M17 41L8 27M35 29L33 12M62 28L72 13M83 43L95 35M81 65L90 83M55 77L54 94M27 72L13 88'),
      cross: shape('M41 9H59V33H84V49H59V92H41V49H16V33H41Z',accent) + stroke('M49 18V84M25 41H75'),
      seal: circle(50,51,36,light) + circle(50,51,24,accent) + stroke('M18 20L83 85M83 19L18 86') + circle(50,51,12,base),
      globe: circle(50,50,37,light) + stroke('M13 50H87M20 30H80M20 70H80M50 13Q18 50 50 87Q82 50 50 13M50 13V87'),
      compass: circle(50,50,36,light) + shape('M68 21L59 60L29 80L40 41Z',accent) + stroke('M50 13V22M13 50H22M78 50H87M50 78V87'),
      chariot: circle(25,79,13,accent) + circle(76,79,13,accent) + shape('M13 38H67V67H21Z',light) + stroke('M66 50L88 24M77 37H96M24 41V23'),
      cloth: shape('M15 14Q50 27 86 14L79 83Q50 96 21 82Z',light) + stroke('M15 14L32 37M86 14L69 37M21 82L38 68M79 83L65 69') + circle(46,48,11,accent) + circle(65,59,8,accent),
      water: shape('M50 8Q89 55 83 73Q77 94 50 95Q24 94 17 73Q11 55 50 8Z',light) + stroke('M28 63Q23 79 40 83'),
      fruit: branch + [circle(31,50,10,accent),circle(70,62,12,light),circle(28,78,9,light)].join(''),
      anchor: stroke('M50 26V84M22 42H78') + circle(50,16,10,light) + shape('M8 58L28 68L21 72Q48 105 79 72L72 68L92 58Q95 93 50 98Q5 93 8 58Z',accent),
      armor: shape('M30 12L15 25L10 48L24 57L31 42V86L51 94L70 85V42L79 55L92 45L83 24L68 12L50 24Z',light) + shape('M33 31L50 40L68 31V68L51 82L33 68Z',accent) + stroke('M50 42V73'),
      city: rect(12,40,76,47,light) + [12,38,65].map(x=>rect(x,21,22,22,accent)).join('') + shape('M38 87V60Q50 41 62 60V87Z',base) + stroke('M17 54H30M70 54H83M17 68H30M70 68H83'),
      mirror: `<ellipse cx="50" cy="39" rx="28" ry="31" fill="${accent}"/><ellipse cx="50" cy="39" rx="19" ry="23" fill="${light}"/>` + rect(44,69,12,24,accent) + stroke('M41 42L56 25M46 54L63 35'),
      bowls: [0,1,2,3,4,5,6].map(i=>`<g transform="translate(${i%4*23} ${i<4?16:56}) scale(.23 .36)">${shape('M5 25H95Q86 86 50 90Q14 86 5 25Z',accent)}</g>`).join(''),
    };
    if (!motifs[kind]) throw new Error(`Missing badge illustration: ${kind}`);
    return g(motifs[kind]);
  }
  function badgeSvg(badgeOrId) {
    const b = typeof badgeOrId === 'string' ? byId.get(badgeOrId) : badgeOrId;
    if (!b) throw new Error('Unknown reading badge');
    const p = palettes[b.palette];
    const [base, dark, accent, light] = p;
    const paths = [
      'M128 12A116 116 0 1 1 127.99 12Z',
      'M128 10L232 49V137Q222 210 128 246Q34 210 24 137V49Z',
      'M65 15H191L241 65V191L191 241H65L15 191V65Z',
      'M128 9L226 66V189L128 246L30 189V66Z',
      'M54 15H202Q241 15 241 54V202Q241 241 202 241H54Q15 241 15 202V54Q15 15 54 15Z',
      'M128 7L156 25L189 25L205 53L234 70L234 103L249 128L234 157L234 190L205 206L189 233L155 233L128 249L101 233L67 233L50 206L22 190L22 157L7 128L22 101L22 69L50 52L67 25L101 25Z',
    ];
    const id = `badge-${b.id}`;
    const spokes = Array.from({ length: 12 }, (_, i) => `<path d="M128 31V43" transform="rotate(${i * 30 + b.detail * 7.5} 128 128)" stroke="${accent}" stroke-width="${b.detail % 2 ? 3 : 1.5}" opacity=".42"/>`).join('');
    const ornament = b.detail === 1 ? `<circle cx="128" cy="125" r="83" stroke="${light}" stroke-dasharray="2 9" stroke-width="2" fill="none" opacity=".5"/>` : b.detail === 2 ? `<path d="M38 128H218M128 36V219" stroke="${light}" stroke-width="1" opacity=".13"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${base}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs><path d="${paths[b.style]}" fill="url(#${id})" stroke="${accent}" stroke-width="5"/><path d="${paths[b.style]}" transform="translate(13 13) scale(.9)" fill="none" stroke="${accent}" stroke-width="1.5" opacity=".7"/>${spokes}${ornament}<circle cx="128" cy="122" r="70" fill="${base}" opacity=".45"/><g transform="translate(49 42) scale(1.58)">${illustration(b.motif,p,b.detail)}</g><rect x="95" y="209" width="66" height="23" rx="11" fill="${dark}" stroke="${accent}" stroke-width="1"/><text x="128" y="226" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="700" fill="${light}">${String(b.day).padStart(3,'0')}</text></svg>`;
  }
  function badgeDataUri(badgeOrId) { return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(badgeSvg(badgeOrId))}`; }
  function getBadge(id) { return byId.get(id); }
  return { catalog, getBadge, badgeSvg, badgeDataUri, escapeHtml: esc };
});
