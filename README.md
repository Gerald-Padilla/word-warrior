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

| Round | Monsters | Words | Points |
|-------|----------|-------|--------|
| 1 · EASY | Slime Swarm | 3–5 letters (`orc`, `sword`) | 10 per letter |
| 2 · MEDIUM | Bat Storm | 6–8 letters (`dragon`, `gauntlet`) | 20 per letter |
| 3 · HARD | Skull Inferno | 8–13 letters (`necromancer`) | 30 per letter |

- Free-for-all: whoever finishes typing a word first gets it. Nobody else can score that word.
- No Enter key needed. The word fires the moment it's spelled correctly. Enter clears the whole word;
  Backspace deletes one letter.
- On phones, every hero stands on the battlefield: yours big in the middle, the rest beside you. When someone
  gets a word, their hero attacks it and their name pops up above them.
- As you type, the letters that still match a word show gold (in the box and on the word itself). A typo
  shows white on red in the box, marks the exact letter you missed on the word you were going for, shakes
  and buzzes, and a "TYPO!" hint shows how to fix it.
- If someone else gets the word you were halfway through (or it escapes), a big "TOO SLOW!" / "TOO LATE!"
  says who got it, and your input clears.
- Words that reach the ground escape and nobody scores them.
- More players means more words on screen at once.

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

**Heroes:** Knight (sword beam), Wizard (fireball), Elf Archer (arrow), Rogue (dagger volley),
Cleric (holy light), Barbarian (spinning axe). Customize each with 8 colors, 4 skin tones, 8 hair/beard
colors (archer, wizard, barbarian), 6 trims (the gold accents) and a companion pet (cat, owl, slime, baby
dragon or fox) that follows your hero into battle. The creator shows your hero on a mini battlefield doing
their attack (tap it to attack again), and has **RANDOM LOOK** and a random-name button.

**Host controls:** FREE FOR ALL / TEAM BATTLE, START BATTLE, SHUFFLE TEAMS, HALL OF FAME, SKIP ▶ (jump to the next phase), SOUND ON/OFF,
PLAY AGAIN / BACK TO LOBBY on the podium screen. In the lobby, a hero's **X** removes them; in free for all
clicking the hero also removes them, in a team battle it moves them to the other team.

Players who lose connection (phone locked, Wi-Fi blip) rejoin automatically with their score intact.

## Solo mode

Anyone can practice alone, without a host screen: open `/play` (for example `http://192.168.1.20:3000/play`),
build a hero and tap **PLAY SOLO**. It works on a laptop with a keyboard too.

- Same three rounds as a battle, with shorter breaks (5 seconds instead of 9).
- When you clear every monster, the next one appears right away, so faster typists score more.
- The top bar shows **HI**, the best solo score so far. Tap **X** to abandon a run; abandoned runs aren't saved.
- At the end you see your place in the solo Hall of Fame, then **PLAY AGAIN** or **MENU**.

## Hall of Fame

Every finished game is recorded on one of two boards:

- **Solo**: best solo quests.
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
their effects last. Word lists are in `words.js`.

## Files

- `server.js`: Express + Socket.IO server; battle, team battle and solo rooms, rounds, word spawning, scoring, HP, Hall of Fame
- `data/highscores.json`: saved Hall of Fame (created after the first finished game)
- `words.js`: easy / medium / hard word pools
- `public/host.html`, `public/js/host.js`: big screen (QR lobby, battlefield, leaderboard, podium)
- `public/play.html`, `public/js/play.js`: phone (hero creator, lobby, solo, typing, results, Hall of Fame)
- `public/js/arena.js`: shared pixel battlefield renderer (monsters, attacks, particles)
- `public/js/art.js`: pixel sprites and palettes (heroes, monsters, power-ups)
- `public/js/common.js`: clock sync, DOM helper, 8-bit sound effects
- `scripts/bots.js`: test bots
