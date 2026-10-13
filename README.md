# Parlay Board (auto-updating)

Setup, about 10 minutes, all free:
1. Make a GitHub account and a new public repo. Upload every file in this folder, including the .github folder.
2. Get a free key at https://the-odds-api.com and add it in the repo under Settings > Secrets and variables > Actions as ODDS_API_KEY.
3. Settings > Pages > Deploy from branch > main > / (root). Your board will live at https://YOUR-NAME.github.io/REPO-NAME/
4. Actions tab > "Update board data" > Run workflow once. After that it runs Tue, Thu, Fri, Sat and Sunday morning on its own.

Notes:
- Each run uses 1 odds request, far under the free 500 per month.
- overrides.json fixes the venue for neutral-site games (London is set for this week's Texans/Jaguars). Remove or edit it later.
- Weather rules and injury notes are automatic. The line-shift arrows and weather buttons on the page still work for your own changes.
