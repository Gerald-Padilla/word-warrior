// Draw battle: famous characters, one list per category the host can pick (Disney, Pixar, DreamWorks,
// anime, cartoons). Easy ones are the best known and simplest to draw; hard ones take more detail or are
// less famous. Lowercase. After a "|" come other names that also count as right ("buzz" for Buzz
// Lightyear); the first is the one the drawer sees and the one revealed. Guesses ignore spaces and
// punctuation, so "walle" counts for wall-e, and a leading "the" is optional.
module.exports = {
  disney: {
    easy: [
      'mickey mouse|mickey', 'minnie mouse|minnie', 'donald duck|donald', 'goofy', 'pluto', 'olaf', 'simba', 'stitch',
      'dumbo', 'winnie the pooh|pooh|pooh bear', 'tigger', 'eeyore', 'piglet', 'bambi', 'baymax', 'elsa',
      '101 dalmatians|dalmatians|dalmatian', 'the seven dwarfs',
    ],
    medium: [
      'anna', 'ariel|little mermaid', 'cinderella', 'snow white', 'belle', 'rapunzel', 'moana', 'maui', 'aladdin', 'genie',
      'jasmine', 'mulan', 'peter pan', 'tinker bell', 'captain hook', 'pinocchio', 'cruella|cruella de vil', 'mufasa',
      'timon', 'pumbaa', 'lilo', 'chip and dale', 'daisy duck|daisy', 'scrooge mcduck|scrooge', 'sebastian', 'flounder',
      'thumper', 'beast', 'hercules', 'tarzan', 'sven', 'scar', 'magic mirror', 'kanga and roo|kanga|roo',
      'christopher robin', 'prince charming', 'prince eric|eric', 'king triton|triton', 'lady and the tramp|lady|tramp',
      'baloo', 'mowgli', 'bagheera', 'shere khan', 'king louie', 'robin hood', 'marie', 'chicken little',
      'hiro|hiro hamada', 'kim possible', 'evil queen', 'queen of hearts', 'zeus', 'bolt',
    ],
    hard: [
      'mushu', 'jafar', 'ursula', 'maleficent', 'hades', 'mad hatter', 'cheshire cat', 'jiminy cricket', 'geppetto',
      'quasimodo', 'esmeralda', 'kuzco', 'vanellope', 'wreck-it ralph|ralph', 'judy hopps|judy', 'nick wilde|nick', 'heihei',
      'mirabel', 'bruno', 'rafiki', 'zazu', 'nala', 'gaston', 'lumiere', 'cogsworth', 'mrs potts', 'abu', 'iago', 'meeko',
      'kristoff', 'flynn rider|flynn', 'pascal', 'maximus', 'raya', 'tiana', 'aurora|sleeping beauty', 'pocahontas',
      'fairy godmother', 'white rabbit', 'tamatoa', 'huey dewey and louie', 'dopey',
      // Classics
      'gus gus|gus', 'scuttle', 'kaa', 'prince john', 'sir hiss', 'duchess', 'basil', 'figaro', 'rajah', 'mr smee|smee',
      'wendy', 'tick tock the crocodile|tick tock', 'tweedledee and tweedledum', 'merlin', 'prince phillip',
      'flora fauna and merryweather|three good fairies', 'grandmother willow', 'judge frollo|frollo', 'shan yu', 'yzma',
      'kronk', 'pegasus', 'megara|meg', 'philoctetes|phil', 'pain and panic', 'terk', 'kida',
      // Mickey and friends
      'max goof|max', 'pete', 'oswald the lucky rabbit|oswald', 'darkwing duck',
      // Newer films
      'nani', 'jumba', 'pleakley', 'ray the firefly|ray', 'louis the alligator|louis', 'dr facilier|facilier|shadow man',
      'prince naveen|naveen', 'mother gothel|gothel', 'prince hans|hans', 'oaken', 'marshmallow', 'bruni', 'te fiti',
      'gramma tala', 'luisa', 'isabela', 'abuela|abuela alma', 'namaari', 'tuk tuk', 'king candy', 'fix-it felix|felix',
      'flash the sloth|flash', 'chief bogo', 'clawhauser', 'asha',
    ],
  },
  pixar: {
    easy: [
      'woody', 'buzz lightyear|buzz', 'nemo', 'dory', 'mike wazowski|mike', 'sully|sulley', 'wall-e',
      'lightning mcqueen|mcqueen', 'remy', 'mr incredible', 'jessie', 'rex', 'aliens|little green men',
      'luxo jr|luxo|pixar lamp', 'the incredibles',
    ],
    medium: [
      'mr potato head|potato head', 'eve', 'carl fredricksen|carl', 'elastigirl', 'edna mode|edna', 'boo', 'mater|tow mater',
      'marlin', 'crush', 'slinky dog|slinky', 'hamm', 'forky', 'bo peep', 'russell', 'dug', 'joy', 'sadness', 'anger', 'merida',
      'dash', 'lotso', 'bullseye', 'violet', 'mrs potato head', 'zurg|emperor zurg', 'army men|green army men',
      'sally carrera|sally', 'luigi', 'ellie|ellie fredricksen', 'riley', 'hank',
    ],
    hard: [
      'bing bong', 'disgust', 'fear', 'anxiety', 'ennui', 'envy', 'embarrassment', 'miguel', 'hector', 'dante', 'luca',
      'alberto', 'giulia', 'ember', 'wade', 'jack-jack', 'frozone', 'syndrome', 'the underminer', 'flik', 'dot', 'atta',
      'hopper', 'heimlich', 'randall', 'celia', 'mr waternoose|waternoose', 'yeti|abominable snowman', 'linguini',
      'colette', 'anton ego|ego', 'chef skinner|skinner', 'gusteau', 'emile', 'kevin', 'charles muntz|muntz', 'squirt',
      'bruce', 'gill', 'nigel', 'bloat', 'mr ray', 'darla', 'destiny', 'bailey', 'doc hudson', 'chick hicks', 'guido',
      'ramone', 'fillmore', 'cruz ramirez', 'jackson storm', 'finn mcmissile', 'stinky pete', 'sid phillips', 'bonnie',
      'wheezy', 'trixie', 'mr pricklepants', 'gabby gabby', 'duke caboom', 'ducky and bunny', 'arlo', 'spot',
      'mei lee|mei', 'ernesto de la cruz|ernesto', 'mama imelda|imelda', 'mama coco', 'pepita', 'queen elinor|elinor',
      'm-o', 'ian lightfoot|ian', 'barley lightfoot|barley', 'joe gardner', 'sox',
    ],
  },
  dreamworks: {
    easy: [
      'shrek', 'donkey', 'po|kung fu panda', 'toothless', 'princess fiona|fiona', 'puss in boots|puss', 'boss baby',
      'gingy|gingerbread man',
    ],
    medium: [
      'king julien', 'alex the lion|alex', 'marty the zebra|marty', 'gloria the hippo|gloria', 'melman', 'skipper',
      'master oogway|oogway', 'master shifu|shifu', 'tigress', 'hiccup', 'megamind', 'poppy', 'branch',
      'lord farquaad|farquaad', 'captain underpants',
    ],
    hard: [
      'tai lung', 'lord shen', 'mort', 'maurice', 'stoick', 'astrid', 'roz', 'spirit', 'turbo', 'mr wolf', 'mr peabody',
      'grug', 'barry b benson|barry',
    ],
  },
  anime: {
    easy: [
      'pikachu', 'doraemon', 'totoro', 'shin chan', 'jigglypuff', 'goku|son goku', 'naruto', 'luffy|monkey d luffy',
      'sailor moon', 'hamtaro',
    ],
    medium: [
      'astro boy', 'voltes v|voltes five|voltes', 'nobita', 'gian', 'ash ketchum|ash', 'charmander', 'bulbasaur', 'squirtle',
      'snorlax', 'psyduck', 'meowth', 'vegeta', 'sasuke', 'kakashi', 'zoro|roronoa zoro', 'chopper|tony tony chopper',
      'tanjiro', 'nezuko', 'saitama|one punch man', 'detective conan|conan', 'mazinger z|mazinger', 'gundam',
    ],
    hard: [
      'zenitsu', 'inosuke', 'eren yeager|eren', 'levi|captain levi', 'gojo|satoru gojo', 'deku|izuku midoriya', 'all might',
      'gon|gon freecss', 'killua', 'ryuk', 'light yagami', 'no face|kaonashi', 'ponyo', 'calcifer', 'catbus', 'kiki', 'howl',
      'chihiro', 'anya|anya forger', 'sakuragi|hanamichi sakuragi', 'mewtwo', 'eevee', 'gengar', 'itachi', 'gaara',
      'gohan|son gohan', 'frieza', 'piccolo', 'majin buu|buu', 'frieren', 'yugi|yugi muto', 'kenshin|himura kenshin',
    ],
  },
  // TV cartoons, plus animated films from other studios (the minions, the grinch).
  cartoons: {
    easy: [
      'spongebob|spongebob squarepants', 'patrick star|patrick', 'squidward', 'mr krabs|krabs|mister krabs', 'hello kitty',
      'garfield', 'scooby doo|scooby', 'tweety|tweety bird', 'bugs bunny', 'homer simpson|homer', 'bart simpson|bart',
      'peppa pig|peppa', 'snoopy', 'popeye', 'minion|minions', 'pink panther', 'tom and jerry|tom jerry', 'smurf|smurfs',
      'casper',
    ],
    medium: [
      'jake the dog|jake', 'finn the human|finn', 'ben 10|ben ten|ben tennyson', 'dexter', 'johnny bravo',
      'courage|courage the cowardly dog', 'perry the platypus|perry|agent p', 'phineas and ferb|phineas', 'gumball',
      'dora|dora the explorer', 'bluey', 'shaun the sheep|shaun', 'pingu', 'oggy', 'road runner', 'sylvester',
      'daffy duck|daffy', 'fred flintstone|fred', 'yogi bear|yogi', 'marge simpson|marge', 'lisa simpson|lisa',
      'charlie brown', 'sandy cheeks|sandy', 'plankton', 'gary the snail|gary', 'gru', 'shaggy', 'odie', 'woody woodpecker',
      'masha and the bear|masha',
    ],
    hard: [
      'mojo jojo', 'powerpuff girls|powerpuff', 'wile e coyote|coyote', 'taz|tasmanian devil', 'wallace and gromit|gromit',
      'samurai jack', 'he-man', 'optimus prime', 'the grinch', 'sid the sloth|sid', 'scrat', 'larva', 'pororo',
      'ed edd n eddy', 'dee dee', 'woodstock', 'olive oyl', 'speedy gonzales', 'porky pig|porky', 'marvin the martian|marvin',
    ],
  },
};
