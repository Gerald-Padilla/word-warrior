# Word Warriors ⚔

A pixel-art fantasy typing battle for a room full of people. One big screen shows a QR code;
everyone scans it with their phone, builds a hero, and joins the lobby. Monsters carrying words
fall from the sky. The first player to type a word gets the points, and their hero attacks the monster.

## Run it

```bash
npm install
npm start
```

Open **http://localhost:3000** on the laptop that's connected to the projector or TV. That's the host screen.
Players scan the QR code on it. Phones must be able to reach this laptop (see *Networking* below).

## How a game works

| Round | Monsters | Words | Points | Sky |
|-------|----------|-------|--------|-----|
| 1 · EASY | Slime Swarm | 3–5 letters (`orc`, `sword`), 219 words | 10 per letter | sunny morning, drifting clouds |
| 2 · MEDIUM | Bat Storm | 5–8 letters (`dragon`, `gauntlet`), 201 words | 20 per letter | dusk, setting sun, bats |
| 3 · HARD | Skull Inferno | 8–13 letters (`necromancer`), 147 words | 30 per letter | burning night, rising embers |
| 4 · BOSS | The Dragon King | 8–13 letters | 30 per letter | volcano lair, lightning (option) |

That's a full game. The host can also play just **one round**, and pick the **difficulty** (see *Game length and
difficulty* below).

- Free-for-all: whoever finishes typing a word first gets it. Nobody else can score that word.
- No Enter key needed. The word fires the moment it's spelled correctly. Enter clears the whole word;
  Backspace deletes one letter, or every red (wrong) letter at once.
- On phones, every hero stands on the battlefield: yours big in the middle, the rest beside you. When someone
  gets a word, their hero attacks it and their name pops up above them.
- As you type, the letters that still match a word show gold (in the box and on the word itself). A typo
  shows white on red in the box, marks the exact letter you missed on the word you were going for, shakes
  and buzzes, and a "TYPO!" hint shows how to fix it. One Backspace erases all the red letters, so you're
  straight back to the part you got right.
- If someone else gets the word you were halfway through (or it escapes), a big "TOO SLOW!" / "TOO LATE!"
  says who got it, and your input clears.
- Words that reach the ground escape and nobody scores them.
- More players means more words on screen at once.
- Each monster goes out its own way: slimes splat, bats burst into feathers, skulls shatter. Long words shake
  the screen, points float up with any bonus (`x2 STREAK`, `PERK`, `GOLD x3`), and in the last ten seconds of
  a round the edges glow red, the clock ticks and the music speeds up.

## Game length and difficulty

Above the options in the lobby, the host picks two things (remembered on that computer, like the options):

- **GAME** (free for all and team battle): **FULL GAME** plays every round above, from easy to hard, then the boss if it's on. **ONE ROUND**
  plays a single round, the one that matches the difficulty: Slime Swarm on easy, Bat Storm on normal, Skull
  Inferno on hard. It goes straight to the results afterwards, and there's no boss.
- **DIFFICULTY:** sets the pace of every round. **EASY**: words take 30% longer to fall, the gaps between new
  words are 25% longer, and one fewer fits on screen. **NORMAL**: as described above. **HARD**: words fall in 20%
  less time, arrive 20% closer together, and one more fits on screen. In a team battle it sets how long attacks
  take to fly, and in a battle royale the pace of every stage. Points per word don't change, but harder games
  have more words to score. In a draw battle, difficulty sets the drawing time (100, 80 or 60 seconds), and
  **GAME** sets how many times everyone draws (twice, or once). In artillery, **GAME** sets when sudden death starts (turn 30 or 16) and difficulty sets the wind and the time to aim
  (25, 20 or 15 seconds). In a duel, **GAME** sets the fight's length
  (4 minutes or 2) and difficulty sets the monsters.

The lobby shows the rounds the game will play, and every phone shows the host's pick in its lobby. A one-round
team battle starts each team with HP to match that round (so a knockout is still on the cards). Solo quests
and the daily quest are always a full game on normal.

## Game options

The host flips these on or off in the lobby (they're all on to start). The host's choices are remembered on
that computer for the next game.

| Option | What it does |
|--------|--------------|
| **STREAKS** | Words in a row without a typo multiply your points: x1.5 from 3, x2 from 6, x3 from 10 (team battle tops out at x2). Your hero catches fire, the big screen calls out **ON FIRE!** / **UNSTOPPABLE!** / **LEGENDARY!**, and your phone shows your streak. One wrong key ends it. |
| **SPECIAL WORDS** | Now and then a falling word is special (free for all and solo). **Gold** (a coin) is worth x3. **Ice** (a snowflake) slows every word on screen for 6 seconds. **Bomb** blasts every word on screen and pays you half their points. |
| **BOSS FINALE** | A fourth round against the Dragon King (free for all and solo). It has an HP bar that grows with the crowd, and every point anyone scores hurts it. Bring it down and everyone who hit it gets +500, and the final blow is worth +1000. If time runs out, it gets away. |
| **CLASS PERKS** | Each class scores more on one kind of word (see *Classes* below). The phone shows your perk in the hero creator and the lobby. |
| **SKILLS** | Every 8 words you type charges your class's skill. A button next to the typing box fills up; when it glows, tap it (or press Space on a keyboard) to use it. Every screen then shows a banner with that hero's portrait and the skill's name, the field dims around the hero, and the skill plays out from them: meteors crash down, arrows rain, lightning strikes, shurikens curve out, a cannon fires, ghosts rise. The words it's about to hit are marked in the hero's color and hold still until the hit lands. The game doesn't pause, so nobody loses their place mid-word. |
| **AWARDS** | After the podium: Speed Demon (fastest WPM), Sharpshooter (fewest typos), Streak Master, Clutch Saver (words saved at the last second), Monster Slayer, Treasure Hunter (most special words) and Dragon Slayer. Everyone's phone shows their own WPM, accuracy and best streak. |
| **EMOTES** | Players tap 👍 😂 😮 🔥 👏 😭 on their phones in the lobby, between rounds and on the results screen; the emoji pops up over their hero on the big screen. |
| **CHAT** | Players chat from their phones while they wait in the lobby (and during an artillery battle: see below). Messages show in a panel beside the heroes on the big screen and in a bubble on the sender's tile. Messages are up to 80 characters, one every 1.5 seconds; common English and Tagalog swear words are masked with asterisks (a basic filter, not a moderator). **CLEAR** on the big screen wipes the chat for everyone, and the hero's **X** still removes a player. |
| **MY WORDS** | Paste your own words (team names, product names, in-jokes). They're sorted by length into the rounds and come up often. Tick *Only use my words* to drop the built-in words for any round you've given at least 6 words. |
| **MUSIC** | A chiptune soundtrack on the big screen: calm in the lobby and breaks, a track per round, a boss theme. |

The podium fills in under a drumroll (third, then second, then the crowned winner), then the rest of the field
and the awards.

## Fair play (auto-typers)

Auto-typer programs press real keys, so they can't be blocked by the page alone. The game catches them by
timing instead:

- Every word a player finishes is sent with the gaps between their keystrokes. The server refuses the word
  if it was typed faster than any person can (under 25 ms a letter on average, about 400+ WPM), or if the
  player's recent gaps are machine-even (people's gaps vary a lot), or if the typing took longer than the
  word has been on screen (made-up timings).
