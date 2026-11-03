// Pixel art: palettes, hero classes, monsters and a sprite cache.
// Sprites are strings; each letter is a palette key, '.' is transparent.
(function () {
  const BASE = {
    K: '#1b1426', // outline
    M: '#d5dbe6', m: '#8691a6', // metal
    W: '#ffffff', w: '#c9cfdc',
    B: '#8b5a2b', b: '#5c3a1e', // wood / leather
    G: '#f5c542', g: '#b8860b', // gold
    L: '#3d3550', l: '#2a2238', N: '#5a4f73', // dark cloth
  };

  const COLORS = [
    { name: 'Crimson', P: '#d6334a', p: '#8e1f35', Q: '#ff6b7a' },
    { name: 'Ember', P: '#ee7b2a', p: '#a8481a', Q: '#ffb061' },
    { name: 'Gold', P: '#e8b923', p: '#a07812', Q: '#ffe26b' },
    { name: 'Emerald', P: '#2fae5a', p: '#1c6e3d', Q: '#6fe08b' },
    { name: 'Teal', P: '#22a9a8', p: '#156a70', Q: '#6fe3d9' },
    { name: 'Azure', P: '#3a6fe0', p: '#233f94', Q: '#7aa7ff' },
    { name: 'Violet', P: '#8b4fd6', p: '#55308f', Q: '#bb8cff' },
    { name: 'Rose', P: '#e05aa8', p: '#94306c', Q: '#ff9ad0' },
  ];

  const SKINS = [
    { S: '#ffd6b0', s: '#e0a983' },
    { S: '#e6b17e', s: '#b98352' },
    { S: '#b07548', s: '#7f4f2c' },
    { S: '#6e4527', s: '#4a2c18' },
  ];

  // Hair and beards (the H/h pixels: elf archer hair, wizard and barbarian beards). 0 keeps the class's own.
  const HAIRS = [
    { name: 'Natural' },
    { name: 'Raven', H: '#2b2233', h: '#17121d' },
    { name: 'Chestnut', H: '#7a4a26', h: '#4f2e15' },
    { name: 'Golden', H: '#f2d16b', h: '#c9a43a' },
    { name: 'Copper', H: '#d9682b', h: '#9c4317' },
    { name: 'Snow', H: '#f4f4f8', h: '#bfc4d4' },
    { name: 'Moss', H: '#6fbf5a', h: '#3f7d33' },
    { name: 'Arcane', H: '#a07aff', h: '#6a48c4' },
  ];

  // Trim: the gold accents (belts, hilts, hat bands, holy symbols).
  const TRIMS = [
    { name: 'Gold', G: '#f5c542', g: '#b8860b' },
    { name: 'Silver', G: '#e3e8f0', g: '#8691a6' },
    { name: 'Bronze', G: '#d08a4a', g: '#8a5428' },
    { name: 'Ruby', G: '#ff5a6e', g: '#a01c2e' },
    { name: 'Jade', G: '#5fe0a0', g: '#2b8a5c' },
    { name: 'Onyx', G: '#5a4f73', g: '#2a2238' },
  ];

  // Companions that trot along beside their hero. 0 is no pet.
  const PETS = [
    null,
    {
      name: 'Cat', pal: { A: '#8a8aa0', a: '#5a5a70', E: '#ffd23f' },
      rows: ['.K....K.', 'KAK..KAK', 'KAAKKAAK', 'KAEAAEAK', 'KAAaaAAK', '.KAAAAK.', '.KAAAAKK', '..KKKKAK'],
    },
    {
      name: 'Owl', pal: { A: '#a0703c', a: '#6e4a24', E: '#ffd23f', Y: '#ff9a3c' },
      rows: ['.K....K.', 'KAKKKKAK', 'KWWAAWWK', 'KWEAAEWK', 'KAAYYAAK', 'KAaAAaAK', '.KAAAAK.', '..Y..Y..'],
    },
    {
      name: 'Slime', pal: { A: '#6fd34f', a: '#3c8f2a' },
      rows: ['........', '...KK...', '..KAAK..', '.KAWAAK.', 'KAAAAAAK', 'KAKAAKAK', 'KaAAAAaK', '.KKKKKK.'],
    },
    {
      name: 'Dragon', pal: { A: '#e8374a', a: '#a01c2e', Y: '#ffd23f' },
      rows: ['Y.....Y.', 'KK...KK.', 'KAKKKAK.', 'KAWAWAKK', '.KAAAAKA', 'KAYYYAKA', '.KAAAAKK', '..KK.KK.'],
    },
    {
      name: 'Fox', pal: { A: '#ee7b2a', a: '#a8481a' },
      rows: ['K.....K.', 'KK...KK.', 'KAKKKAK.', 'KAWAWAK.', '.KAAAK..', '.KWWWKKK', '.KAAAKAW', '..K.KKKK'],
    },
  ];

  const CLASSES = [
    {
      key: 'knight', name: 'Knight', attack: 'Sword Beam', blurb: 'Hurls a shining crescent of steel.',
      perk: 'SWIFT BLADE: +30% on short words (3-5 letters)',
      pal: {},
      rows: [
        '......KPPK......',
        '.....KPQPK......',
        '....KKKKKKKK....',
        '...KMWMMMMMmK.W.',
        '...KMMMMMMMmK.Wm',
        '...KMKKKKKKmK.Wm',
        '...KMSKSSKSmK.Wm',
        '...KMSSSSSSmK.Wm',
        '....KMSssSmK..Wm',
        '.....KKKKKK...Wm',
        '...KKMPPPPMKKGGG',
        '..KMKmPQPPmKMSB.',
        '..KSKMGGGGMK.KB.',
        '....KmPppPmK....',
        '....KMMKKMMK....',
        '....KKK..KKK....',
      ],
    },
    {
      key: 'wizard', name: 'Wizard', attack: 'Fireball', blurb: 'Lobs a roaring ball of flame.',
      perk: 'ARCANE MIND: +30% on long words (8+ letters)',
      pal: { F: '#5ee0ff', H: '#f4f4f8', h: '#c9cfdc' },
      rows: [
        '..........KK....',
        '........KKPK....',
        '.......KPQK.....',
        '.FW...KPQPPK....',
        '.FF..KPQPGPPK...',
        '.BKKppppppppKK..',
        '.B.KSSKSSKSSK...',
        '.B.KSSHHHHSSK...',
        '.B..KHHHHHHK....',
        '.SKPPKHHHhKPPK..',
        '.BKPQPKHhKPPPK..',
        '.BKPPPPGGPPPPK..',
        '.BKpPPPPPPPPpK..',
        '.BKpPPPPPPPPpK..',
        '.BKppppppppppK..',
        '.B.KKKK..KKKK...',
      ],
    },
    {
      key: 'archer', name: 'Elf Archer', attack: 'Piercing Arrow', blurb: 'Never misses. Probably.',
      perk: 'EAGLE EYE: +40% on words hit high up, or attacks blocked early',
      pal: { H: '#f2d16b', h: '#c9a43a' },
      rows: [
        '................',
        '......KKKK......',
        '.....KPPPPK.....',
        '....KPQPPPPK....',
        '...KPPHHHHPPK...',
        '.S.KPHHHHHHPK.S.',
        '..SKPSKSSKSPKS..',
        '...KPSSSSSSPK.B.',
        '....KPSssSPK..WB',
        '...KPPKBBKPPK.WB',
        '..KPPKBBBBKPPSWB',
        '..KPKBbbbbBKPKWB',
        '..KSKBBBBBBK..B.',
        '....KBBBBBBK....',
        '....KLLKKLLK....',
        '....KbbKKbbK....',
      ],
    },
    {
      key: 'rogue', name: 'Rogue', attack: 'Dagger Volley', blurb: 'Three blades, zero hesitation.',
      perk: 'LAST SECOND: +50% on words about to land',
      pal: {},
      rows: [
        '................',
        '......KKKK......',
        '.....KLLLLK.....',
        '....KLNLLLLK....',
        '...KLNLLLLLLK...',
        '...KLllllllLK...',
        '...KLSKSSKSLK...',
        '...KLPPPPPPLK...',
        '....KPQPPPPK....',
        '...KLLKPPKLLK...',
        '.WKLLKLPPLKLLKW.',
        '.MKLKLbGGbLKLKM.',
        '.SKKLLLLLLLLKKS.',
        '....KLLLLLLK....',
        '....KLLKKLLK....',
        '....KbbKKbbK....',
      ],
    },
    {
      key: 'cleric', name: 'Cleric', attack: 'Holy Light', blurb: 'Smites from afar with radiance.',
      perk: 'BLESSED: +50% on special words; power-ups last longer',
      pal: {},
      rows: [
        '......KKKK......',
        '.....KWWWWK.....',
        '....KWWGGWWK....',
        '...KWWWGGWWwK...',
        '...KPPPPPPPPK...',
        '...KSSSSSSSSK.G.',
        '...KSSKSSKSSKGWG',
        '...KsSSSSSSsK.G.',
        '....KSSKKSSK..B.',
        '...KwWKPPKWwK.B.',
        '..KWWKWPPWKWWSB.',
        '..KWKWWPPWWKWKB.',
        '..KSKWWPPWWK..B.',
        '...KwWWPPWWwK.B.',
        '...KwWWPPWWwK.B.',
        '...KKKKKKKKKK.B.',
      ],
    },
    {
      key: 'barbarian', name: 'Barbarian', attack: 'Spinning Axe', blurb: 'Throws first. Asks never.',
      perk: 'CLEAVE: +30% on 6-7 letter words',
      pal: { H: '#d9682b', h: '#9c4317' },
      rows: [
        '................',
        '.W............W.',
        '.WW..KKKKKK..WW.',
        '..WWKMMMMMMKWW..',
        '...KMWMMMMMmK...',
        '...KKKKKKKKKK.MM',
        '...KSSKSSKSSKBMW',
        '...KSHHHHHHSKBMW',
        '....KHHHHHHK.BMM',
        '..KSSKHHHHKSSB..',
        '..KSKPPHHPPKSB..',
        '..KSKPSSSSPKSB..',
        '..KSKbbGGbbKSB..',
        '....KPpPPpPK.B..',
        '....KSSKKSSK.B..',
        '....KbbKKbbK....',
      ],
    },
  ];

  const MONSTERS = {
    slime: {
      pal: { A: '#6fd34f', a: '#3c8f2a', W: '#e9ffd9' },
      fx: ['#6fd34f', '#3c8f2a', '#b6f59a'],
      death: 'splat',
      frameMs: 380,
      frames: [
        [
          '............',
          '....KKKK....',
          '..KKAAAAKK..',
          '.KAWWAAAAAK.',
          '.KAWAAAAAAK.',
          'KAAAAAAAAAAK',
          'KAAKAAAAKAAK',
          'KAAKAAAAKAAK',
          'KaAAAAAAAAaK',
          '.KKKKKKKKKK.',
        ],
        [
          '............',
          '............',
          '...KKKKKK...',
          '.KKAWWAAAAKK',
          'KAAWAAAAAAAK',
          'KAAAAAAAAAAK',
          'KAAKAAAAKAAK',
          'KAAKAAAAKAAK',
          'KaaAAAAAAaaK',
          'KKKKKKKKKKKK',
        ],
      ],
    },
    bat: {
      pal: { A: '#7a55b0', a: '#45306b', R: '#ff3b3b', W: '#ffffff' },
      fx: ['#7a55b0', '#45306b', '#ff3b3b'],
      death: 'feathers',
      frameMs: 160,
      frames: [
        [
          'K..............K',
          'KK....K..K....KK',
          'KAK...KAAK...KAK',
          'KAAK.KAAAAK.KAAK',
          'KAAAKARAARAKAAAK',
          '.KAAKAAAAAAKAAK.',
          '..KKKAWAAWAKKK..',
          '.....KAAAAK.....',
          '......KKKK......',
        ],
        [
          '................',
          '......K..K......',
          '......KAAK......',
          '.....KAAAAK.....',
          'KKKKKARAARAKKKKK',
          'KaaaKAAAAAAKaaaK',
          '.KaaKAWAAWAKaaK.',
          '..KaaKAAAAKaaK..',
          '...KK.KKKK.KK...',
        ],
      ],
    },
    skull: {
      pal: { W: '#efe6d0', R: '#e8371c', Y: '#ffd23f', O: '#ff7b1c' },
      fx: ['#ff7b1c', '#ffd23f', '#efe6d0', '#e8371c'],
      death: 'shatter',
      frameMs: 120,
      frames: [
        [
          '...Y.....Y..',
          '..YO..Y.YO..',
          '.YOOYYOYOOY.',
          '.YORROORROY.',
          '..KKKKKKKK..',
          '.KWWWWWWWWK.',
          'KWWWWWWWWWWK',
          'KWKKKWWKKKWK',
          'KWKRKWWKRKWK',
          'KWWWWKKWWWWK',
          '.KWWWWWWWWK.',
          '..KWKWWKWK..',
          '...KKKKKK...',
        ],
        [
          '..Y.....Y...',
          '..OY..Y.OY..',
          '.YOOYOYYOOY.',
          '.YORROORROY.',
          '..KKKKKKKK..',
          '.KWWWWWWWWK.',
          'KWWWWWWWWWWK',
          'KWKKKWWKKKWK',
          'KWKYKWWKYKWK',
          'KWWWWKKWWWWK',
          '.KWWWWWWWWK.',
          '..KWKWWKWK..',
          '...KKKKKK...',
        ],
      ],
    },
    // The boss round's minions: fire spirits that carry the Dragon King's words.
    boss: {
      pal: { Y: '#ffd23f', O: '#ff7b1c', R: '#e8371c', W: '#ffffff' },
      fx: ['#ff7b1c', '#ffd23f', '#e8371c', '#7a1010'],
      death: 'burst',
      frameMs: 110,
      frames: [
        [
          '....Y.......',
          '...YO..Y....',
          '..YOOY.OY...',
          '..YOROYOOY..',
          '.YORRROROY..',
          '.YORWRRWROY.',
          '.YORKRRKROY.',
          '.YORRRRRROY.',
          '..YORRRROY..',
          '...YOOOOY...',
          '....YYYY....',
        ],
        [
          '.......Y....',
          '....Y..OY...',
          '...YOY.OOY..',
          '..YOOYYORY..',
          '.YORRROROY..',
          '.YORWRRWROY.',
          '.YORKRRKROY.',
          '.YORRRRRROY.',
          '..YORRRROY..',
          '...YOOOOY...',
          '....YYYY....',
        ],
      ],
    },
  };

  // The Dragon King, drawn as the left half of the face and mirrored. Frame 1 roars.
  const mirror = (rows) => rows.map((r) => r + [...r].reverse().join(''));
  const BOSS_TOP = [
    '............G..G',
    '.H.........GGGGG',
    '.HH........GYGGG',
    '..HH......Kggggg',
    '...HH...KKKRRRRR',
    '...hHH.KRRRRRRRR',
    '....hHKRRrRRRRRR',
    '.....KRRrRRRRRRR',
    '....KRRKKKRRRRRR',
    '....KRKYWYKRRRRR',
    '....KRKYYYKRRRRR',
    '....KRRKKKRRRrRR',
    '.....KRRRRRRrRRR',
    '.....KRRRRRRRRRR',
    '......KRRRRRKRRR',
    '......KRRRROOOOO',
    '.......KRROOOOOO',
  ];
  const BOSS = {
    pal: { R: '#c0262e', r: '#7a1418', O: '#ff9a3c', Y: '#ffd23f', H: '#efe6d0', h: '#a89c80' },
    frames: [
      mirror(BOSS_TOP.concat([
        '.......KRKKKKKKK',
        '........KROOOOOO',
        '.........KKKKKKK',
        '................',
        '................',
      ])),
      mirror(BOSS_TOP.concat([
        '.......KRWKWKWKW',
        '........KrrrrrOO',
        '........KWKWKWKW',
        '.........KROOOOO',
        '..........KKKKKK',
      ])),
    ],
  };

  // Special falling words carry one of these instead of a monster.
  const SPECIAL_ART = {
    gold: {
      name: 'GOLD', color: '#ffd23f', pal: {},
      rows: ['...KKKK...', '.KKGGGGKK.', '.KGGWGGgK.', 'KGGWGGGGgK', 'KGGGKKGGgK', 'KGGGKKGGgK', 'KGGGGGGGgK', '.KGGGGGgK.', '.KKggggKK.', '...KKKK...'],
    },
    ice: {
      name: 'ICE', color: '#7fd4ff', pal: { I: '#bfe9ff', i: '#5fb8ff' },
      rows: ['....KK....', '...KIiK...', '.K.KIiK.K.', 'KIKKIiKKIK', '.KIIWWIIK.', '.KiiWWiiK.', 'KIKKIiKKIK', '.K.KIiK.K.', '...KIiK...', '....KK....'],
    },
    bomb: {
      name: 'BOMB', color: '#ff7b1c', pal: { Y: '#ffd23f', O: '#ff7b1c' },
      rows: ['......Y.O.', '.....O.Y..', '....KB....', '...KKKK...', '..KLLLLK..', '.KLWLLLLK.', '.KLWLLLLK.', '.KLLLLLLK.', '.KLLLLLlK.', '..KLLLlK..', '...KKKK...'],
    },
  };

  const CROWN = {
    pal: { R: '#e8374a', Y: '#4da6ff' },
    rows: ['K....K....K', 'GK..KGK..KG', 'GGKKGGGKKGG', 'GGGGGGGGGGG', 'GRGGGYGGGRG', 'ggggggggggg', 'KKKKKKKKKKK'],
  };

  // Small rotatable axe used by the barbarian's projectile.
  const AXE = [
    '..KKK..',
    '.KMMWK.',
    'KMMMWK.',
    'KMMBMK.',
    '.KKBKK.',
    '...B...',
    '...B...',
  ];

  // Team battle power-ups: the item that floats in the middle of the field.
  const POWERS = {
    potion: {
      name: 'HEALTH POTION', short: 'HEAL', color: '#ff5a6e',
      pal: { R: '#e8374a', r: '#a01c2e' },
      rows: [
        '....KK....',
        '...KbbK...',
        '...KbbK...',
        '....KK....',
        '...KWWK...',
        '..KRWRRK..',
        '.KRRRRRRK.',
        '.KRWRRRRK.',
        '.KRRRRRrK.',
        '.KrRRRRrK.',
        '..KrrrrK..',
        '...KKKK...',
      ],
    },
    slow: {
      name: 'SLOW TIME', short: 'SLOW', color: '#7fd4ff',
      pal: { C: '#9fd7ff', Y: '#ffd23f' },
      rows: [
        'KKKKKKKKKK',
        'KGGGGGGGgK',
        '.KCCCCCCK.',
        '.KWYYYYCK.',
        '..KWYYCK..',
        '...KYYK...',
        '...KCYK...',
        '..KCCYCK..',
        '.KCCYYYCK.',
        '.KCYYYYYK.',
        'KGGGGGGGgK',
        'KKKKKKKKKK',
      ],
    },
    haste: {
      name: 'HASTE', short: 'HASTE', color: '#ffe14d',
      pal: { Y: '#ffe14d', y: '#d9a514' },
      rows: [
        '.....KKKK.',
        '....KYYYK.',
        '...KYYYK..',
        '..KYYyK...',
        '.KYYYKKKK.',
        'KYYYYYYYK.',
        'KKKKYYyK..',
        '...KYYK...',
        '..KYyK....',
        '..KYK.....',
        '.KYK......',
        '.KK.......',
      ],
    },
    shield: {
      name: 'SHIELD', short: 'SHIELD', color: '#7aa7ff',
      pal: { A: '#3a6fe0', a: '#233f94' },
      rows: [
        '.KKKKKKKK.',
        'KMMMMMMMMK',
        'KMAAAAAAmK',
        'KMAWAAAAmK',
        'KMAAGGAAmK',
        'KMAAGGAAmK',
        'KMAAAAAamK',
        '.KMAAAAmK.',
        '.KMAAAamK.',
        '..KMAamK..',
        '...KMmK...',
        '....KK....',
      ],
    },
    fury: {
      name: 'FURY', short: 'FURY', color: '#ff7b1c',
      pal: { R: '#e8371c', O: '#ff7b1c', Y: '#ffd23f' },
      rows: [
        '....KK....',
        '...KRK....',
        '...KRRK...',
        '..KRORK.K.',
        '..KROORKRK',
        '.KROOORRK.',
        '.KROYYORK.',
        'KROOYYOORK',
        'KROYYYYORK',
        'KROYWWYORK',
        '.KROYYORK.',
        '..KKKKKK..',
      ],
    },
  };

  function paint(rows, pal) {
    const c = document.createElement('canvas');
    c.width = rows[0].length;
    c.height = rows.length;
    const g = c.getContext('2d');
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const col = pal[row[x]];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    });
    return c;
  }

  const cache = new Map();
  const classByKey = (key) => CLASSES.find((c) => c.key === key) || CLASSES[0];

  const classHasHair = (key) => classByKey(key).rows.some((r) => r.includes('H'));
  const lookKey = (look) => `${look.cls}:${look.color}:${look.skin}:${look.hair || 0}:${look.trim || 0}`;

  function heroSprite(look) {
    const cls = classByKey(look.cls);
    const color = COLORS[look.color] || COLORS[0];
    const skin = SKINS[look.skin] || SKINS[0];
    const hair = HAIRS[look.hair] && look.hair > 0 ? { H: HAIRS[look.hair].H, h: HAIRS[look.hair].h } : {};
    const trim = TRIMS[look.trim] || TRIMS[0];
    const key = `hero:${lookKey(look)}`;
    if (!cache.has(key)) {
      cache.set(key, paint(cls.rows, { ...BASE, ...color, ...skin, ...cls.pal, ...hair, G: trim.G, g: trim.g }));
    }
    return cache.get(key);
  }

  function heroDataURL(look) {
    const key = `url:${lookKey(look)}`;
    if (!cache.has(key)) cache.set(key, heroSprite(look).toDataURL());
    return cache.get(key);
  }

  function petSprite(index) {
    const pet = PETS[index];
    if (!pet) return null;
    if (!cache.has(`pet:${index}`)) cache.set(`pet:${index}`, paint(pet.rows, { ...BASE, ...pet.pal }));
    return cache.get(`pet:${index}`);
  }

  function petDataURL(index) {
    if (!PETS[index]) return '';
    if (!cache.has(`peturl:${index}`)) cache.set(`peturl:${index}`, petSprite(index).toDataURL());
    return cache.get(`peturl:${index}`);
  }

  function monsterSprite(type, frame) {
    const m = MONSTERS[type] || MONSTERS.slime;
    const key = `mon:${type}:${frame}`;
    if (!cache.has(key)) cache.set(key, paint(m.frames[frame % m.frames.length], { ...BASE, ...m.pal }));
    return cache.get(key);
  }

  function axeSprite() {
    if (!cache.has('axe')) cache.set('axe', paint(AXE, BASE));
    return cache.get('axe');
  }

  function powerSprite(key) {
    const p = POWERS[key] || POWERS.potion;
    if (!cache.has(`pow:${key}`)) cache.set(`pow:${key}`, paint(p.rows, { ...BASE, ...p.pal }));
    return cache.get(`pow:${key}`);
  }

  function powerDataURL(key) {
    if (!cache.has(`powurl:${key}`)) cache.set(`powurl:${key}`, powerSprite(key).toDataURL());
    return cache.get(`powurl:${key}`);
  }

  function bossSprite(frame) {
    const key = `boss:${frame % 2}`;
    if (!cache.has(key)) cache.set(key, paint(BOSS.frames[frame % 2], { ...BASE, ...BOSS.pal }));
    return cache.get(key);
  }

  function specialSprite(kind) {
    const s = SPECIAL_ART[kind] || SPECIAL_ART.gold;
    if (!cache.has(`sp:${kind}`)) cache.set(`sp:${kind}`, paint(s.rows, { ...BASE, ...s.pal }));
    return cache.get(`sp:${kind}`);
  }

  function crownDataURL() {
    if (!cache.has('crown')) cache.set('crown', paint(CROWN.rows, { ...BASE, ...CROWN.pal }).toDataURL());
    return cache.get('crown');
  }

  window.Art = {
    BASE, COLORS, SKINS, HAIRS, TRIMS, PETS, CLASSES, MONSTERS, POWERS, SPECIAL_ART,
    classByKey, classHasHair, heroSprite, heroDataURL, petSprite, petDataURL,
    monsterSprite, axeSprite, powerSprite, powerDataURL, bossSprite, specialSprite, crownDataURL,
  };
})();
