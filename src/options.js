'use strict';

(() => {
  const form = document.getElementById('add-form');
  const input = document.getElementById('repo-input');
  const list = document.getElementById('repo-list');
  const error = document.getElementById('error');
  const redirect = document.getElementById('redirect');

  let repos = [];

  init();

  async function init() {
    const settings = await getSettings();
    repos = settings.repos;
    redirect.checked = settings.redirect;
    render();

    form.addEventListener('submit', onAdd);
    redirect.addEventListener('change', () => GH.storage.sync.set({ redirect: redirect.checked }));
  }

  function onAdd(event) {
    event.preventDefault();
    const repo = normalizeRepoPattern(input.value);
    if (!isValidRepoPattern(repo)) {
      error.textContent = 'Enter a repository as owner/repo (owner/* is allowed).';
      return;
    }
    if (repos.some((existing) => existing.toLowerCase() === repo.toLowerCase())) {
      error.textContent = `${repo} is already in the list.`;
      return;
    }

    error.textContent = '';
    input.value = '';
    save([...repos, repo]);
  }

  function save(next) {
    repos = next;
    render();
    GH.storage.sync.set({ repos });
  }

  function render() {
    list.replaceChildren(
      ...repos.map((repo) => {
        const name = document.createElement('code');
        name.textContent = repo;

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => save(repos.filter((other) => other !== repo)));

        const item = document.createElement('li');
        item.append(name, remove);
        return item;
      }),
    );
  }
})();