- A refused word stays on the field for everyone else, and the player sees **BLOCKED!**.
- After 3 refused words the player is flagged: the host screen shows a red **AUTO?** in front of their name
  (lobby, leaderboard, podium), and their score stays out of the Hall of Fame. The host can remove them with
  the **X** in the lobby.
- In the typing box, one key adds one letter. Paste, drag and drop, swipe typing and tapping a keyboard
  suggestion are thrown away with a **TYPE IT!** message, and text put in by a script on the page is ignored.

An auto-typer set to type slowly with random gaps can still pass, but it's no faster than a good human typist.

## Team battle

A different game from free-for-all: two armies face off and fight with words. Pick **TEAM BATTLE** in the
host lobby (it needs at least 2 heroes).

- Players are split into **Red Dragons** and **Blue Griffins**, balanced as they join. On the phone,
  **SWITCH TEAM** changes sides in the lobby. On the host screen, click a hero to move them to the other team
  (they get a note on their phone), or **SHUFFLE TEAMS** to deal everyone out again.
- Both teams start with the same HP (6,000, scaled up for bigger teams).
- **Attack:** your team has a row of attack words. Type one and your hero launches it across the field at
  the other army, carrying the word. If it lands, the enemy loses HP equal to its points.
- **Block:** the enemy's attacks fly at you with their words showing (red on your phone). Type one before it
  lands and your hero shoots it down.
- **Power-ups:** every so often a glowing item floats in the middle with a word under it. The first team to
  type it gets the power:
  - **Health Potion** heals your team (15% of max HP).
  - **Slow Time** makes attacks coming at your team fly slower for 10s, so you have more time to block.
  - **Haste** makes your team's attacks fly faster for 10s, so the enemy has less time to block.
  - **Shield** blocks every attack that hits your team for 6s.
  - **Fury** doubles your team's damage for 10s.
- A team at 0 HP is knocked out on the spot. If both survive to the end, the team with more HP wins.
- Your score is the damage your attacks dealt plus the damage you blocked. The podium shows the best heroes
  from both teams. Team battles aren't recorded in the Hall of Fame.

What it looks like:

- **Big screen:** red army on the left, blue on the right, attack words across the top of each side,
  attacks flying between them, the power-up in the middle, and HP bars with active power-ups on top.
- **Phone, upright:** the enemy army lines a rampart at the top, your team stands below with your attack
  words just above their heads; attacks fly up and down between you.
- **Phone on its side or a PC:** like the big screen, but your team is always on the left.

## Battle royale

Every hero for themselves. Pick **BATTLE ROYALE** in the host lobby (one hero is enough to try it).

- Each hero fights **their own monsters**: the words on your phone are yours alone, so nobody can steal
  them, and your phone shows only your hero.
- Everyone starts with **100 HP**. A word that reaches you hurts: 10 HP on easy, 15 on medium, 20 on hard.
  At 0 HP you're **knocked out**: your phone says where you finished and you watch the rest.
- **No rounds or breaks.** The battle starts easy (Slime Swarm), turns medium at 0:40 (Bat Storm) and hard at
  1:40 (Skull Inferno). After that, every 30 seconds the monsters come and fall faster, so it always ends.
  The difficulty setting changes the pace of all of it.
- **The last hero standing wins.** Places count up from the bottom as heroes go out (heroes who go out at
  the same moment are placed by score). Points still count for the standings while everyone's in, and
  for the awards.
- **Live standings everywhere.** Under the top bar, every phone shows your HP, how many heroes are left,
  and the top three with their HP and scores (plus you, if you're further down). The big screen has the
  full standings with HP bars, an HP bar over every hero, and shows each hero's fight in miniature: a
  monster pops up over a hero who scores and their attack takes it out; one crashes into a hero who gets
  hit. Knocked-out heroes stay on the field, faded, with their place.
- **Skills work as usual**, on your own monsters: strikes clear words before they reach you, boosts add
  points. The Necromancer's **Raise Dead** heals the last 3 hits you took instead of scoring. The big
  screen shows the skill's banner; other phones don't, so nobody gets distracted.
- Special words, streaks, perks and awards all work. The boss finale and game length don't apply.
- Someone who joins mid-battle watches this one and plays the next. **SKIP** on the big screen jumps to
  the next stage (or the next speed-up). Battle royale scores aren't recorded in the Hall of Fame (each
  hero had different words).

## Draw battle

A drawing and guessing game. Pick **DRAW BATTLE** in the host lobby (it needs at least 2 heroes).

- Heroes take turns drawing, in a random order that stays the same each round. Every hero draws once per
  round: **FULL GAME** is 2 rounds, **ONE ROUND** is 1. The lobby estimates how long the game will take for
  the number of heroes.
- **Pick a word.** The drawer's phone offers three words: one easy (100 points), one medium (150) and one hard
  (200), each from one of the host's word categories (a different one for each when the host picked three or
  more). They have 12 seconds to pick; if time runs out, they get the medium one.
- **Draw it.** The drawer draws with a finger (or mouse) on their phone, using 11 colors, 3 brush sizes, an
  eraser, undo and clear. The drawing appears on the big screen and every phone as it's drawn. Drawing time
  comes from the difficulty setting: 100 seconds on easy, 80 on normal and 60 on hard.
- **Guess it.** Everyone else types guesses on their phone. The big screen and the phones show the word as
  blanks with its letter count. A few letters fill in as time runs down: none for words of 3 letters or fewer,
  up to three for long ones.
  - **Wrong guesses** appear for everyone in the guess list.
  - **Right guesses** are never shown. Everyone sees "*Name* GOT IT!" instead, and only the guesser's phone
    shows the word.
  - **After guessing right**, players can keep typing to chat while the others guess. Their messages show
    with a ✓. Anything that would give the word away (the word itself, something one letter off, or the
    word inside a longer message) is blocked, and their phone shows "NO SPOILERS!".
  - **Close guesses** (one letter off or two letters swapped, or the word with extra letters around it) are
    shown only to the guesser, as "SO CLOSE!", so they can't give the word away.
  - Capitals and spaces don't matter: "Ice Cream" and "icecream" both count.
