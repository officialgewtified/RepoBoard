# Signal (auto-updating)

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
- **Tickets:** save slips and track your record. Placed one without saving it? Tap **Log a ticket** to add it by hand (PrizePicks Power/Flex or a parlay, with the result if it's already settled). Plus the **Track record**: every pick the board made before kickoff, graded after the game, broken down by Strong/Playable/Thin, clean vs mixed signals, More vs Less, sport and stat. Results are kept in `history.json`.
- **Matchups and context:** team offense/defense ranks for every game, spread, total and each team's expected points (with opening lines), player recent games, median, home/away splits, targets/carries trends, injury status and teammates out (NFL), weather on passing props, and line movement.
- **Settings:** theme, which sportsbooks you can use, and PrizePicks payouts (edit them if your state's are different).

## Odds API credits
- Games update 5 times every week (Tue, Thu, Fri, Sat, Sun). Game lines cost 2 credits per update, and a reserve is always kept so they never stop.
- Player props cost 1 credit per stat per game. The default 4 stats (pass, rush, receiving yards, receptions) cost 4 credits per game.
- Every football week (Tuesday to Monday) gets the same share of your monthly credits: about 104 on the free plan (500 a month, minus the reserve). Game lines come out of that first and props get the rest, about 94 a week. Manual runs count against the same weekly amount.
- Within a week, weekday updates use a little and anything left rolls to Saturday (college) and Sunday (NFL). That's roughly 10 to 15 games of props each weekend on the free plan, NFL and ranked college teams first.
- Because each week has a fixed allowance, props keep coming every week no matter what day your credits reset. A paid plan raises the allowance automatically.
- Props are pulled for games that start before the next update, so each game is only paid for once.
- Change any of this in `settings.json`.

## Notes
- tickets.json adds tickets you forgot to save from the slip. Each one shows up on the Tickets tab once (by id), and deleting it there keeps it gone.
- overrides.json can set a venue for a neutral-site game, but neutral sites are now picked up automatically from ESPN.
- If you change the schedule in .github/workflows/update.yml, change `schedule` in settings.json to match.
- Chances are estimates from betting markets, not guarantees. For entertainment only. 21+ where legal. Help: 1-800-GAMBLER.
