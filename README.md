# Parlay Board (auto-updating)

NFL and college football moneylines from every sportsbook in the feed, PrizePicks lines checked against sportsbook player props, and scanners that score every parlay and PrizePicks lineup combination.

## Setup (about 10 minutes, free)
1. Make a GitHub account and a new public repo. Upload every file in this folder, including the .github folder.
2. Get a key at https://the-odds-api.com and add it in the repo under Settings > Secrets and variables > Actions as ODDS_API_KEY.
3. Settings > Pages > Deploy from branch > main > / (root). Your board lives at https://YOUR-NAME.github.io/REPO-NAME/
4. Actions tab > "Update board data" > Run workflow once. After that it runs Tue, Thu, Fri, Sat and Sunday morning on its own.

## What's on the board
- **Top picks:** the best PrizePicks lineup, the best lineup at each size, the strongest single picks, moneylines priced above fair, safest favorites and suggested parlays.
- **Games:** every NFL and college game with the best price at your books, fair win chance (vig removed, middle value across all books), weather and injuries. Tap Details for every book's price.
- **PrizePicks:** every player prop with the chance of More and Less at the PrizePicks line. The lineup scanner scores every 2 to 6 pick lineup of the strongest picks for Power and Flex.
- **Tickets:** save slips and track your record.
- **Settings:** theme, which sportsbooks you can use, and PrizePicks payouts (edit them if your state's are different).

## Odds API credits
- Game lines cost 2 credits per run (NFL + college).
- Player props cost 1 credit per stat per game. The default 4 stats (pass, rush, receiving yards, receptions) cost 4 credits per game.
- `settings.json` controls this. With `"prop_credits_per_run": "auto"` the script spreads your remaining monthly credits across the scheduled runs, giving Saturday and Sunday the biggest share, and always keeps a reserve for game lines.
- On the free plan (500 credits a month) that covers roughly 10 to 15 games of props on Saturdays and Sundays, starting with NFL and ranked college games. A paid plan covers every game automatically, no changes needed.
- Props are pulled for games that start before the next scheduled run, so each game is only paid for once.

## Notes
- overrides.json can set a venue for a neutral-site game, but neutral sites are now picked up automatically from ESPN.
- If you change the schedule in .github/workflows/update.yml, change `schedule` in settings.json to match.
- Chances are estimates from betting markets, not guarantees. For entertainment only. 21+ where legal. Help: 1-800-GAMBLER.