- **Points.**
  - A right guess earns between half and all of the word's points, depending on how much time is left.
  - The first three to guess get a bonus on top: 30%, 20% and 10% of the word's points.
  - The drawer earns points for every hero who guesses, up to the word's full points if everyone gets it.
- The turn ends when time runs out or everyone has guessed. The reveal then shows the word, who got it and the
  drawer's points.
- **Standings after every turn.** After the reveal, the big screen and every phone show the standings for 5
  seconds: each hero's total, what they scored that turn and how many places they climbed or dropped. Phones
  always keep your own row in view. After the last turn the results come straight away instead.
- **Turn changes.**
  - A hero who joins mid-game can guess right away and draws at the end of the round.
  - A drawer who disconnects for 6 seconds loses the turn.
  - **SKIP** on the big screen moves on: from picking it skips that drawer, from drawing it goes to the reveal,
    and from the reveal it starts the next turn.
- Streaks, special words, the boss, class perks and skills are off in this mode (hidden in the lobby).
- **Awards:** Master Artist (most drawing points), Eagle Eye (most words guessed), First! (most first guesses)
  and Quick Eye (fastest correct guess).
- **WORDS** (in the lobby, under the difficulty) picks what gets drawn. Tick any mix of categories (at least
  one stays on). Each pick comes from a category chosen at random, so a small category comes up as often as a
  big one. With more than one category, the choices, the big screen and the phones show which category the
  word is from (DISNEY, MOVIES and so on).

  | Category | What's in it |
  |---|---|
  | **EVERYDAY THINGS** | About 570 things you can draw, with local, office and IT favorites (jeepney, parol, tabo, patintero, deadline, payday, firewall, blue screen) |
  | **VERBS** | About 175 actions to act out: run, dance, sneeze, juggle, moonwalk, procrastinate, and office ones like debug and deploy. "Running" counts for run. |
  | **ANIMALS** | About 180 animals, from pets and farm animals to Philippine wildlife: dog, carabao, tarsier, tamaraw, butanding, aspin... Filipino names count too: "aso" for dog, "tuko" for gecko. |
  | **FOOD** | About 265 foods from everywhere: pizza, fried chicken, sushi, samgyupsal, tteokbokki, pad thai, carbonara, churros... |
  | **PINOY FOOD** | About 180 Pinoy dishes, merienda, street food, fruits and sweets: adobo, sinigang, kwek-kwek, sisig, tocilog, lanzones, puto bumbong... |
  | **DISNEY** | About 225 characters, classic to new: Mickey Mouse, Elsa, Simba, Stitch, Baloo, Moana, Maleficent, Jack Skellington, Mirabel... |
  | **PIXAR** | About 150 characters from every Pixar film: Woody, Buzz Lightyear, Nemo, Mike Wazowski, WALL-E, Joy, Anxiety, Elio... |
  | **DREAMWORKS** | About 115 characters: Shrek, Donkey, Po, Toothless, King Julien, the penguins, Moto Moto, Megamind... |
  | **ANIME** | About 200 characters: Pikachu, Doraemon, Goku, Naruto, Luffy, Voltes V, Daimos, Tanjiro, Ghost Fighter's Eugene... |
  | **CARTOONS** | About 220 characters: SpongeBob, Scooby Doo, Bugs Bunny, the Simpsons, Ben 10, Bluey, Sonic, Mario, the K-pop Demon Hunters... |
  | **PINOY TV & MOVIES** | About 160 titles: Eat Bulaga, It's Showtime, Ang Probinsyano, Encantadia, Darna, Dyesebel, Heneral Luna, Kita Kita... |
  | **FAMOUS MOVIES** | About 195 titles: Titanic, Jaws, Star Wars, Harry Potter, Home Alone, The Matrix, Kung Fu Hustle, Forrest Gump... |
  | **OPM & INTERNATIONAL SONGS** | About 370 song titles: Bahay Kubo, Tadhana, Pantropiko, Multo, Ang Huling El Bimbo, Baby Shark, Bohemian Rhapsody, Dynamite... |
  | **ACTORS & ARTISTS** | About 365 local and international stars and groups: Vice Ganda, Coco Martin, Sarah Geronimo, KathNiel, BINI, Taylor Swift, Mr. Bean, BTS... |
  | **ISD PEOPLE** | The 49 people of ISD, by first name (two-name people count by their first name too, when nobody else has it) |

  - With only character categories the screens say "pick a character"; with only title categories, "pick a
    title". Verbs say "pick a verb", animals "an animal", food "a food", songs "a song", actors & artists "a star" and ISD people
    "a person". A mix says "a word".
  - **Language tag.** While a word is drawn, the big screen and the phones say what language it's in:
    **ENGLISH**, **TAGALOG** or **TAGLISH** (a mix, like "buko pie"), so guessers know what to type.
    Words from other languages used as is (sushi, despacito) count as English. Names (characters, stars,
    ISD people) and the host's own words have no tag. Animals take the Filipino name too ("aso" for dog).
  - A word never comes up twice in a game, even when two categories share it (pizza is food and an
    everyday thing).
  - Well-known short names count too: "buzz" for Buzz Lightyear, "pooh" for Winnie the Pooh. A leading
    "the", "a" or "ang" doesn't matter either way: "matrix" counts for The Matrix, "probinsyano" for Ang
    Probinsyano, and "the beast" for Beast.
  - Typing part of a longer name ("simpson" for Bart Simpson) shows "SO CLOSE!".
  - The blanks show any dashes, digits and apostrophes ("____-_" for WALL-E, "___ 10" for Ben 10). Guesses
    ignore them, so "walle" counts.
  - The host's own words (**MY WORDS**) are added as one more category, sorted by length.
- Draw battle scores aren't recorded in the Hall of Fame.

## Duel

