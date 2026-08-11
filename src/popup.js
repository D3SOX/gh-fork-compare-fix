'use strict';

(() => {
  const repoLabel = document.getElementById('repo');
  const toggle = document.getElementById('toggle');
  const enabled = document.getElementById('enabled');
  const hint = document.getElementById('hint');

  init();

  async function init() {
    document.getElementById('options').addEventListener('click', () => {
      GH.runtime.openOptionsPage();
      window.close();
    });

    const [tab] = await GH.tabs.query({ active: true, currentWindow: true });
    const repo = repoFromUrl(tab?.url ?? '');
    if (!repo) {
      hint.textContent = 'Open a repository on github.com to enable it here.';
      return;
    }

    repoLabel.textContent = repo;
    repoLabel.hidden = false;

    const settings = await getSettings();
    const wildcard = settings.repos.find((pattern) => pattern.endsWith('/*') && repoMatches([pattern], repo));
    if (wildcard) {
      enabled.checked = true;
      enabled.disabled = true;
      hint.textContent = `Enabled through ${wildcard}.`;
      toggle.hidden = false;
      return;
    }

    enabled.checked = repoMatches(settings.repos, repo);
    toggle.hidden = false;
    enabled.addEventListener('change', () => apply(tab, settings.repos, repo));
  }

  /** Reload the tab so GitHub re-renders the links and the branch info bar. */
  async function apply(tab, repos, repo) {
    const next = enabled.checked
      ? [...repos, repo]
      : repos.filter((pattern) => pattern.toLowerCase() !== repo.toLowerCase());

    await GH.storage.sync.set({ repos: next });
    await GH.tabs.reload(tab.id);
    window.close();
  }
})();
