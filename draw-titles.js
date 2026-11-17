// Draw battle: famous titles, one list per category the host can pick. The drawer acts the title out in
// pictures (a scene, a character, a play on the words). Same rules as the character lists: lowercase,
// other accepted names after a "|", punctuation and a leading "the" / "a" / "ang" optional when guessing.
module.exports = {
  // Philippine TV shows and movies.
  pinoy: {
    easy: [
      'eat bulaga', "it's showtime|showtime", 'darna', "ang probinsyano|fpj's ang probinsyano",
      "batang quiapo|fpj's batang quiapo", 'pinoy big brother|pbb', 'ang panday', 'captain barbell', 'lastikman',
      'encantadia', 'bubble gang', 'tv patrol', '24 oras', 'wowowee', 'marimar', 'shake rattle and roll|shake rattle roll',
      'enteng kabisote',
    ],
    medium: [
      'heneral luna', 'one more chance', 'hello love goodbye', 'kita kita', 'ang tanging ina', 'feng shui', 'rewind',
      'miracle in cell no 7|miracle in cell no seven', 'deleter', 'sukob', 'seven sundays', 'praybeyt benjamin',
      'starting over again', 'jose rizal', 'maalaala mo kaya|mmk', 'wansapanataym', 'home along da riles',
      'pepito manaloto', 'mara clara', 'mulawin', 'goin bulilit', 'okay ka fairy ko', 'batibot',
    ],
    hard: [
      'maria clara at ibarra', 'kadenang ginto', "pangako sa 'yo", 'amaya', 'john en marsha', 'iskul bukol',
      'magpakailanman', 'abot kamay na pangarap', '100 days to heaven', 'forevermore', 'sineskwela',
      'four sisters and a wedding', 'that thing called tadhana|tadhana', 'bagets', 'himala', 'beauty and the bestie',
      'the hows of us', 'hello love again', 'kimmy dora', 'petrang kabayo', 'sisterakas', 'the super parental guardians',
      'dekada 70', 'bata bata paano ka ginawa', 'oro plata mata', 'a very good girl', 'vince and kath and james',
      'gandarrapiddo', 'ang babae sa septic tank', 'magnifico', 'anak', 'tanging yaman', 'on the job',
    ],
  },
  // Famous movies from around the world (Disney, Pixar and DreamWorks have their own lists).
  movies: {
    easy: [
      'titanic', 'jaws', 'star wars', 'harry potter', 'jurassic park', 'avatar', 'spider-man', 'batman', 'superman',
      'king kong', 'godzilla', 'home alone', 'barbie', 'rocky', 'the avengers', 'ghostbusters', 'transformers', 'jumanji',
      'the mummy',
    ],
    medium: [
      'iron man', 'black panther', 'the matrix', 'back to the future', 'pirates of the caribbean', 'the lord of the rings',
      'the hunger games', 'twilight', 'fast and furious|fast and the furious', 'mission impossible', 'james bond',
      'the terminator', 'men in black', 'indiana jones', 'the wizard of oz', 'the karate kid', 'top gun', 'wonder woman',
      'aquaman', 'captain america', 'thor', 'deadpool', 'joker', 'venom', 'the conjuring', 'annabelle', 'train to busan',
      'night at the museum', 'charlie and the chocolate factory', 'mean girls',
    ],
    hard: [
      'the godfather', 'forrest gump', 'oppenheimer', 'inception', 'interstellar', 'the shining', 'the dark knight',
      'la la land', 'the notebook', 'the exorcist', 'psycho', 'the sixth sense', 'life of pi', 'the truman show', 'cast away',
      'the martian', 'dune', 'john wick', 'mad max', 'gladiator', 'braveheart', 'the hangover', 'the devil wears prada',
      'the princess diaries', 'edward scissorhands', 'beetlejuice', 'paddington', 'a quiet place', 'free willy',
      'the parent trap', 'the sound of music', 'grease', 'parasite', 'everything everywhere all at once',
      'slumdog millionaire',
    ],
  },
  // Songs: OPM and international, mixed in every difficulty.
  songs: {
    easy: [
      // OPM, folk and kids' songs
      'bahay kubo', 'leron leron sinta', 'ako ay may lobo', 'paru-parong bukid', 'tatlong bibe', 'anak', 'otso otso',
      'pusong bato', 'tala', 'pantropiko', 'buko', 'ikaw', 'buwan', 'tadhana', 'with a smile', 'harana', 'jopay',
      'christmas in our hearts',
      // International
      'baby shark', 'happy birthday', 'jingle bells', 'twinkle twinkle little star', 'let it go',
      'old macdonald|old macdonald had a farm', 'the wheels on the bus|wheels on the bus', 'row row row your boat',
      'itsy bitsy spider', 'london bridge|london bridge is falling down', 'thriller', 'gangnam style', 'despacito',
      'macarena', 'ymca', 'yellow submarine', 'we will rock you', 'my heart will go on', 'eye of the tiger', 'umbrella',
      'firework', 'roar', 'dynamite',
    ],
    medium: [
      // OPM
      'ang huling el bimbo|huling el bimbo', 'pare ko', 'alapaap', 'torete', 'kilometro', 'hawak kamay', 'beer',
      'kathang isip', 'leaves', 'mundo', 'gento', 'salamin salamin', 'karera', 'magasin', 'migraine', 'tuloy pa rin',
      'pinoy ako', 'boom tarat tarat', 'kisapmata', 'sirena', 'upuan', 'dati', 'kahit maputi na ang buhok ko',
      'bakit ngayon ka lang', 'nandito ako', 'forevermore', 'pangarap lang kita', 'tensionado', 'your love', 'manila',
      'panalangin', 'chinito', 'mapa', 'binibini', 'sana ngayong pasko', 'ang pasko ay sumapit',
      // International
      'bohemian rhapsody', 'shape of you', 'hello', 'happy', 'perfect', 'bad guy', 'flowers', 'shake it off', 'butter',
      'baby', 'dancing queen', 'billie jean', 'imagine', 'yesterday', 'hey jude', 'let it be', 'hotel california',
      'take me home country roads|country roads', 'uptown funk', 'counting stars', 'believer', 'see you again',
      'old town road', 'dance monkey', 'blinding lights', 'bad romance', 'single ladies', 'toxic', 'wannabe',
      'i want it that way', 'my way', 'we are the champions', 'beat it', 'golden', 'apt', 'die with a smile', 'espresso',
      'how you like that', 'gee', 'sorry sorry', 'nobody', 'all i want for christmas is you', 'last christmas',
    ],
    hard: [
      // OPM
      'spoliarium', 'overdrive', 'toyang', 'ligaya', 'pagtingin', 'maybe the night', 'magda', 'ere', 'pano', 'uhaw',
      'museo', 'pasilyo', 'dilaw', 'bawat piyesa', 'sining', 'marilag', 'kundiman', 'sa ngalan ng pag-ibig',
      "kung 'di rin lang ikaw|kung di rin lang ikaw", 'bakit pa', 'bituing walang ningning', 'huling sayaw', 'narda',
      'balisong', 'himala', 'hinahanap-hanap kita', 'kanlungan', 'paraluman', 'pagsamo', 'tagpuan', 'paubaya',
      'araw-araw', 'hindi tayo pwede', 'kahit ayaw mo na', 'ikaw ang aking mahal', 'awitin mo at isasayaw ko',
      'bonggahan', 'mr suave', 'ewan', 'awit ng barkada', 'himig ng pasko', 'pasko na sinta ko',
      // International
      'stairway to heaven', 'smells like teen spirit', 'wonderwall', 'take on me', 'africa', 'under pressure',
      'purple rain', 'like a prayer', 'material girl', 'girls just want to have fun', 'every breath you take',
      "don't stop believin'|dont stop believing", 'careless whisper', 'never gonna give you up', 'piano man',
      'rocket man', 'fly me to the moon', 'what a wonderful world', 'i will always love you',
      "livin' on a prayer|living on a prayer", "sweet child o' mine|sweet child of mine", 'la bamba', 'september',
      'barbie girl', 'mambo no 5|mambo number five', 'drivers license', 'anti-hero', 'as it was', 'watermelon sugar',
      'levitating', 'cupid', 'ditto', 'pink venom', 'boy with luv', 'soda pop', 'feliz navidad',
    ],
  },
};