A real-time arena fight with no typing: phones become controllers and heroes fight each other with HP. Pick
**DUEL** in the host lobby (one hero is enough to try it, but it's best with a crowd).

- **The arena.** One of seven layouts, picked at random, each mirrored so both sides play the same:

  | Layout | What's in it |
  |---|---|
  | **Courtyard**, **Ruins**, **Crossroads** | Flagstones, stone walls and crates |
  | **Graveyard** | Rows of gravestones, a crypt in the middle and dead trees |
  | **Moat** | A keep ringed by water: you get in only by the bridges on the sides, but you can shoot across |
  | **Forest** | Grass, trees to hide behind and ponds to shoot across |
  | **Colosseum** | A sand pit ringed with pillars, crates stacked at the ends |

  Walls, crates, gravestones and trees block movement and shots, so they make good cover. Water stops anyone
  on foot, but shots (and flying monsters) go straight over it. Powder kegs blow up when shot: they hurt
  everyone nearby, the shooter too, and roll back 25 seconds later. Monsters come in through the four gates
  and find their way around walls and water to whoever they're after.
- **Controls.**
  - **Phone:** put your left thumb anywhere on the left half and drag to move. Hold your right thumb anywhere
    on the right half to attack whatever is nearest; drag it to aim. Tap **SKILL** when it glows.
  - **PC:** WASD or the arrow keys move and Space attacks the nearest foe. Hold the mouse button to attack
    toward the pointer. E (or Q or Shift) uses the skill.
- **Fighting.** Every hero has HP (it depends on the class) and fires their class's attack as a real shot,
  with its own speed, range and damage. At 0 HP you're knocked out and a gravestone marks the spot. Three
  seconds later you're back somewhere safe, with two seconds of protection that ends when you attack.
- **Points.**
  - Knocking out a hero: +100, or +150 if they were on a run of 3 KOs or more (**SHUTDOWN!**).
  - If a monster or a keg finishes off a hero you hurt in the last 8 seconds, the KO is still yours.
  - Monsters: from +10 for a slime to +60 for a golem (table below).
  - The Dragon King: points for every hit, and +300 for the final blow.
- **Monsters.** They attack everyone, so they're also a chance to catch a rival off guard. More heroes means
  more monsters, and more come as the fight goes on. Tougher ones join later:

  | Monster | Comes | What it does | Points |
  |---|---|---|---|
  | **Slime** | From the start | Hops toward the nearest hero | 10 |
  | **Bat** | From the start | Fast, and flies over walls and water | 15 |
  | **Goblin** | From the start, three at a time | Quick, weaving runners | 12 |
  | **Skull** | After 40 seconds | Keeps its distance and spits fireballs | 25 |
  | **Spider** | After 40 seconds | Keeps its distance and spits webs that slow you for a moment | 20 |
  | **Fire Spirit** | After 40 seconds | Flies at you and blows up, hurting everything nearby (monsters too). Shoot it first: then the blast is yours, and it hurts the heroes around it | 20 |
  | **King Slime** | After 75 seconds | Big and tough; bursts into three slimes when slain | 40 |
  | **Golem** | After 75 seconds | Slow stone giant with lots of HP. Its punches knock you back, and nothing can push it | 60 |

  With **BOSS FINALE** on, the Dragon King storms in for the last minute of a full game. He flies over the
  walls, breathes fans of fire and calls in minions.
- **Power-ups.** A new one appears every 7 to 11 seconds, and monsters sometimes drop one. Walk over one to
  take it:

  | Power-up | What it does |
  |---|---|
  | **Health Potion** | +60 HP |
  | **Haste** | 40% faster for 8 seconds |
  | **Shield** | No damage for 5 seconds |
  | **Fury** | Double damage for 8 seconds |
  | **Multi-Shot** | Every attack fires three ways for 8 seconds |
  | **Slow Time** | Every other hero and every monster slows down for 5 seconds |
  | **Bomb** | A blast around you: 45 damage to everything nearby |

- **Pets.** Your companion fights beside you, attacking the nearest foe in its reach on its own. Its hits
  (and any KO) are yours, but they don't get your bonuses (Fury, perks). A pet adds roughly 5 to 10% to a
  hero's score in simulated fights. No companion means no pet attack: pick one with **CHANGE HERO**.

  | Pet | Attack |
  |---|---|
  | **Cat** | **Claw Swipe:** pounces on foes close to you, the hardest hitter |
  | **Owl** | **Feather Dart:** throws feathers at foes far off |
  | **Slime** | **Goo Ball:** spits goo that slows foes down |
  | **Baby Dragon** | **Ember:** spits little fireballs |
  | **Fox** | **Fox Fire:** sends out fox fire that homes in on foes |
  | **Bunny** | **Carrot Toss:** lobs carrots at foes |
  | **Frog** | **Tongue Lash:** lashes out at foes close by |
  | **Turtle** | **Shell Spin:** sends its shell spinning through foes, shoving them |
  | **Goat** | **Headbutt:** butts foes close by, knocking them back |
  | **Bat** | **Sonic Screech:** a wave that goes through every foe in a line |

- **How to play, in the lobby.** With DUEL picked, the big screen's lobby has a row of tips (moving,
  attacking, skills, pets, power-ups, points). Each phone's lobby has a **HOW TO PLAY** box for that device
  (thumbs on a phone, keys and mouse on a PC), with that hero's skill and pet. The countdown says it again.
- **Perks and skills.** Every class has its own duel perk and skill (*Classes in a duel*, below). The skill
  charges as you deal damage, a little on its own over time, and by 20% for every KO.
- **Big screen.** The whole arena, with names and HP bars over the heroes, plus:
  - the standings: score, KOs, and each hero's HP (or when a knocked-out hero is back)
  - who knocked out whom
  - callouts: **RAMPAGE!** (3 KOs in a row), **UNSTOPPABLE!** (5), **SHUTDOWN!**
  - a banner for every skill
- **Phone.** Your part of the arena, following your hero, with a minimap and:
  - your HP, KOs, score and place
  - your power-ups, with seconds left
  - who knocked you out, and when you're back
- **Length and difficulty.** A full game is a 4-minute fight; one round is 2 minutes, without the Dragon King.
  Difficulty sets the monsters:
  - **Easy:** 30% fewer, hitting 25% softer.
  - **Hard:** 35% more, hitting 30% harder and arriving faster.
- **Joining and leaving.** A hero who joins mid-fight jumps straight in. A phone that drops out takes its
  hero off the field until it reconnects. **SKIP** ends the fight.
- Streaks, special words and **MY WORDS** are off in a duel (hidden in the lobby).
- **Awards:**
  - **KO King:** most KOs
  - **Monster Hunter:** most monsters slain
  - **Heavy Hitter:** most damage
  - **Rampage:** most KOs in a row, at least 3
  - **Untouchable:** knocked out the fewest times
  - **Dragon Slayer:** final blow on the Dragon King
- Duel scores aren't recorded in the Hall of Fame.

### Classes in a duel

