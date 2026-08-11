'use strict';

/** Works in both Chrome (chrome.*) and Firefox (browser.*), both promise-based. */
const GH = globalThis.browser ?? globalThis.chrome;

const DEFAULT_SETTINGS = {
  /** Repos whose branches should be compared against themselves, e.g. "owner/repo" or "owner/*". */
  repos: [],
  /** Also redirect when an upstream compare page is already open. */
  redirect: true,
};

const REPO_PATTERN_RE = /^[A-Za-z0-9._-]+\/(\*|[A-Za-z0-9._-]+)$/;

function getSettings() {
  return GH.storage.sync.get(DEFAULT_SETTINGS);
}

/** First path segments that are GitHub itself rather than a user or organisation. */
const RESERVED_OWNERS = new Set([
  'account',
  'apps',
  'codespaces',
  'collections',
  'dashboard',
  'explore',
  'issues',
  'login',
  'marketplace',
  'new',
  'notifications',
  'organizations',
  'orgs',
  'pulls',
  'search',
  'settings',
  'sponsors',
  'topics',
  'users',
]);

/** "https://github.com/owner/repo/tree/branch" -> "owner/repo", or null if it is not a repo page. */
function repoFromUrl(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.hostname !== 'github.com') return null;

  const [owner, repo] = url.pathname.split('/').filter(Boolean);
  if (!owner || !repo || RESERVED_OWNERS.has(owner.toLowerCase())) return null;

  const nwo = `${owner}/${repo}`;
  return isValidRepoPattern(nwo) ? nwo : null;
}

/** Accepts "owner/repo", a GitHub URL or a clone URL and returns "owner/repo". */
function normalizeRepoPattern(input) {
  return input
    .trim()
    .replace(/^git@github\.com:/, '')
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .slice(0, 2)
    .join('/');
}

function isValidRepoPattern(pattern) {
  return REPO_PATTERN_RE.test(pattern);
}

/** `nwo` is "owner/repo"; patterns may use "owner/*". Matching is case-insensitive. */
function repoMatches(patterns, nwo) {
  const [owner, repo] = nwo.toLowerCase().split('/');
  return patterns.some((pattern) => {
    const [pOwner, pRepo] = pattern.toLowerCase().split('/');
    return pOwner === owner && (pRepo === '*' || pRepo === repo);
  });
}
