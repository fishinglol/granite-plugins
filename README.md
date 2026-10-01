# Granite plugins

The reviewed list of community plugins for [Granite](https://github.com/fishinglol/grantie). Each plugin lives in **its author's own
GitHub repo**; this repo only says which exact version has been read and approved. Granite's Store loads `plugins.json` from here.

## Get your plugin listed

1. Put your plugin in a repo of your own: `manifest.json`, `main.js` (plain, readable JavaScript, not minified) and at least three
   real screenshots in `screenshots/`. Add a `README.md` and a licence. Start from
   [the guide](https://granite-docs-phi.vercel.app/build).
2. Fork this repo and run

   ```
   node scripts/registry.mjs pin <owner/name> <full commit SHA>
   ```

   It adds one entry to `plugins.json`: your repo, that exact commit, and the SHA-256 of `manifest.json` and `main.js`.
3. Open a pull request. CI re-fetches your files at that commit and checks they still match. A maintainer then **reads `main.js`
   at that commit** before merging.

## Releasing an update

Raise `version` in your `manifest.json`, commit, and open a pull request that runs `pin` again with the new commit. Users get the
new version only after it has been reviewed and merged here. Changing your repo without a new entry changes nothing for users: the
app downloads your files at the pinned commit and refuses any file that doesn't match its hash.

## What a maintainer checks

The rules in Granite's `CONTRIBUTING.md` apply: permissions match what the code does, no `eval` or remote scripts, note text is
never used as HTML, nothing minified or obfuscated, it works on the phone or says `"desktopOnly": true`. `verify` only checks the
files are the ones that were reviewed and that the manifest's `id` and the screenshots are in order; Granite itself validates the
manifest again when it loads the list.