| Class | HP | Attack | Duel perk | Duel skill |
|-------|----|--------|-----------|------------|
| Knight | 180 | Sword Beam: passes through one foe | **Iron Guard:** takes 20% less damage | **Shield Wall:** blocks all damage for 3 seconds |
| Barbarian | 225 | Spinning Axe: short and heavy, cuts through everything | **Bloodlust:** up to +50% damage as HP runs low | **Whirlwind:** spins for 2.5 seconds, hitting everything around |
| Wizard | 145 | Fireball: explodes | **Arcane Mind:** skill charges 40% faster | **Meteor:** a meteor crashes down where you aim |
| Elf Archer | 145 | Piercing Arrow: long and fast | **Eagle Eye:** +25% damage on far targets | **Arrow Fan:** 11 arrows in a wide fan |
| Rogue | 160 | Dagger Volley: three daggers | **Sly:** moves 12% faster | **Shadow Step:** dashes ahead and vanishes for 3 seconds; the next hit does double |
| Cleric | 175 | Holy Light: heals you a little each hit | **Blessed:** power-ups last 50% longer, potions heal 50% more | **Sanctuary:** heals 75 HP and blasts nearby foes away |
| Ninja | 145 | Shuriken: rapid | **Evasion:** 20% chance to dodge a hit | **Shuriken Storm:** two rings of shurikens in every direction |
| Necromancer | 160 | Soul Bolt: homes in | **Soul Harvest:** heals 8 HP per monster slain, 30 per KO | **Raise Dead:** 3 ghosts hunt your foes for 8 seconds |
| Druid | 175 | Thorn Vine: slows | **Life Bloom:** heals 7 HP a second after 3 seconds unhurt | **Overgrowth:** vines around you slow and hurt foes for 5 seconds |
| Pirate | 190 | Cannonball: explodes and knocks back | **Plunder:** +50% points from monsters, and more power-up drops | **Cannon Barrage:** 6 cannonballs pound the area where you aim |
| Bard | 160 | Power Chord: wide, passes through everything | **Echo:** every 4th attack plays twice | **Battle Hymn:** stuns foes around you; you move and attack faster for 5 seconds |
| Valkyrie | 180 | Storm Spear: long and heavy, passes through two foes | **Valor:** +25% damage while above half HP | **Thunderclap:** lightning strikes every foe around you and stuns them |

The kits were evened out over simulated four-minute duels with all twelve classes and bot-style play (chase
the nearest foe, keep to your range): every class scored between 92% and 110% of the average. People play
differently from bots, so treat the numbers as a starting point. They're all in `public/js/brawl-rules.js`.

## Artillery

A turn-based team battle, with no typing. Pick **ARTILLERY** in the host lobby (it needs at least 2 heroes).
Players split into Red Dragons and Blue Griffins like a team battle: **SWITCH TEAM** on the phone, or on the
big screen click a hero to move them, or **SHUFFLE TEAMS**.

- **The battlefield.** A side-on landscape, one of ten, a little different every game. Teams start on opposite
  sides.

  | Battlefield | What's in it |
  |---|---|
  | **Rolling Hills** | Gentle hills |
  | **Twin Towers** | A stone tower near each side to hide behind or shoot from |
  | **Sky Islands** | Floating islands over a bottomless drop |
  | **Red Canyon** | High ground on both sides and a deep valley between |
  | **The Great Peak** | A mountain in the middle: lob over it, or dig through |
  | **Broken Bridge** | Two cliffs over a bottomless chasm, joined by a stone bridge: blow it out from under them |
  | **The Ziggurat** | A stepped stone pyramid in the middle |
  | **Hollow Hills** | Hills with hidden caves: blow a roof in and whoever's on it drops through |
  | **Sawtooth Ridge** | Jagged, snowy peaks all the way across |
  | **Crater Field** | A battered plain full of old pits |

- **Turns.** The teams take turns, each team's heroes in rotation. On your turn your phone buzzes and its
  controls light up; everyone else watches. You have 20 seconds (25 on easy, 15 on hard).
  - **Walk:** ◀ ▶ walk a little (the blue bar) and turn you around. You can climb small steps but not walls,
    and you can walk off a ledge.
  - **Jump:** **JUMP** leaps forward the way you face: out of a crater, up onto a ledge, or over a gap. Each
    jump uses up some of the blue bar (a few jumps a turn), and you can't fire until you land. Jump off the
    edge of the world and you're out.
  - **Aim:** ▲ ▼ set the angle, from a little below level to straight up.
  - **Fire:** hold **FIRE** to charge the power (about 2 seconds to full), and let go to shoot. A white mark on
    the power bar shows your last shot's power.
  - **Pick a shot:** **SHOT 1**, **SHOT 2**, or **SPECIAL** when it's charged.
  - **Keyboard:** the arrow keys walk and aim, J jumps, Space charges and fires, 1, 2 and 3 pick the shot,
    H heals and X doubles. Enter opens the chat and Escape closes it.
- **Wind.** It changes every turn (stronger on hard) and pushes every shot sideways. The gauge at the top
  shows it: an arrow from the middle the way it blows, longer and redder the stronger it is (ticks mark every
  4 points, up to 16), and under it the number and a word: calm, light, breezy, strong or gale. Arrows barely
  feel it, and soul bolts not at all.
- **Shots.** Every class has two shots of its own to pick from (table below). A blast hurts everyone near
  it, teammates and yourself included, and digs a crater. A direct hit does extra damage. Some shots fly in
  their own way:
  - **Straight:** flies dead straight a long way (no drop, no wind) before it falls.
  - **Rolling:** lands and rolls along the ground, over bumps and down slopes, before it blows.
  - **Splitting:** splits into three at the top of its arc.
  - **Bursting:** bursts into little bomblets where it lands.
  - **Bouncing:** bounces, blowing up each time.
- **The ground.** Craters stay for the rest of the battle. A hero with nothing under their feet drops to the
  ground below. One who falls off the bottom of the map is out, and if an enemy dug the hole, the KO is theirs.
- **Special shots** (when **SKILLS** is on). Every class has one. It charges as you deal damage and take it,
  and a little every turn; pick **SPECIAL** when it says READY.
- **Items.** Every hero has one **HEAL** (+40 HP) and one **DOUBLE** (fire your shot twice this turn) per
  battle. Using one doesn't end your turn.
- **Power-ups.** Bubbles float in the air over the middle of the battlefield: one at the start, then a new
  one every 3 turns (up to 2 at a time). Hit one with a shot, or catch it in a blast, and it's yours, whoever
  you were aiming at. The heroes show the power-ups they have waiting beside their HP bar.

  | Power-up | What it does |
  |---|---|
  | **Potion** | +35 HP, right away |
  | **Fury** | Your next shot hits 50% harder |
  | **Shield** | You take half damage until your next turn |
  | **Haste** | Walk and jump twice as far on your next turn |
  | **Twin Shot** | Your next shot fires twice (three times with DOUBLE) |

