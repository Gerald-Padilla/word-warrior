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
- Words you're typing are highlighted gold on your phone. Typos turn the input red.
- If someone else gets the word you were typing, your input clears and you see "TOO SLOW!".
- Words that reach the ground escape and nobody scores them.
- More players means more words on screen at once.

**Heroes:** Knight (sword beam), Wizard (fireball), Elf Archer (arrow), Rogue (dagger volley),
Cleric (holy light), Barbarian (spinning axe), each in 8 colors and 4 skin tones.

**Host controls:** START BATTLE, HALL OF FAME, SKIP ▶ (jump to the next phase), SOUND ON/OFF,
PLAY AGAIN / BACK TO LOBBY on the podium screen. Click a hero in the lobby to remove them.

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
`server.js`, next to the countdown and break lengths (`SOLO_INTERMISSION_MS` for solo). Word lists are in `words.js`.

## Files

- `server.js`: Express + Socket.IO server; battle and solo rooms, rounds, word spawning, scoring, Hall of Fame
- `data/highscores.json`: saved Hall of Fame (created after the first finished game)
- `words.js`: easy / medium / hard word pools
- `public/host.html`, `public/js/host.js`: big screen (QR lobby, battlefield, leaderboard, podium)
- `public/play.html`, `public/js/play.js`: phone (hero creator, lobby, solo, typing, results, Hall of Fame)
- `public/js/arena.js`: shared pixel battlefield renderer (monsters, attacks, particles)
- `public/js/art.js`: pixel sprites and palettes
- `public/js/common.js`: clock sync, DOM helper, 8-bit sound effects
- `scripts/bots.js`: test bots
