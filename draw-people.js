// Draw battle: people, one list per category the host can pick. Same rules as the other lists: lowercase,
// other accepted names after a "|", punctuation and a leading "the" optional when guessing.
module.exports = {
  // Actors and artists (singers, bands, comedians, hosts), local and international, mixed in every
  // difficulty. Easy ones are the best known and easiest to act out.
  stars: {
    easy: [
      // Local
      'vice ganda', 'coco martin', 'kathryn bernardo|kathryn', 'daniel padilla', 'sarah geronimo|sarah g',
      'regine velasquez|regine', 'dolphy', 'fernando poe jr|fpj', 'nora aunor', 'vilma santos|ate vi',
      'sharon cuneta|sharon', 'marian rivera', 'dingdong dantes|dingdong', 'alden richards|alden', 'vic sotto|bossing',
      'willie revillame|willie', 'piolo pascual|piolo|papa p', 'anne curtis', 'bini', 'sb19',
      // International
      'taylor swift', 'michael jackson', 'elvis presley|elvis', 'mr bean', 'jackie chan', 'bruce lee',
      'the rock|dwayne johnson', 'beyonce', 'lady gaga', 'justin bieber', 'ed sheeran', 'bruno mars', 'ariana grande',
      'billie eilish', 'adele', 'bts', 'blackpink', 'the beatles', 'charlie chaplin', 'marilyn monroe',
    ],
    medium: [
      // Local
      'maine mendoza|maine', 'joey de leon', 'john lloyd cruz|john lloyd', 'bea alonzo', 'kim chiu', 'toni gonzaga',
      'angel locsin', 'judy ann santos|juday', 'liza soberano', 'enrique gil', 'james reid', 'nadine lustre',
      'lea salonga', 'pia wurtzbach', 'catriona gray', 'gary valenciano|gary v', 'martin nievera', 'michael v',
      'ogie alcasid', 'kris aquino', 'pokwang', 'ai ai delas alas|ai ai', 'jose manalo', 'kuya kim|kim atienza',
      'luis manzano', 'vhong navarro', 'heart evangelista', 'aga muhlach', 'moira dela torre|moira',
      'yeng constantino|yeng', 'eraserheads', 'ben&ben|ben and ben', 'parokya ni edgar', 'jose mari chan',
      'donny pangilinan|donny', 'belle mariano',
      // International
      'tom cruise', 'keanu reeves', 'leonardo dicaprio|leo dicaprio', 'will smith', 'brad pitt', 'angelina jolie',
      'johnny depp', 'robert downey jr|rdj', 'tom hanks', 'jim carrey', 'tom holland', 'zendaya', 'emma watson',
      'daniel radcliffe', 'chris hemsworth', 'jennifer lopez|jlo|j lo', 'shakira', 'eminem', 'madonna', 'katy perry',
      'selena gomez', 'harry styles', 'one direction', 'backstreet boys', 'westlife', 'celine dion',
      'whitney houston', 'mariah carey', 'britney spears', 'freddie mercury', 'elton john', 'psy', 'lisa',
    ],
    hard: [
      // Local
      'eugene domingo', 'wally bayola', 'paolo ballesteros', 'jhong hilario', 'jennylyn mercado', 'dennis trillo',
      'jericho rosales', 'cesar montano', 'ian veneracion', 'morissette', 'kz tandingan', 'zack tabudlo',
      'ely buendia', 'rico blanco', 'bamboo', 'gloc-9', 'andrew e', 'francis m', 'apo hiking society',
      'freddie aguilar', 'rey valera', 'sexbomb girls|sexbomb', 'joshua garcia', 'julia barretto', 'melai cantiveros',
      'dionela', 'arthur nery',
      // International
      'morgan freeman', 'sylvester stallone|stallone', 'arnold schwarzenegger', 'scarlett johansson', 'meryl streep',
      'julia roberts', 'hugh jackman', 'ryan reynolds', 'gal gadot', 'margot robbie', 'timothee chalamet',
      'pedro pascal', 'jason statham', 'vin diesel', 'chris evans', 'anne hathaway', 'sandra bullock', 'emma stone',
      'jennifer aniston', 'snoop dogg', 'nicki minaj', 'miley cyrus', 'olivia rodrigo', 'dua lipa', 'the weeknd',
      'sabrina carpenter', 'post malone', 'bon jovi', 'queen', 'abba', 'jungkook', 'jennie', 'rose', 'lee min ho',
      'hyun bin', 'gong yoo',
    ],
  },
  // ISD people: the team. First names count on their own when nobody else has them.
  isd: {
    easy: ['allen', 'arvie', 'eric', 'gerry', 'jarby', 'jovie', 'jay', 'jude'],
    medium: [
      'adrian', 'alyssa', 'angelie', 'angelo', 'arnold', 'cartney', 'darwin', 'eldridge', 'fatima', 'gerald', 'jayson',
      'jerome', 'josephine', 'mariel', 'nawarat', 'richard', 'shaira', 'victor',
    ],
    hard: [
      'anne swayze|anne', 'bonnie pauline|bonnie', 'carla isabel|carla', 'carlo james|carlo', 'dione rose|dione',
      'edward james|edward', 'francis raphael|francis', 'gabriel jose|gabriel', 'gino rafael|gino', 'gliona lou|gliona',
      'jasper kyle', 'jayne klarisa|jayne', 'jhazmine therese|jhazmine', 'john albert', 'john henry', 'john rey',
      'karen sue|karen', 'mary rose|mary', 'paul jasper|paul', 'pete andre|pete', 'raphael josef',
      'renalyn mae|renalyn', 'sarrah mae|sarrah',
    ],
  },
};