- **Winning.** The battle goes on until a team is wiped out (or both are, a draw). To make sure it ends,
  **sudden death** starts at turn 30 in a full game (16 in one round): every turn from then on, shots hit
  10% harder (up to four times as hard). **SKIP** ends the battle at once, and the team with more HP wins
  (as does a battle somehow still going after 200 turns).
- **Mounts.** Heroes ride their companion pet into battle (it trots along when they walk); a hero without
  one fights on foot. Hero and mount are one target, the same size for everyone. Each pet moves its own way:

  | Pet | Mount perk |
  |---|---|
  | **Cat** | **Pounce:** jumps much higher |
  | **Owl** | **Glide:** jumps farther and floats gently down (glide off a cliff to cross a gap) |
  | **Slime** | **Sticky:** walks up walls three times as high |
  | **Baby Dragon** | **Wings:** the longest jump |
  | **Fox** | **Swift:** walks half again as far, and faster |
  | **Bunny** | **Hop:** jumps for half the cost, so twice as many jumps |
  | **Frog** | **Leap:** jumps higher and farther |
  | **Turtle** | **Shell:** takes 15% less damage, but walks less far |
  | **Goat** | **Sure-footed:** climbs steeper slopes and never walks off into the drop |
  | **Bat** | **Flap:** tap **JUMP** again in mid-air (it says **FLAP**) for a second, smaller jump: over a wider gap, or back from the edge |
  | No pet | A plain jump |

- **Points.** Damage to enemies scores 1 point per HP, a KO scores +100, and every hero on the winning team
  gets +150.
- **Chat** (when **CHAT** is on). Turns leave time to talk: tap **CHAT** on the battlefield to type a message
  or tap a quick one (NICE SHOT!, OOPS!, ...). It pops up in a bubble over your hero, on the big screen and
  every phone, and in a list at the bottom of the field. Knocked out heroes can still chat.
- **Big screen.**
  - The whole battlefield, with each team's HP in bars at the top.
  - Whose turn it is, with the clock running down, and the wind.
  - The active hero's aim and power as they charge, and every shot as it flies.
  - After a shot lands, two seconds to see what it did before the next turn.
- **Phone.**
  - Both teams' HP and the clock.
  - The battlefield following the action (drag it to look around), with a minimap. It follows a shot until it
    lands and stays there until the next turn starts, then pans over to whoever's up.
  - The controls. Held sideways, the controls sit in a column on the right.
- **Details.**
  - Every hero has 120 HP.
  - A hero who joins mid-battle goes on the smaller team, on their own side of the field.
  - A hero whose phone drops out loses their turn after 3 seconds.
- Streaks, special words, the boss, class perks and **MY WORDS** are off (hidden in the lobby).
- **Awards:**
  - **KO King:** most KOs
  - **Heavy Hitter:** most damage
  - **Bullseye:** biggest single hit
  - **Long Shot:** hit an enemy from the farthest away
- Artillery scores aren't recorded in the Hall of Fame.

### Shots

| Class | Shot 1 | Shot 2 | Special shot |
|-------|--------|--------|--------------|
| Knight | **Sword Beam:** a steady all-rounder | **Lance:** flies dead straight a long way before it drops | **Holy Blade:** a huge blade of light, with a big blast and a big hit |
| Barbarian | **Spinning Axe:** heavy (it drops faster), hits hard, digs deep | **Boulder:** lands and rolls along the ground before it blows | **Earthquake:** a giant crater that drops everyone around it |
| Wizard | **Fireball:** a wide blast | **Frost Shards:** splits into three at the top of its arc | **Meteor:** a flaming rock with a huge blast |
| Elf Archer | **Piercing Arrow:** light, barely feels the wind, deadly on a direct hit | **Eagle Arrow:** flies flat and far, barely feeling the wind | **Arrow Rain:** five arrows at once, fanned out |
| Rogue | **Dagger Volley:** two daggers, one after the other | **Caltrops:** bursts into four little blasts where it lands | **Shadow Step:** a dagger that takes you with it: you land where it hits |
| Cleric | **Holy Light:** heals teammates near the blast by 15 | **Smite:** a beam of light, dead straight and deaf to the wind | **Sanctuary:** heals teammates near the blast by 40 |
| Ninja | **Shuriken:** three at once, fanned out | **Ricochet Star:** bounces twice, blowing up each time | **Shuriken Storm:** six at once |
| Necromancer | **Soul Bolt:** ignores the wind | **Bone Burst:** bursts into five bone shards where it lands | **Soul Drain:** a heavy bolt that heals you by half its damage |
| Druid | **Thorn Vine:** drills into the ground before it blows up | **Seed Pod:** splits into three seeds at the top of its arc | **Overgrowth:** raises a mound of earth where it lands, for cover or a bridge |
| Pirate | **Cannonball:** heavy, with a wide blast | **Grapeshot:** four small shots at once, spread wide | **Cannon Barrage:** three cannonballs, one after another |
| Bard | **Power Chord:** bounces once, blowing up both times | **Drumroll:** lands and rolls along the ground before it blows | **Encore:** bounces three times |
| Valkyrie | **Storm Spear:** lightning also strikes anyone just beside where it lands | **Thunder Strike:** drills into the ground, then lightning strikes beside it | **Thunderclap:** lightning strikes everyone near where it lands |

## PC, tablet and phone

Both pages adjust to the screen they're on.

**Player page:**

- **On a phone:** it works upright and sideways. Held sideways, the typing box moves into the top row (and
  team HP bars float over the battlefield) so there's room to play with the keyboard open.
- **On a PC or tablet:** the same screens are scaled up to fill the window, so text and buttons aren't tiny
  on a big monitor. Sideways and on a PC, the join, lobby and results screens use two columns. In a draw
  battle the board sits on the left with the tools or guesses beside it, and drawing with a mouse works the
  same as with a finger.
- **While typing:** when the on-screen keyboard opens, the page keeps its scale.

**Big screen (host page):** made for a PC, TV or projector, but it also works on a tablet or phone.

- The lobby stacks into one column and scrolls, with START at the bottom.
- The top bar, leaderboard, team HP bars, results and Hall of Fame shrink to fit, and the results buttons
  move to a bar along the bottom.
- On an upright screen, the battlefield sizes its words to the width, so long words still fit.
- In a draw battle, the board goes across the top with the scores and guesses side by side under it
  (upright), or on the left with them stacked beside it (sideways).
