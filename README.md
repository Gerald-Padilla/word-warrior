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
| 1 · EASY | Slime Swarm | 3–5 letters (`orc`, `sword`) | 10 per letter | sunny morning, drifting clouds |
| 2 · MEDIUM | Bat Storm | 6–8 letters (`dragon`, `gauntlet`) | 20 per letter | dusk, setting sun, bats |
| 3 · HARD | Skull Inferno | 8–13 letters (`necromancer`) | 30 per letter | burning night, rising embers |
| 4 · BOSS | The Dragon King | 8–13 letters | 30 per letter | volcano lair, lightning (option) |

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
- A team at 0 HP is knocked out on the spot. If both survive the three rounds, the team with more HP wins.
- Your score is the damage your attacks dealt plus the damage you blocked. The podium shows the best heroes
  from both teams. Team battles aren't recorded in the Hall of Fame.

What it looks like:

- **Big screen:** red army on the left, blue on the right, attack words across the top of each side,
  attacks flying between them, the power-up in the middle, and HP bars with active power-ups on top.
- **Phone, upright:** the enemy army lines a rampart at the top, your team stands below with your attack
  words just above their heads; attacks fly up and down between you.
- **Phone on its side or a PC:** like the big screen, but your team is always on the left.

## Landscape and PC

The player page works upright, sideways, and in a desktop browser. Sideways and on a PC it uses the full
width; the join, lobby and results screens switch to two columns. On a phone held sideways the typing box
moves into the top row (and team HP bars float over the battlefield) so there's room to play with the
keyboard open.

**Heroes:** twelve classes, each with its own attack. Customize each with 8 colors, 4 skin tones, 8 hair/beard
colors (for the classes that show hair), 6 trims (the gold accents) and a companion pet (cat, owl, slime, baby
dragon or fox) that follows your hero into battle. The creator shows your hero on a mini battlefield doing
their attack (tap it to attack again), with their perk and skill, and has **RANDOM LOOK** and a random-name button.

## Classes

| Class | Attack | Perk (when CLASS PERKS is on) | Skill (when SKILLS is on) |
|-------|--------|-------------------------------|---------------------------|
| Knight | Sword Beam | **Swift Blade:** +40% on words of 7 letters or fewer | **Rally:** your next 3 words score double |
| Barbarian | Spinning Axe | **Cleave:** +20% on 8–10 letter words | **Berserk:** your next 2 words score x2.5 |
| Wizard | Fireball | **Arcane Mind:** +35% on 11+ letter words | **Meteor:** hits the 2 most valuable words for +20% |
| Elf Archer | Piercing Arrow | **Eagle Eye:** +25% on words with J, K, Q, V, W, X, Y or Z | **Arrow Rain:** hits the 3 newest words |
| Rogue | Dagger Volley | **Sly:** +20% on words with an S | **Backstab:** hits the 3 words closest to the ground |
| Cleric | Holy Light | **Blessed:** +60% on special words (+10% on all words when they're off); team battle power-ups last or heal 50% more | **Divine Favor:** your next 4 words score x1.75 |
| Ninja | Shuriken | **Clean Cut:** +12% on every word typed without a typo | **Shuriken Storm:** hits 3 random words |
| Necromancer | Soul Bolt | **Soul Harvest:** +50% on words with a double letter (ll, ee, ss…) | **Raise Dead:** scores up to 3 words that got away this round (team battle: heals the last 3 hits your team took) |
| Druid | Thorn Vine | **Life Bloom:** +30% on words with 4+ vowels | **Overgrowth:** your next 6 words score x1.5 |
| Pirate | Cannonball | **Plunder:** +50% on every 5th word you type | **Cannon Barrage:** hits 4 random words for 75% |
| Bard | Power Chord | **Echo:** +35% on a word the same length as your last one | **Encore:** scores your last 3 words again (team battle: hits the other team directly) |
| Valkyrie | Storm Spear | **Battle Cry:** +55% on words that start with a vowel | **Thunderclap:** hits up to 6 words for half their points |

**How they're balanced.** Every perk is sized to add about 10% to an average game. Each one was measured
over simulated games with the real word lists: a perk that fires on fewer of your points gets a bigger
bonus. That's why the Knight gets +40% on short words, which only show up in the cheap first round, while
the Barbarian gets +20% on the 8–10 letter words that carry much of a game's points. All twelve land between
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

- Same rounds as a battle with every game option on (streaks, special words, the boss, perks), and shorter
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
- **Battle**: best individual scores from multiplayer battles, with the place and player count of that battle.

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

## Tuning

Round length, fall speed, spawn rate and points multipliers are in the `ROUNDS` table at the top of
`server.js`, next to the countdown and break lengths (`SOLO_INTERMISSION_MS` for solo). Team battle settings
sit there too: `TEAM_HP`, how long attacks take to fly (`FLIGHT_MS`), how often power-ups appear and how long
their effects last. The game options have their own settings: the boss round (`BOSS_ROUND`, `BOSS_HP`, bonuses),
streak steps (`STREAK_STEPS`), special words (`SPECIAL_CHANCE`, `GOLD_FACTOR`, `ICE_MS`, `BOMB_SHARE`) and class
perks (`PERKS`), skills (`SKILLS`, `SKILL_WORDS`). The auto-typer limits are the `KEY_*` and `FLAG_AFTER`
settings. Word lists are in `words.js`; if you change them a lot, the perk bonuses may need re-measuring.
The music tracks are the `TRACKS` table in `public/js/common.js`.

## Files

- `server.js`: Express + Socket.IO server; battle, team battle and solo rooms, rounds, word spawning, scoring, HP, Hall of Fame
- `data/highscores.json`: saved Hall of Fame (created after the first finished game)
- `words.js`: easy / medium / hard word pools
- `public/host.html`, `public/js/host.js`: big screen (QR lobby, battlefield, leaderboard, podium)
- `public/play.html`, `public/js/play.js`: phone (hero creator, lobby, solo, typing, results, Hall of Fame)
- `public/js/arena.js`: shared pixel battlefield renderer (monsters, attacks, particles)
- `public/js/art.js`: pixel sprites and palettes (heroes, monsters, the Dragon King, special words, power-ups)
- `public/js/common.js`: clock sync, DOM helper, 8-bit sound effects and the chiptune music
- `scripts/bots.js`: test bots
