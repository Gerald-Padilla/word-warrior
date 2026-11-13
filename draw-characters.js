// Draw battle, character edition: famous characters from cartoons, anime, Disney, Pixar and DreamWorks.
// Easy ones are the best known and simplest to draw; hard ones take more detail or are less famous.
// Lowercase. After a "|" come other names that also count as right ("buzz" for Buzz Lightyear); the first
// is the one the drawer sees and the one revealed. Guesses ignore spaces and punctuation, so "walle" counts
// for wall-e.
module.exports = {
  easy: [
    'mickey mouse|mickey', 'minnie mouse|minnie', 'donald duck|donald', 'goofy', 'pluto', 'pikachu',
    'spongebob|spongebob squarepants', 'patrick star|patrick', 'squidward', 'mr krabs|krabs|mister krabs', 'hello kitty',
    'olaf', 'shrek', 'nemo', 'dory', 'woody', 'buzz lightyear|buzz', 'mike wazowski|mike', 'sully|sulley', 'simba',
    'winnie the pooh|pooh|pooh bear', 'tigger', 'stitch', 'doraemon', 'totoro', 'garfield', 'scooby doo|scooby',
    'tweety|tweety bird', 'bugs bunny', 'homer simpson|homer', 'bart simpson|bart', 'peppa pig|peppa', 'snoopy', 'popeye',
    'dumbo', 'baymax', 'minion|minions', 'pink panther', 'wall-e', 'lightning mcqueen|mcqueen', 'tom and jerry|tom jerry',
    'smurf|smurfs', 'casper', 'po|kung fu panda', 'pumbaa', 'eeyore', 'piglet', 'bambi', 'shin chan', 'jigglypuff',
  ],
  medium: [
    // Disney
    'elsa', 'anna', 'ariel|little mermaid', 'cinderella', 'snow white', 'belle', 'rapunzel', 'moana', 'maui', 'aladdin',
    'genie', 'mulan', 'peter pan', 'tinker bell', 'captain hook', 'pinocchio', 'cruella|cruella de vil', 'mufasa',
    'timon', 'lilo', 'chip and dale', 'daisy duck|daisy', 'scrooge mcduck|scrooge',
    // Pixar
    'jessie', 'rex', 'mr potato head|potato head', 'remy', 'eve', 'carl fredricksen|carl', 'mr incredible', 'elastigirl',
    'edna mode|edna', 'boo', 'mater|tow mater', 'marlin', 'crush',
    // DreamWorks (and the minions' boss)
    'donkey', 'puss in boots|puss', 'princess fiona|fiona', 'gingy|gingerbread man', 'king julien', 'boss baby', 'toothless', 'gru',
    // Anime
    'goku|son goku', 'naruto', 'luffy|monkey d luffy', 'sailor moon', 'astro boy', 'voltes v|voltes five|voltes', 'nobita',
    'ash ketchum|ash', 'charmander', 'snorlax', 'psyduck', 'hamtaro',
    // Cartoons
    'jake the dog|jake', 'finn the human|finn', 'ben 10|ben ten|ben tennyson', 'dexter', 'johnny bravo',
    'courage|courage the cowardly dog', 'perry the platypus|perry|agent p', 'phineas and ferb|phineas', 'gumball',
    'dora|dora the explorer', 'bluey', 'shaun the sheep|shaun', 'pingu', 'oggy', 'road runner', 'sylvester',
    'daffy duck|daffy', 'fred flintstone|fred', 'yogi bear|yogi', 'marge simpson|marge', 'charlie brown', 'sandy cheeks|sandy',
    'plankton', 'gary the snail|gary',
  ],
  hard: [
    // Anime
    'vegeta', 'sasuke', 'kakashi', 'zoro|roronoa zoro', 'tanjiro', 'nezuko', 'zenitsu', 'eren yeager|eren', 'levi|captain levi',
    'gojo|satoru gojo', 'saitama|one punch man', 'deku|izuku midoriya', 'all might', 'detective conan|conan', 'gon|gon freecss',
    'killua', 'ryuk', 'no face|kaonashi', 'ponyo', 'calcifer', 'catbus', 'kiki', 'anya|anya forger',
    'sakuragi|hanamichi sakuragi', 'mewtwo', 'eevee', 'gengar', 'mazinger z|mazinger',
    // DreamWorks
    'lord farquaad|farquaad', 'master oogway|oogway', 'master shifu|shifu', 'tigress', 'hiccup', 'megamind', 'poppy',
    // Disney
    'mushu', 'jafar', 'ursula', 'maleficent', 'hades', 'mad hatter', 'cheshire cat', 'jiminy cricket', 'geppetto', 'quasimodo',
    'kuzco', 'vanellope', 'wreck-it ralph|ralph', 'judy hopps|judy', 'nick wilde|nick', 'heihei', 'mirabel', 'bruno',
    // Pixar
    'russell', 'dug', 'joy', 'bing bong', 'anger', 'disgust', 'anxiety', 'miguel', 'luca', 'ember', 'jack-jack',
    'frozone', 'syndrome', 'lotso', 'forky', 'bo peep', 'flik', 'merida', 'randall',
    // Cartoons
    'mojo jojo', 'powerpuff girls|powerpuff', 'wile e coyote|coyote', 'taz|tasmanian devil', 'wallace and gromit|gromit',
  ],
};
