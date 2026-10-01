// The two things a registry maintainer does. No dependencies (Node 22+).
//
//   node scripts/registry.mjs pin <owner/name> <commit> [--local <dir>]
//       Reads manifest.json, main.js and screenshots/ of that repo at that exact commit and adds (or replaces) its line in plugins.json,
//       with the SHA-256 of both files. --local reads a git checkout on this machine instead of GitHub (for trying it before a push).
//   node scripts/registry.mjs verify
//       For every line in plugins.json: fetch the files at the pinned commit from GitHub and check they still hash to what is listed,
//       that the manifest's id is the entry's id, and that there are at least 3 screenshots. CI runs this on every pull request.
//
// The reviewer's job is still to READ main.js at that commit; this only proves that what was read is what users get.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../plugins.json", import.meta.url);
const MIN_SCREENSHOTS = 3;
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exitCode = 1;
};

/** Reads files of one repo at one commit, from GitHub or a local checkout. */
function source(repo, commit, local) {
  if (local) {
    const git = (...args) => execFileSync("git", ["-C", local, ...args], { encoding: "utf8" });
    return {
      text: async (path) => git("show", `${commit}:${path}`),
      list: async (dir) => git("ls-tree", "--name-only", `${commit}:${dir}`).split("\n").filter(Boolean),
    };
  }
  const raw = (path) => `https://raw.githubusercontent.com/${repo}/${commit}/${path}`;
  return {
    text: async (path) => {
      const res = await fetch(raw(path));
      if (!res.ok) throw new Error(`${raw(path)} answered ${res.status}`);
      return res.text();
    },
    list: async (dir) => {
      const res = await fetch(`https://api.github.com/repos/${repo}/contents/${dir}?ref=${commit}`);
      if (!res.ok) throw new Error(`no ${dir}/ at ${commit} (${res.status})`);
      return (await res.json()).map((f) => f.name);
    },
  };
}

const SHOT = /\.(png|jpe?g|webp)$/i;

async function inspect(repo, commit, local) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("the commit must be the full 40-character SHA, not a branch or tag");
  const src = source(repo, commit, local);
  const manifestText = await src.text("manifest.json");
  const manifest = JSON.parse(manifestText);
  const code = await src.text("main.js");
  const screenshots = (await src.list("screenshots")).filter((n) => SHOT.test(n)).sort();
  if (screenshots.length < MIN_SCREENSHOTS) throw new Error(`needs at least ${MIN_SCREENSHOTS} screenshots in screenshots/ (found ${screenshots.length})`);
  return { id: manifest.id, manifestSha256: sha256(manifestText), mainSha256: sha256(code), screenshots, manifest };
}

const [cmd, ...args] = process.argv.slice(2);
const registry = JSON.parse(readFileSync(FILE, "utf8"));

if (cmd === "pin") {
  const [repo, commit] = args;
  const local = args.includes("--local") ? args[args.indexOf("--local") + 1] : undefined;
  if (!repo || !commit) throw new Error("usage: pin <owner/name> <commit> [--local <dir>]");
  const { manifest, ...found } = await inspect(repo, commit, local);
  const entry = { id: found.id, repo, commit, manifestSha256: found.manifestSha256, mainSha256: found.mainSha256, screenshots: found.screenshots };
  const others = registry.plugins.filter((p) => p.id !== entry.id);
  const old = registry.plugins.find((p) => p.id === entry.id);
  if (old && old.repo !== repo) throw new Error(`"${entry.id}" already belongs to ${old.repo}`);
  registry.plugins = [...others, entry].sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(FILE, JSON.stringify(registry, null, 2) + "\n");
  console.log(`${old ? "updated" : "added"} ${entry.id} ${manifest.version} @ ${commit.slice(0, 7)}. Now read main.js at that commit before merging.`);
} else if (cmd === "verify") {
  const ids = new Set();
  for (const e of registry.plugins) {
    try {
      if (ids.has(e.id)) throw new Error("listed twice");
      ids.add(e.id);
      const found = await inspect(e.repo, e.commit);
      if (found.id !== e.id) throw new Error(`manifest.json says id "${found.id}"`);
      if (found.manifestSha256 !== e.manifestSha256) throw new Error("manifest.json does not match its pinned hash");
      if (found.mainSha256 !== e.mainSha256) throw new Error("main.js does not match its pinned hash");
      if (JSON.stringify(found.screenshots) !== JSON.stringify(e.screenshots)) throw new Error("the screenshots listed are not the ones at that commit");
      console.log(`✔ ${e.id}`);
    } catch (err) {
      fail(`${e.id}: ${err.message}`);
    }
  }
} else {
  throw new Error("usage: node scripts/registry.mjs pin|verify");
}
