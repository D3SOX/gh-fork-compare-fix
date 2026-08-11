'use strict';

/**
 * GitHub points every compare/pull request link on a fork at the upstream repo.
 * For the repos configured in the options page we rewrite those links (and
 * optionally the current page) so the fork itself is the base repository, with
 * the fork's own default branch as the base branch.
 */
(() => {
  const COMPARE_PATH_RE = /^\/([^/]+)\/([^/]+)\/compare\/(.+)$/;
  const PULL_NEW_PATH_RE = /^\/([^/]+)\/([^/]+)\/pull\/new\/(.+)$/;
  const LINK_SELECTOR = 'a[href*="/compare/"], a[href*="/pull/new/"]';
  const BRANCH_NAME_SELECTOR = '[data-component="BranchName"]';
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const CACHE_PREFIX = 'defaultBranch:';

  let settings = DEFAULT_SETTINGS;
  let lastHref = '';
  const pending = new Map();
  const pendingCounts = new Map();
  /** Last href we looked at per link, so React re-renders are picked up but loops are not. */
  const seen = new WeakMap();

  init();

  async function init() {
    settings = await getSettings();
    GH.storage.onChanged.addListener(async (_changes, area) => {
      if (area !== 'sync') return;
      settings = await getSettings();
      run();
    });

    run();
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('pageshow', run);
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      run();
    });
  }

  function run() {
    if (!settings.repos.length) return;
    if (location.href !== lastHref) {
      lastHref = location.href;
      if (settings.redirect) redirectIfNeeded();
    }
    rewriteLinks();
    rewriteBranchSentences();
  }

  async function redirectIfNeeded() {
    const target = await forkCompareUrl(new URL(location.href));
    if (target) location.replace(target);
  }

  function rewriteLinks() {
    for (const link of document.querySelectorAll(LINK_SELECTOR)) {
      if (seen.get(link) === link.href) continue;
      seen.set(link, link.href);
      rewriteLink(link);
    }
  }

  async function rewriteLink(link) {
    let url;
    try {
      url = new URL(link.href);
    } catch {
      return;
    }
    if (url.hostname !== 'github.com') return;

    const target = await forkCompareUrl(url);
    if (!target || !link.isConnected) return;
    link.href = target;
    seen.set(link, link.href);
  }

  /**
   * On a fork, the branch info bar and the Contribute menu count commits against
   * the upstream repository ("1416 commits ahead of Upstream/Repo:development").
   * Restate them against the repo's own default branch, which is exactly what a
   * repository that is not a fork shows. Upstream references are the ones whose
   * branch name is an "owner/repo:ref" chip; a plain ref is already ours.
   */
  async function rewriteBranchSentences() {
    const upstream = [...document.querySelectorAll(BRANCH_NAME_SELECTOR)].filter((name) =>
      name.textContent.includes(':'),
    );
    if (!upstream.length) return;

    const nwo = repoFromUrl(location.href);
    if (!nwo || !repoMatches(settings.repos, nwo)) return;
    const [owner, repo] = nwo.split('/');

    const branch = currentBranch();
    const defaultBranch = await getDefaultBranch(owner, repo);
    if (!branch || !defaultBranch || branch === defaultBranch) return;

    const counts = await aheadBehind(owner, repo, branch);
    if (!counts) return;

    for (const branchName of upstream) {
      rewriteSentence(branchName, { owner, repo, branch, defaultBranch, counts });
    }
  }

  function rewriteSentence(branchName, { owner, repo, branch, defaultBranch, counts }) {
    const sentence = branchName.parentElement;
    if (!sentence?.isConnected) return;

    // The info bar links its counts, the Contribute menu does not - keep whichever it is.
    const template = sentence.querySelector('a[data-component="Link"]');
    const part = (label, base, head) => {
      if (!template) {
        const text = document.createElement('span');
        text.textContent = label;
        return text;
      }
      // Cloned so the link keeps GitHub's own (hashed) classes.
      const link = template.cloneNode(false);
      link.textContent = label;
      link.href = `/${owner}/${repo}/compare/${encodeRef(base)}...${encodeRef(head)}`;
      return link;
    };
    const commits = (count) => `${count} commit${count === 1 ? '' : 's'}`;

    const parts = [];
    if (counts.ahead) parts.push(part(`${commits(counts.ahead)} ahead of`, defaultBranch, branch));
    if (counts.ahead && counts.behind) parts.push(' and ');
    if (counts.behind) parts.push(part(`${commits(counts.behind)} behind`, branch, defaultBranch));

    branchName.textContent = defaultBranch;
    sentence.replaceChildren(
      ...(parts.length
        ? ['This branch is ', ...parts, ' ', branchName, '.']
        : ['This branch is up to date with ', branchName, '.']),
    );
  }

  function currentBranch() {
    const label = document.querySelector('[data-testid="anchor-button"]')?.getAttribute('aria-label') ?? '';
    return label.endsWith(' branch') ? label.slice(0, -' branch'.length) : null;
  }

  async function aheadBehind(owner, repo, branch) {
    const key = `${owner}/${repo}@${branch}`;
    if (!pendingCounts.has(key)) {
      pendingCounts.set(key, fetchAheadBehind(owner, repo, branch).catch(() => null));
    }
    return pendingCounts.get(key);
  }

  /** The endpoint the branches page uses; it counts against the repo's own default branch. */
  async function fetchAheadBehind(owner, repo, branch) {
    const response = await fetch(`https://github.com/${owner}/${repo}/branches/deferred_metadata`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'GitHub-Verified-Fetch': 'true',
      },
      body: JSON.stringify({ branches: [branch] }),
    });
    if (!response.ok) return null;

    const [ahead, behind] = (await response.json())?.deferredMetadata?.[branch]?.aheadBehind ?? [];
    return Number.isInteger(ahead) && Number.isInteger(behind) ? { ahead, behind } : null;
  }

  /**
   * Returns the URL that compares `head` against the head repo's own default
   * branch, or null if the URL is not a compare link for a configured repo.
   */
  async function forkCompareUrl(url) {
    const target = parseTarget(url.pathname);
    if (!target || !target.head) return null;

    const { owner, repo, base, head } = target;
    const headNwo = `${head.owner}/${head.repo}`;
    if (!repoMatches(settings.repos, headNwo)) return null;

    // Without an explicit base GitHub falls back to the upstream repository, so
    // only an explicit base pointing at the fork itself is already correct.
    const pageNwo = `${owner}/${repo}`;
    if (base && sameRepo(`${base.owner}/${base.repo}`, headNwo) && sameRepo(pageNwo, headNwo)) return null;

    const defaultBranch = await getDefaultBranch(head.owner, head.repo);
    if (!defaultBranch || decodeRef(head.ref) === defaultBranch) return null;

    const fixed = new URL(url.href);
    fixed.pathname = `/${head.owner}/${head.repo}/compare/${encodeRef(defaultBranch)}...${head.ref}`;
    return fixed.href === url.href ? null : fixed.href;
  }

  function sameRepo(a, b) {
    return a.toLowerCase() === b.toLowerCase();
  }

  /** Compare or "open a pull request" paths -> repo of the page plus both revision specs. */
  function parseTarget(pathname) {
    const pullNew = PULL_NEW_PATH_RE.exec(pathname);
    if (pullNew) {
      const [, owner, repo, ref] = pullNew;
      return { owner, repo, base: null, head: parseRevision(ref, owner, repo) };
    }

    const match = COMPARE_PATH_RE.exec(pathname);
    if (!match) return null;

    const [, owner, repo, rawRange] = match;
    // GitHub percent-encodes the ":" in "owner:repo:ref"; a git ref can never contain one.
    const range = rawRange.replace(/%3A/gi, ':');
    let baseRaw = null;
    let headRaw = range;
    for (const separator of ['...', '..']) {
      const index = range.indexOf(separator);
      if (index >= 0) {
        baseRaw = range.slice(0, index);
        headRaw = range.slice(index + separator.length);
        break;
      }
    }

    return {
      owner,
      repo,
      base: parseRevision(baseRaw, owner, repo),
      head: parseRevision(headRaw, owner, repo),
    };
  }

  /** Revision specs are "ref", "owner:ref" or "owner:repo:ref". Refs stay URL-encoded. */
  function parseRevision(raw, owner, repo) {
    if (!raw) return null;
    const parts = raw.split(':');
    if (parts.length >= 3) return { owner: parts[0], repo: parts[1], ref: parts.slice(2).join(':') };
    if (parts.length === 2) return { owner: parts[0], repo, ref: parts[1] };
    return { owner, repo, ref: raw };
  }

  function decodeRef(ref) {
    try {
      return decodeURIComponent(ref);
    } catch {
      return ref;
    }
  }

  function encodeRef(ref) {
    return encodeURIComponent(ref).replace(/%2F/g, '/');
  }

  /** Memoized per page load; both lookups below are far too costly to repeat per mutation. */
  async function getDefaultBranch(owner, repo) {
    const key = CACHE_PREFIX + `${owner}/${repo}`.toLowerCase();
    if (!pending.has(key)) pending.set(key, resolveDefaultBranch(owner, repo, key));

    const branch = await pending.get(key);
    if (!branch) pending.delete(key); // let a failed lookup be retried
    return branch;
  }

  async function resolveDefaultBranch(owner, repo, key) {
    const fromPage = defaultBranchFromPage(`${owner}/${repo}`);
    if (fromPage) {
      GH.storage.local.set({ [key]: { branch: fromPage, ts: Date.now() } });
      return fromPage;
    }

    const cached = (await GH.storage.local.get(key))[key];
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.branch;

    const branch = await fetchDefaultBranch(owner, repo).catch(() => null);
    if (branch) GH.storage.local.set({ [key]: { branch, ts: Date.now() } });
    return branch;
  }

  /** The repo page embeds its metadata as JSON; only trust it when unambiguous. */
  function defaultBranchFromPage(nwo) {
    const pageNwo = document.querySelector('meta[name="octolytics-dimension-repository_nwo"]')?.content;
    if (!pageNwo || !sameRepo(pageNwo, nwo)) return null;

    const branches = new Set();
    for (const script of document.querySelectorAll('script[type="application/json"]')) {
      for (const match of script.textContent.matchAll(/"defaultBranch":"((?:[^"\\]|\\.)*)"/g)) {
        try {
          branches.add(JSON.parse(`"${match[1]}"`));
        } catch {
          /* ignore malformed match */
        }
      }
    }
    return branches.size === 1 ? [...branches][0] : null;
  }

  async function fetchDefaultBranch(owner, repo) {
    const response = await fetch(`https://github.com/${owner}/${repo}/branches/all`, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    if (!response.ok) return null;

    const branches = (await response.json())?.payload?.branches ?? [];
    return branches.find((branch) => branch.isDefault)?.name ?? null;
  }
})();
