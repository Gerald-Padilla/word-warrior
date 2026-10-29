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

  const CLASSES = [
    {
      key: 'knight', name: 'Knight', attack: 'Sword Beam', blurb: 'Hurls a shining crescent of steel.',
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
      pal: { F: '#5ee0ff' },
      rows: [
        '..........KK....',
        '........KKPK....',
        '.......KPQK.....',
        '.FW...KPQPPK....',
        '.FF..KPQPGPPK...',
        '.BKKppppppppKK..',
        '.B.KSSKSSKSSK...',
        '.B.KSSWWWWSSK...',
        '.B..KWWWWWWK....',
        '.SKPPKWWWWKPPK..',
        '.BKPQPKWWKPPPK..',
        '.BKPPPPGGPPPPK..',
        '.BKpPPPPPPPPpK..',
        '.BKpPPPPPPPPpK..',
        '.BKppppppppppK..',
        '.B.KKKK..KKKK...',
      ],
    },
    {
      key: 'archer', name: 'Elf Archer', attack: 'Piercing Arrow', blurb: 'Never misses. Probably.',
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

  function heroSprite(look) {
    const cls = classByKey(look.cls);
    const color = COLORS[look.color] || COLORS[0];
    const skin = SKINS[look.skin] || SKINS[0];
    const key = `hero:${cls.key}:${look.color}:${look.skin}`;
    if (!cache.has(key)) cache.set(key, paint(cls.rows, { ...BASE, ...color, ...skin, ...cls.pal }));
    return cache.get(key);
  }

  function heroDataURL(look) {
    const key = `url:${look.cls}:${look.color}:${look.skin}`;
    if (!cache.has(key)) cache.set(key, heroSprite(look).toDataURL());
    return cache.get(key);
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

  window.Art = { BASE, COLORS, SKINS, CLASSES, MONSTERS, classByKey, heroSprite, heroDataURL, monsterSprite, axeSprite };
})();
