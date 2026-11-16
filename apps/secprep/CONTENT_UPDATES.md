# Live content updates

The app downloads new questions, lessons and scenarios from the internet, without an App Store update. It keeps the last download for offline use.

## One-time setup
1. Create a **public** place to host one file. A free option: a new public GitHub repo called `secprep-content` with GitHub Pages turned on (Settings › Pages › Deploy from branch `main`).
2. Put its address in `www/config.js`:
   `contentUrl: "https://YOUR-NAME.github.io/secprep-content/content.json"`
3. Run `npx cap sync`, then ship that version of the app once through the App Store.

## Every time you add content
1. Edit `www/data/en.js` and `www/data/fr.js`. **Only add new questions at the end. Never reorder or delete them**, because saved progress refers to question positions.
2. Build the file with a version higher than the last one:

   ```bash
   npm run build:content -- 2026.12.01.1
   ```

3. Upload `dist/content/content.json` to your hosting, replacing the old file.

Users get the new content the next time they open the app (it checks at launch and every 6 hours), with a short "new questions added" message.

## What can't be updated this way
New screens, design changes and new features change the app's code. Those go through Xcode and an App Store update. Apple allows downloading study content, but not changing the app's code remotely.
