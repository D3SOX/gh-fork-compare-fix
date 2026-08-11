# GitHub Fork Compare Fix

On a fork, GitHub points every compare / pull request link at the upstream repository — the "Contribute" menu, the
"Compare & pull request" banner and the "N commits ahead" link in the branch info bar. If you use your fork as a real
repository (own default branch, own PRs), that is the wrong target every single time.

This extension rewrites those links for repositories you configure, so they compare **your branch against your fork's
own default branch**:

```
github.com/upstream/repo/compare/main...owner:repo:my-branch    ->    github.com/owner/repo/compare/my-default...my-branch
```

It also restates the branch info bar against your own default branch, so an enabled fork reads exactly like a
repository that is not a fork:

```
This branch is 1416 commits ahead of and 59 commits behind upstream/repo:main.   (GitHub)
This branch is 1 commit ahead of and 212 commits behind my-default.              (with this extension)
```

Optionally it also redirects when such an upstream compare page is already open.

Works in Chrome and Firefox (Manifest V3, no build step, no dependencies).

## Install

**Chrome / Chromium / Edge** — `chrome://extensions` → enable *Developer mode* → *Load unpacked* → pick this folder.

**Firefox** — `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → pick `manifest.json`.
Temporary add-ons are removed on restart; for a permanent install, zip the folder and sign it via
[addons.mozilla.org](https://addons.mozilla.org/developers/) (`zip -r gh-fork-compare-fix.zip manifest.json icons src`).

## Configure

Click the toolbar icon while a repository is open to toggle it on or off — the tab reloads so GitHub re-renders with
the new setting. Repositories enabled through an `owner/*` pattern show up as enabled but can only be changed in the
options page.

The options page (*Manage repositories…* in the popup) takes the same repositories as `owner/repo`, or `owner/*` for
every repository of an owner.

- **Redirect open compare pages** — when enabled, opening an upstream compare page for a configured fork navigates to
  the fork's own compare page instead. Turn it off to only rewrite links.

## How it works

`src/content.js` runs on `github.com` and watches the DOM, because GitHub renders all of this client-side. It:

- rewrites `/compare/` links whose *head* repository is configured while the base repository is a different repo — the
  "N commits ahead" link, "Compare & pull request", the "Contribute" menu. Links pointing the other way around (the
  "N commits behind" link) keep their meaning and are left alone.
- rewrites `/pull/new/<branch>` links, which GitHub would otherwise 302 to the upstream compare page.
- rebuilds the branch info bar sentence (reusing GitHub's own elements, so the styling is theirs).

Data it needs comes from GitHub's own endpoints, using your existing session — no third-party requests, no API token:

- default branch: the repository page's embedded metadata when available, otherwise `/<owner>/<repo>/branches/all`,
  cached in `storage.local` for 24 hours.
- commits ahead/behind your default branch: `/<owner>/<repo>/branches/deferred_metadata`, the same endpoint the
  branches page uses.

## License

[GPL-3.0](LICENSE)
