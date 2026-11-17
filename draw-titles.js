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
};
