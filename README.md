<h1><img src="icons/icon.svg" alt="" width="40" height="40" align="left">GitHub Fork Compare Fix</h1>

**[gh-fork-compare-fix.d3sox.me](https://gh-fork-compare-fix.d3sox.me)** · available on the
[Chrome Web Store](https://chromewebstore.google.com/detail/github-fork-compare-fix/mkmipkjkkikdfkfciofgmeicmafnkogh)
and [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/github-fork-compare-fix/).

GitHub assumes that a fork exists to send contributions upstream. Its "Contribute" menu, "Compare & pull request"
banner, and "N commits ahead" link all open comparisons against the upstream repository. That gets in the way when
your fork has its own default branch and pull requests.

This extension rewrites those links in the repositories you choose. Your branch is compared against your fork's own
default branch:

```
github.com/upstream/repo/compare/main...owner:repo:my-branch    ->    github.com/owner/repo/compare/my-default...my-branch
```

![The Contribute menu on a fork, opening a pull request against the fork itself](docs/shots/page-dropdown.webp)

It also recalculates the branch info bar against your fork's default branch:

**Before:** GitHub counts commits against upstream and opens pull requests there.

![GitHub: this branch is 1498 commits ahead of and 37 commits behind FreeTubeApp/FreeTube:development](docs/shots/bar-before.webp)

**After:** the extension counts commits against your default branch and keeps the links in your fork.

![With the extension: this branch is 2 commits ahead of and 111 commits behind development](docs/shots/bar-after.webp)

It can also redirect an upstream comparison after you open it.

The extension works in Chrome and Firefox. Both builds use Manifest V3 and have no build step or dependencies.

## Install

For **Chrome, Chromium, or Edge**, install it from the
[Chrome Web Store](https://chromewebstore.google.com/detail/github-fork-compare-fix/mkmipkjkkikdfkfciofgmeicmafnkogh).

For **Firefox 142 or newer**, install it from
[Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/github-fork-compare-fix/).

## Configure

Open a repository and click the toolbar icon to enable or disable the extension there. The tab reloads so GitHub can
render with the new setting. A repository enabled by an `owner/*` pattern can only be disabled from the options page.

![The extension popup, with a toggle to enable the current repository](docs/shots/popup.png)

Open *Manage repositories...* from the popup to edit the full list. Enter `owner/repo` for one repository or `owner/*`
for every repository owned by that account.

- **Redirect open compare pages.** When enabled, an upstream compare page for a configured fork redirects to the
  fork's own compare page. Turn it off if you only want the extension to rewrite links.

## How it works

GitHub renders these links in the browser, so `src/content.js` watches the DOM on `github.com`. It does three things:

- It rewrites `/compare/` links when the head repository is configured and the base belongs to another repository.
  This covers "N commits ahead", "Compare & pull request", and the "Contribute" menu. It leaves the "N commits
  behind" link alone because that link is supposed to point upstream.
- It rewrites `/pull/new/<branch>` links before GitHub redirects them to the upstream comparison.
- It rebuilds the branch info bar with GitHub's own elements and styling.

The extension uses your existing GitHub session and only sends requests to GitHub. It does not need an API token.

- It reads the default branch from metadata embedded in the repository page. If that metadata is missing, it requests
  `/<owner>/<repo>/branches/all`. The result is cached in `storage.local` for 24 hours.
- It gets the ahead and behind counts from `/<owner>/<repo>/branches/deferred_metadata`, the endpoint used by GitHub's
  branches page.

## Releasing

Bump `version` in `manifest.json`, then tag that commit:

```bash
git tag v1.0.1 && git push --tags
```

The [release workflow](.github/workflows/release.yml) checks that the tag matches the manifest version, runs the
linter, and builds separate Firefox and Chrome archives. The Chrome archive omits the Firefox-only
`browser_specific_settings` key. The workflow then publishes both archives in a GitHub release.

Tagged releases are also submitted automatically to addons.mozilla.org and the Chrome Web Store using these
repository secrets:

| Secret | Used for |
| --- | --- |
| `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` | signing/submitting on addons.mozilla.org ([API keys](https://addons.mozilla.org/developers/addon/api/key/)) |
| `CWS_EXTENSION_ID`, `CWS_PUBLISHER_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` | uploading and publishing on the Chrome Web Store |

The repository variable `AMO_CHANNEL` is currently set to `listed`, so Firefox releases go through public review. Set
it to `unlisted` to attach a signed `.xpi` to the GitHub release instead.

Run the [`Check store credentials`](.github/workflows/check-store-credentials.yml) workflow manually to verify both
stores' credentials without uploading or publishing a release.

## Credits

Claude Opus 5 wrote the extension in [Claude Code](https://claude.com/claude-code), including the work to find GitHub's
commit-count endpoints. The behavior was checked in a real browser session on github.com.

## License

[GPL-3.0](LICENSE)
