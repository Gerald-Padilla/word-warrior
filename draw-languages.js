// Draw battle: what language each word is in, so the screens can tell guessers whether to type it in
// English or Tagalog. Each category has a usual language and only the exceptions are listed here, by the
// name before any "|". TAGLISH is a mix ("buko pie", "sari sari store"). Words from other languages that
// are used as is (sushi, despacito) count as English. Names (characters, stars, ISD people) and the host's
// own words have no language.
const USUAL = {
  things: 'ENGLISH', verbs: 'ENGLISH', animals: 'ENGLISH', food: 'ENGLISH', pinoyfood: 'TAGALOG',
  pinoy: 'TAGALOG', movies: 'ENGLISH', songs: 'ENGLISH',
};

const EXCEPTIONS = {
  things: {
    TAGALOG: [
      'bahay kubo', 'balut', 'bangka', 'parol', 'salakot', 'tabo', 'tsinelas', 'kalesa', 'trumpo', 'sipa',
      'walis tingting', 'banig', 'bayong', 'halo halo', 'lechon', 'noche buena', 'pasalubong', 'simbang gabi',
      'patintero', 'tumbang preso', 'luksong baka', 'piko',
    ],
    TAGLISH: ['sari sari store', 'balikbayan box', 'agawan base'],
  },
  animals: { TAGALOG: ['aspin', 'puspin'] },
  pinoyfood: {
    ENGLISH: [
      'fishball', 'banana cue', 'pork barbecue', 'ice candy', 'cassava cake', 'dirty ice cream', 'bicol express',
      'mango float', 'chopsuey', 'macaroni salad', 'helmet', 'mango shake', 'banana chips', 'dried mangoes',
      'betamax', 'adidas', 'squid balls', 'graham float', 'spanish bread', 'walkman', 'proven', 'star bread',
    ],
    TAGLISH: [
      'crispy pata', 'buko pie', 'buko juice', 'chicken inasal', 'camote cue', 'buko salad', 'pili nuts',
      'ube cheese pandesal',
    ],
  },
  pinoy: {
    ENGLISH: [
      "it's showtime", 'captain barbell', 'bubble gang', 'tv patrol', 'family feud', 'shake rattle and roll',
      'one more chance', 'hello love goodbye', 'feng shui', 'rewind', 'miracle in cell no 7', 'deleter',
      'seven sundays', 'starting over again', 'mulawin vs ravena', 'got to believe', 'be careful with my heart',
      'on the wings of love', 'the legal wife', 'the killer bride', 'black rider', 'voltes v legacy', 'rated k',
      'die beautiful', 'barcelona', 'crazy beautiful you', 'my ex and whys', 'exes baggage', 'my amnesia girl',
      'bride for rent', "you're my boss", 'a second chance', 'the healing', 'green bones', 'firefly', 'oki doki doc',
      '100 days to heaven', 'forevermore', 'four sisters and a wedding', 'beauty and the bestie', 'the hows of us',
      'hello love again', 'the super parental guardians', 'a very good girl', 'vince and kath and james',
      'on the job', 'dirty linen', "can't buy me love", 'senior high', 'high street', 'the iron heart',
      'princess and i', 'the mall the merrier', 'uninvited', "rainbow's sunset", 'just the 3 of us',
      'everyday i love you', 'love you to the stars and back', 'unexpectedly yours', "can't help falling in love",
      'tonight with boy abunda', 'the buzz', 'startalk',
    ],
    TAGLISH: [
      'pinoy big brother', 'lastikman', 'goin bulilit', 'okay ka fairy ko', 'home along da riles',
      'praybeyt benjamin', 'wansapanataym', 'that thing called tadhana', 'epol apple', 'math-tinik', 'ang tv',
      'batang x', 'and the breadwinner is',
    ],
  },
  // OPM in Tagalog (OPM in English, like "With a Smile", stays English).
  songs: {
    TAGALOG: [
      'bahay kubo', 'leron leron sinta', 'ako ay may lobo', 'paru-parong bukid', 'tatlong bibe', 'anak', 'otso otso',
      'pusong bato', 'tala', 'pantropiko', 'buko', 'ikaw', 'buwan', 'tadhana', 'harana', 'jopay', 'sitsiritsit',
      'magtanim ay di biro', 'lupang hinirang', 'pasko na naman', 'pen pen de sarapen', 'tong tong tong pakitong kitong',
      'ang huling el bimbo', 'pare ko', 'alapaap', 'torete', 'kilometro', 'hawak kamay', 'kathang isip', 'mundo',
      'gento', 'salamin salamin', 'karera', 'magasin', 'tuloy pa rin', 'pinoy ako', 'boom tarat tarat', 'kisapmata',
      'sirena', 'upuan', 'dati', 'kahit maputi na ang buhok ko', 'bakit ngayon ka lang', 'nandito ako',
      'pangarap lang kita', 'tensionado', 'panalangin', 'chinito', 'mapa', 'binibini', 'sana ngayong pasko',
      'ang pasko ay sumapit', 'bilog na naman ang buwan', 'nobela', 'kahit kailan', 'tindahan ni aling nena',
      'sana maulit muli', 'pangarap ko ang ibigin ka', 'hataw na', 'inuman na', 'huwag muna tayong umuwi',
      'nasa iyo na ang lahat', 'multo', 'toyang', 'ligaya', 'pagtingin', 'magda', 'ere', 'pano', 'uhaw', 'museo',
      'pasilyo', 'dilaw', 'bawat piyesa', 'sining', 'marilag', 'kundiman', 'sa ngalan ng pag-ibig',
      "kung 'di rin lang ikaw", 'bakit pa', 'bituing walang ningning', 'huling sayaw', 'narda', 'balisong', 'himala',
      'hinahanap-hanap kita', 'kanlungan', 'paraluman', 'pagsamo', 'tagpuan', 'paubaya', 'araw-araw',
      'hindi tayo pwede', 'kahit ayaw mo na', 'ikaw ang aking mahal', 'awitin mo at isasayaw ko', 'bonggahan', 'ewan',
      'awit ng barkada', 'himig ng pasko', 'pasko na sinta ko', 'mga kababayan', 'bagsakan', 'halaga', 'buloy',
      "kailangan ko'y ikaw", 'dadalhin', 'gusto ko nang bumitaw', 'prinsesa', 'sige', 'minsan', 'hiling', 'tahanan',
      'mahika', 'sa susunod na habang buhay', 'hanggang kailan', 'alab',
    ],
  },
};

const LOOKUP = new Map();
for (const [cat, langs] of Object.entries(EXCEPTIONS)) {
  for (const [lang, names] of Object.entries(langs)) for (const name of names) LOOKUP.set(`${cat}:${name}`, lang);
}

// 'ENGLISH', 'TAGALOG', 'TAGLISH', or null (a name, or a word the host typed in).
function langOf(cat, name) {
  return LOOKUP.get(`${cat}:${name}`) || USUAL[cat] || null;
}

module.exports = { langOf, USUAL, EXCEPTIONS };
