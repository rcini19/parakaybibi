# parakaybibi

Daily active-recall tracker for the **Electronics Engineering (ECE) Licensure Exam** — Mathematics, GEAS, Electronics, and Electronic Systems & Technologies, with the full topic scope preloaded.

- **Clock** at the top — day / month / year, rotating motivational quote, 12h and 24h time, exam countdown.
- **Today** — pick only the topics / subtopics to study that day, then tick each one after active recall. Unfinished items can be carried over to the next day. Shows how long ago each topic was last reviewed and flags subjects not touched in the last 7 days.
- **Weekly** — per-subject progress grid for the week, topics covered, overall progress and mastery, plus a strength / weakness card per subject (based on how many of the last 7 days it was reviewed).
- **Subjects** — edit the required topics (paste a list, one per line), optional subtopics, mark topics as mastered ★.
- **Settings** — exam date, quotes, export/import backup.

- **Cloud sync** — sign in with Google (Settings, or the ☁ button) and progress stays the same on phone and laptop. Works offline and syncs when back online.

No build step: host it with GitHub Pages (`https://rcini19.github.io/parakaybibi/`). Each device keeps a working copy in localStorage; [sync.js](sync.js) mirrors it to Firestore (`trackers/{uid}`) in the `forbibi-88a25` Firebase project, where the security rules only let each person read and write their own document. Google sign-in only works on authorized domains (`localhost` and `rcini19.github.io`), so opening `index.html` straight from disk won't sync.