- The mode buttons show just their names; the picked mode's description is on a line under them.
- In a duel on an upright screen, the arena goes across the top with the standings under it.
- In artillery on an upright screen, the view follows the action (as on the players' phones) with a minimap,
  instead of shrinking the whole battlefield into a strip.

**Heroes:** twelve classes, each with its own attack. Customize each with 8 colors, 4 skin tones, 8 hair/beard
colors (for the classes that show hair), 6 trims (the gold accents) and a companion pet (cat, owl, slime, baby
dragon, fox, bunny, frog, turtle, goat or bat) that follows your hero into battle, fights beside them in a duel,
and carries them in artillery. The creator shows your hero on a mini battlefield doing
their attack (tap it to attack again), with their perk and skill, and has **RANDOM LOOK** and a random-name button.

## Classes

| Class | Attack | Perk (when CLASS PERKS is on) | Skill (when SKILLS is on) |
|-------|--------|-------------------------------|---------------------------|
| Knight | Sword Beam | **Swift Blade:** +45% on words of 7 letters or fewer | **Rally:** your next 3 words score double |
| Barbarian | Spinning Axe | **Cleave:** +18% on 8–10 letter words | **Berserk:** your next 2 words score x2.5 |
| Wizard | Fireball | **Arcane Mind:** +40% on 11+ letter words | **Meteor:** hits the 2 most valuable words for +20% |
| Elf Archer | Piercing Arrow | **Eagle Eye:** +25% on words with J, K, Q, V, W, X, Y or Z | **Arrow Rain:** hits the 3 newest words |
| Rogue | Dagger Volley | **Sly:** +25% on words with an S | **Backstab:** hits the 3 words closest to the ground |
| Cleric | Holy Light | **Blessed:** +60% on special words (+10% on all words when they're off); team battle power-ups last or heal 50% more | **Divine Favor:** your next 4 words score x1.75 |
| Ninja | Shuriken | **Clean Cut:** +12% on every word typed without a typo | **Shuriken Storm:** hits 3 random words |
| Necromancer | Soul Bolt | **Soul Harvest:** +60% on words with a double letter (ll, ee, ss…) | **Raise Dead:** scores up to 3 words that got away this round (team battle: heals the last 3 hits your team took) |
| Druid | Thorn Vine | **Life Bloom:** +25% on words with 4+ vowels | **Overgrowth:** your next 6 words score x1.5 |
| Pirate | Cannonball | **Plunder:** +50% on every 5th word you type | **Cannon Barrage:** hits 4 random words for 75% |
| Bard | Power Chord | **Echo:** +35% on a word the same length as your last one | **Encore:** scores your last 3 words again (team battle: hits the other team directly) |
| Valkyrie | Storm Spear | **Battle Cry:** +65% on words that start with a vowel | **Thunderclap:** hits up to 6 words for half their points |

**How they're balanced.** Every perk is sized to add about 10% to an average game. Each one was measured
over simulated games with the real word lists: a perk that fires on fewer of your points gets a bigger
bonus. That's why the Knight gets +45% on short words, which only show up in the cheap first round, while
the Barbarian gets +18% on the 8–10 letter words that carry much of a game's points. All twelve land between
+9% and +11%. Perks only look at the word (and your own typing), never at *when* you hit it, so they're
worth the same in solo, in a crowd and in a team battle.

Every skill is worth about three words' base points:
- **Boosts** (Rally, Berserk, Divine Favor, Overgrowth) add to your next words' base points rather than on
  top of your streak, so they don't snowball.
- **Strikes** hit words for their base points. If the field doesn't have enough words, the missing hits
  become a boost on your next words instead, so a strike is never wasted on an empty screen.
- **In a team battle,** strikes block attacks flying at your team, and fire your own attacks if there's
  nothing to block.

**Host controls:** FREE FOR ALL / TEAM BATTLE, the game options, START BATTLE, SHUFFLE TEAMS, HALL OF FAME, SKIP ▶ (jump to the next phase), MUSIC ON/OFF, SOUND ON/OFF,
PLAY AGAIN / BACK TO LOBBY on the podium screen. In the lobby, a hero's **X** removes them; in free for all
clicking the hero also removes them, in a team battle it moves them to the other team.

Players who lose connection (phone locked, Wi-Fi blip) rejoin automatically with their score intact.

## Solo mode

Anyone can practice alone, without a host screen: open `/play` (for example `http://192.168.1.20:3000/play`),
build a hero and tap **PLAY SOLO**. It works on a laptop with a keyboard too.

- A full game on normal difficulty with every game option on (streaks, special words, the boss, perks), and shorter
  breaks (5 seconds instead of 9).
- When you clear every monster, the next one appears right away, so faster typists score more.
- The top bar shows **HI**, the best solo score so far. Tap **X** to abandon a run; abandoned runs aren't saved.
  **♪** turns the solo soundtrack on or off.
- At the end you see your place in the solo Hall of Fame, your WPM, accuracy and best streak, then
  **PLAY AGAIN** or **MENU**.

**DAILY QUEST** is a solo run with the same words, in the same order and places, for everyone that day. It has
its own Hall of Fame board that starts over at midnight (Philippine time; set `DAILY_TZ`, for example
`DAILY_TZ=UTC`, to change it). Play it as often as you like; your best run counts.

## Hall of Fame

Every finished game is recorded on one of three boards:

- **Solo**: best solo quests.
- **Daily**: today's daily quest.
- **Battle**: best individual scores from free-for-all battles, with the place and player count of that battle
  (team battles, battle royales, draw battles, duels and artillery battles aren't recorded).

They're kept separate because in a battle the words are shared between everyone, so scores aren't comparable.
Each board keeps the top 100. Ties go to whoever set the score first. Games with 0 points and test bots aren't recorded.

See the boards from the **HALL OF FAME** button on the host lobby or podium screen, or on the phone join screen.
Record-breaking heroes get a **NEW HIGH SCORE!** / **HALL OF FAME #N** badge on the podium and on their phone.

Scores are saved to `data/highscores.json` and survive restarts. Delete that file to reset the Hall of Fame.

## Networking

The QR code points to this laptop's Wi-Fi address (for example `http://192.168.1.20:3000/play?room=ABCD`).

- Phones must be on the **same network** as the laptop.
- The first time you run it, Windows asks whether Node.js may accept connections. Allow it on **private networks**.
- If the host screen lists several addresses, pick the one that works from the dropdown under the QR code.
- Corporate or guest Wi-Fi often blocks phone-to-laptop traffic. If phones can't load the page, either:
  - use a phone hotspot or a separate router for the event, or
  - host it publicly: deploy to any Node host with WebSocket support, or run a tunnel (ngrok, cloudflared),
    then start with `PUBLIC_URL` so the QR code uses that address:

    ```powershell
    $env:PUBLIC_URL = "https://your-tunnel.example.com"; npm start
    ```

Environment variables: `PORT` (default 3000), `PUBLIC_URL` (optional).

## Deploy to Render (free)

Render runs the whole game online, so players can join from any network. The repo includes a
`render.yaml` Blueprint that sets everything up.

1. Push this project to a GitHub repository (private is fine).
2. Sign in at [render.com](https://render.com) with GitHub.
3. Click **New > Blueprint**, pick the repository, and click **Apply**. Render installs dependencies and
   starts the server on the free plan.
4. When the deploy is live, open the service URL (for example `https://word-warriors.onrender.com`) on the
   big screen. The QR code and solo link point to that address automatically.

Every push to the repository redeploys the game.

Free plan limits:

- The service sleeps after about 15 minutes with no visitors. The first visit afterwards takes up to a minute,
  so open the host screen a few minutes before you play.
- The free plan has no persistent disk. The Hall of Fame resets whenever the service restarts, sleeps or redeploys.
  To keep it, upgrade to a paid instance with a disk mounted at the project's `data` folder.

## Testing without a crowd

Fill a room with bots that join and type at human-ish speeds:

```bash
npm run bots -- ABCD 6
```

(`ABCD` is the room code shown on the host screen; `6` is how many bots. Bots never appear in the Hall of Fame.)
Each bot types one word at a time at its own speed, so in a battle royale the slower bots get knocked out first.
In a draw battle, bots scribble on their turn and guess words, verbs, animals, characters, titles, food and people from the lists that fit the blanks.
In a duel, bots chase the nearest foe, keep to their class's range, grab power-ups close by and use their skill.
In artillery, a bot on its turn tries angles and powers against the ground, aims at the nearest enemy and fires, a little off
like a person (it uses SHOT 2 now and then, and its special shot when it's ready).

## Tuning

Battle royale has its own block (`ROYALE_HP`, `ROYALE_STAGES` with when each stage starts and how hard its
hits are, `ROYALE_RAMP_MS` / `ROYALE_RAMP` for the speed-ups). So does draw battle: `DRAW_ROUNDS`,
`DRAW_TIME`, `DRAW_POINTS`, `DRAW_ORDER_BONUS`, how long picking, the reveal and the standings take, and the
guess limits. The categories are the `DRAW_CATEGORIES` list there; their words are in `draw-words.js`
(everyday things), `draw-verbs.js`, `draw-animals.js`, `draw-food.js`, `draw-characters.js`, `draw-titles.js` (movies, shows and songs) and
`draw-people.js` (stars and ISD people), with their languages in `draw-languages.js`; other accepted
names go after a `|`, as in
`'buzz lightyear|buzz'`. The drawing colors and brush sizes are in `public/js/sketch.js`. Round length, fall speed, spawn rate, points multipliers and team battle attack speed (`flight`) are in the
`ROUNDS` table at the top of `server.js`, and what each difficulty does to them is the `LEVELS` table below it,
next to the countdown and break lengths (`SOLO_INTERMISSION_MS` for solo). Team battle settings sit there too:
`TEAM_HP`, how often power-ups appear and how long their effects last. The game options have their own settings: the boss round (`BOSS_ROUND`, `BOSS_HP`, bonuses),
streak steps (`STREAK_STEPS`), special words (`SPECIAL_CHANCE`, `GOLD_FACTOR`, `ICE_MS`, `BOMB_SHARE`) and class
perks (`PERKS`), skills (`SKILLS`, `SKILL_WORDS`). The auto-typer limits are the `KEY_*` and `FLAG_AFTER`
settings. Word lists are in `words.js`; if you change them a lot, the perk bonuses may need re-measuring.
The music tracks are the `TRACKS` table in `public/js/common.js`. Artillery's numbers (gravity, wind, power, HP,
walking, jumping, the mounts' perks, the power-ups, every class's shots and specials, the battlefields, turns
and points) are in `public/js/arty-rules.js`.
Everything about a duel is in
`public/js/brawl-rules.js`: the class kits (HP, speed, attack, perk and skill), the perks' and skills' numbers
(`PERK`, `SKILL`), the monsters and when they come (`MONSTERS`, `MOB_WAVES`), power-ups and kegs, the arena layouts
(`LAYOUTS`), the fight's length, respawn time and points.

## Files

- `server.js`: Express + Socket.IO server; battle, team battle and solo rooms, rounds, word spawning, scoring, HP, Hall of Fame
- `brawl.js`: the duel's fight on the server: movement, shots, monsters, power-ups, skills and KOs
- `public/js/brawl-rules.js`: the duel's rules, shared by the server and the screens (class kits, monsters, power-ups, layouts, collisions)
- `public/js/brawl.js`: the duel's arena on screen (big screen and phones) and the phone's thumb sticks
- `artillery.js`: artillery on the server: the turns, walking, and working out every shot
- `public/js/arty-rules.js`: artillery's rules, shared by the server and the screens (the ground, flight, shots)
- `public/js/artillery.js`: the artillery battlefield on screen (big screen and phones) and the phone's turn controls
- `data/highscores.json`: saved Hall of Fame (created after the first finished game)
- `words.js`: easy / medium / hard word pools
- `draw-words.js`: draw battle everyday things (easy / medium / hard)
- `draw-characters.js`: draw battle characters: Disney, Pixar, DreamWorks, anime, cartoons (with other accepted names)
- `draw-titles.js`: draw battle titles: Pinoy TV and movies, famous movies, OPM and international songs
- `draw-verbs.js`: draw battle verbs (with their "-ing" forms)
- `draw-animals.js`: draw battle animals (with Filipino names)
- `draw-languages.js`: draw battle word languages: each category's usual one and the exceptions
- `draw-food.js`: draw battle food: food from everywhere, Pinoy food
- `draw-people.js`: draw battle people: actors and artists, ISD people
- `public/js/sketch.js`: draw battle board, shared by the big screen and phones
- `public/host.html`, `public/js/host.js`: big screen (QR lobby, battlefield, leaderboard, podium)
- `public/play.html`, `public/js/play.js`: phone (hero creator, lobby, solo, typing, results, Hall of Fame)
- `public/js/arena.js`: shared pixel battlefield renderer (monsters, attacks, particles)
- `public/js/art.js`: pixel sprites and palettes (heroes, monsters, the Dragon King, special words, power-ups)
- `public/js/common.js`: clock sync, DOM helper, 8-bit sound effects and the chiptune music
- `scripts/bots.js`: test bots
