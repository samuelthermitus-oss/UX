# Publishing SecPrep Daily

These steps go from this folder to the App Store and Google Play. Only you can do the account and payment steps, because they need your identity.

## 0. Before anything

1. **Change the app ID.** In `capacitor.config.json`, `com.secprepdaily.app` must be unique to you, for example `com.yourname.secprep`. Then rebuild the projects:

   ```bash
   rm -rf ios android && npx cap add ios && npx cap add android && npx cap sync
   ```

   After that, re-run the icon step (section 3).
2. **Host the privacy policy.** Both stores require a public URL. Free options are GitHub Pages, Netlify Drop or Cloudflare Pages. Upload `www/privacy.html` and copy its URL.
3. **Have someone review the French and Kreyòl text.** A native speaker should read `www/data/fr.js` and `www/data/ht.js`, especially the Kreyòl.
4. **Install Node.js 20 or newer**, then run:

   ```bash
   npm install
   ```

   Then check the data:

   ```bash
   npm run check
   ```

## 1. Developer accounts

| | Apple | Google |
|---|---|---|
| Sign up | developer.apple.com/programs | play.google.com/console |
| Cost | US$99 per year | US$25 one time |
| Approval | ID check, about 1–2 days | ID check, about 1–3 days |
| Note | | New **personal** accounts must run a closed test with at least **12 testers for 14 days** before the app can go public. Start this early. |

## 2. Android (Google Play)

1. Install **Android Studio**.
2. Open the project:

   ```bash
   npx cap sync android && npx cap open android
   ```

3. Wait for Gradle to finish. Then choose Run ▶ to try the app on an emulator or on your phone with USB debugging turned on.
4. **Build › Generate Signed Bundle / APK › Android App Bundle**, then create a new keystore.
   **Back up the keystore file and its passwords.** You cannot update the app without them.
5. In the Play Console:
   1. Create the app.
   2. Fill in the store listing, using the text in `STORE_LISTING.md`.
   3. Upload screenshots.
   4. Complete the content rating, target audience, Data safety and privacy policy URL.
6. **Data safety form:** "No data collected" and "No data shared".
7. Upload the `.aab` to **Testing › Closed testing** and invite 12 or more testers by email. After 14 days, apply for production.

## 3. App icons and splash (already generated)

Source images are in `assets/`. To regenerate them after changing the images or app ID:

```bash
npm run assets
```

## 4. iPhone (App Store)

You need a Mac with **Xcode**. If you don't have one:
- Use a cloud Mac build service such as Codemagic, Ionic Appflow or MacinCloud, connected to this repository.
- Or borrow a Mac for the archive and upload steps.

1. Open the project:

   ```bash
   npx cap sync ios && npx cap open ios
   ```

2. In Xcode, choose the **App** target › Signing & Capabilities and pick your Team.
3. Set the version (1.0.0) and build number (1).
4. Run it on your iPhone to test, including audio and the daily reminder.
5. **Product › Archive**, then **Distribute App › App Store Connect**.
6. In App Store Connect:
   1. Create the app.
   2. Add the listing text (`STORE_LISTING.md`), screenshots (6.7" and 6.5" iPhone), privacy policy URL and support URL.
   3. Set the age rating to 4+.
7. **App Privacy:** "Data Not Collected".
8. Test with **TestFlight** first, then **Submit for Review**.

## 5. Avoiding rejection

- **Trademarks.** Don't put "CompTIA" or "Security+" in the app name, subtitle or icon. Saying "practice for the CompTIA Security+ exam" in the description is fine, together with the "not affiliated" line, which the app already shows.
- **Never claim "real exam questions" or "exam dumps".** Both stores reject that, and CompTIA can revoke certifications for using real exam content. The questions here are original.
- **Apple guideline 4.2 (minimum functionality).** Apple rejects apps that are just a website in a wrapper. This app works offline and has native speech, native daily reminders and saved progress. In the review notes, mention: "Offline study app with native text-to-speech lessons and local daily reminder notifications."
- **Screenshots** must show the real app. Take them from the simulator or emulator in each language you list.

## 6. Upgrading the voice (optional, costs money)

Phone voices are good, but not a real person. For a truly human-sounding coach:

1. **Generate audio files ahead of time** with a neural voice service, such as ElevenLabs, Microsoft Azure Speech or Google Cloud Text-to-Speech. Generate one file per question, explanation and lesson in each language.
   - English and French have very natural voices with emotion and styles.
   - Haitian Creole has very few or no neural voices. The best option is to **hire a Haitian Creole voice actor** to record the lessons and scenarios.
2. Save the files as `www/audio/<lang>/q-<number>.mp3`, `lesson-<d>-<n>.mp3` and so on, then play them in `app.js` before falling back to text-to-speech.
3. About 189 questions plus lessons comes to roughly 3–4 hours of audio per language. Check your app size, and consider downloading the audio after install.

Tell Claude which service you choose, and it can add the audio player code and a script to generate the files.

## 7. Updating the app later

1. Edit the files in `www/`.
2. Run the checks and sync:

   ```bash
   npm run check && npx cap sync
   ```

3. Bump the version: `versionCode` and `versionName` in `android/app/build.gradle`, and Version and Build in Xcode.
4. Build and upload again.
