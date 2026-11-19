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
      'kathniel', 'aldub', 'jadine', 'ryan bang', 'eddie garcia', 'arnel pineda',
      // International
      'taylor swift', 'michael jackson', 'elvis presley|elvis', 'mr bean', 'jackie chan', 'bruce lee',
      'the rock|dwayne johnson', 'beyonce', 'lady gaga', 'justin bieber', 'ed sheeran', 'bruno mars', 'ariana grande',
      'billie eilish', 'adele', 'bts', 'blackpink', 'the beatles', 'charlie chaplin', 'marilyn monroe',
      'oprah winfrey|oprah', 'drake', 'bad bunny', 'pitbull', 'frank sinatra', 'bob marley', 'john lennon',
      'coldplay', 'maroon 5', 'spice girls', 'twice', 'jo koy', 'dave bautista', 'vanessa hudgens',
      'jenna ortega|wednesday', 'millie bobby brown|eleven',
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
      'lizquen', 'donbelle', 'kimpau', 'paulo avelino', 'carlo aquino', 'maja salvador', 'richard gutierrez',
      'derek ramsay', 'janine gutierrez', 'barbie forteza', 'david licauco', 'ruru madrid', 'andrea brillantes',
      'jodi sta maria', 'claudine barretto', 'jolina magdangal', 'angelica panganiban', 'lovi poe',
      'german moreno|kuya germs', 'boy abunda', 'bayani agbayani', 'alex gonzaga', 'ivana alawi', 'jaya',
      'christian bautista', 'erik santos', 'darren espanto', 'angeline quinto', 'aegis', 'south border', 'rivermaya',
      'kamikazee', 'spongecola', 'december avenue', 'the juans', 'juan karlos', 'cup of joe',
      // International
      'tom cruise', 'keanu reeves', 'leonardo dicaprio|leo dicaprio', 'will smith', 'brad pitt', 'angelina jolie',
      'johnny depp', 'robert downey jr|rdj', 'tom hanks', 'jim carrey', 'tom holland', 'zendaya', 'emma watson',
      'daniel radcliffe', 'chris hemsworth', 'jennifer lopez|jlo|j lo', 'shakira', 'eminem', 'madonna', 'katy perry',
      'selena gomez', 'harry styles', 'one direction', 'backstreet boys', 'westlife', 'celine dion',
      'whitney houston', 'mariah carey', 'britney spears', 'freddie mercury', 'elton john', 'psy', 'lisa',
      'cardi b', 'doja cat', 'sia', 'enrique iglesias', 'ricky martin', 'michael buble', 'andrea bocelli',
      'stevie wonder', 'paul mccartney', 'linkin park', 'imagine dragons', 'green day', 'avril lavigne',
      'shania twain', 'charlie puth', 'shawn mendes', 'camila cabello', 'chappell roan', 'usher', 'akon',
      'black eyed peas', 'nsync|n sync', 'little mix', 'jonas brothers|the jonas brothers', 'newjeans|new jeans',
      'aespa', 'seventeen', 'stray kids', 'big bang|bigbang', 'g-dragon', 'iu', 'jimin', 'kim soo hyun',
      'cha eun woo', 'song hye kyo', 'denzel washington', 'nicole kidman', 'jennifer lawrence', 'robert pattinson',
      'benedict cumberbatch', 'mark ruffalo', 'chris pratt', 'jason momoa', 'henry cavill', 'matt damon',
      'george clooney', 'nicolas cage', 'harrison ford', 'zac efron', 'kevin hart', 'adam sandler', 'jack black',
      'eddie murphy', 'robin williams', 'donnie yen', 'stephen chow',
    ],
    hard: [
      // Local
      'eugene domingo', 'wally bayola', 'paolo ballesteros', 'jhong hilario', 'jennylyn mercado', 'dennis trillo',
      'jericho rosales', 'cesar montano', 'ian veneracion', 'morissette', 'kz tandingan', 'zack tabudlo',
      'ely buendia', 'rico blanco', 'bamboo', 'gloc-9', 'andrew e', 'francis m', 'apo hiking society',
      'freddie aguilar', 'rey valera', 'sexbomb girls|sexbomb', 'joshua garcia', 'julia barretto', 'melai cantiveros',
      'dionela', 'arthur nery',
      'mark anthony fernandez', 'marvin agustin', 'camille prats', 'iza calzado', 'sylvia sanchez', 'ruffa gutierrez',
      'susan roces', 'gloria romero', 'chiquito', 'babalu', 'redford white', 'rene requiestas', 'long mejia',
      'empoy marquez', 'cong tv', 'kyla', 'jed madela', 'bugoy drilon', 'side a', 'hale', 'up dharma down', 'ez mil',
      'flow g', 'maki', 'adie', 'sunkissed lola', 'rico yan',
      // International
      'morgan freeman', 'sylvester stallone|stallone', 'arnold schwarzenegger', 'scarlett johansson', 'meryl streep',
      'julia roberts', 'hugh jackman', 'ryan reynolds', 'gal gadot', 'margot robbie', 'timothee chalamet',
      'pedro pascal', 'jason statham', 'vin diesel', 'chris evans', 'anne hathaway', 'sandra bullock', 'emma stone',
      'jennifer aniston', 'snoop dogg', 'nicki minaj', 'miley cyrus', 'olivia rodrigo', 'dua lipa', 'the weeknd',
      'sabrina carpenter', 'post malone', 'bon jovi', 'queen', 'abba', 'jungkook', 'jennie', 'rose', 'lee min ho',
      'hyun bin', 'gong yoo',
      'travis scott', 'karol g', 'sza', 'lizzo', 'josh groban', 'prince', 'david bowie', 'kurt cobain', 'mick jagger',
      'the rolling stones', 'metallica', 'nirvana', 'guns n roses', 'pink|p!nk', 'lana del rey', 'lorde',
      'tate mcrae', 'benson boone', 'jason derulo', 'fergie', 'apl.de.ap|apl de ap', "destiny's child",
      'fifth harmony', 'exo', 'kim taehyung|taehyung', 'park bo gum', 'ji chang wook', 'samuel l jackson',
      'kate winslet', 'cate blanchett', 'natalie portman', 'kristen stewart', 'paul rudd', 'jeremy renner',
      'ben affleck', 'bruce willis', 'liam neeson', 'cillian murphy', 'florence pugh', 'chris rock', 'ben stiller',
      'owen wilson', 'steve carell', 'will ferrell', 'jet li', 'michelle yeoh', 'chow yun fat', 'audrey hepburn',
      'clint eastwood', 'al pacino', 'robert de niro', 'whoopi goldberg',
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
