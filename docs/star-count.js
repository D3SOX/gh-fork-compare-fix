const starCount = document.querySelector('[data-star-count]');

fetch('https://api.github.com/repos/D3SOX/gh-fork-compare-fix')
  .then((response) => {
    if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
    return response.json();
  })
  .then((repository) => {
    const count = repository.stargazers_count;
    if (!Number.isInteger(count)) return;

    starCount.textContent = new Intl.NumberFormat('en', {
      notation: count >= 1000 ? 'compact' : 'standard',
      maximumFractionDigits: 1,
    }).format(count);
    starCount.parentElement.setAttribute(
      'aria-label',
      `View the repository on GitHub (${count.toLocaleString('en')} ${count === 1 ? 'star' : 'stars'})`,
    );
  })
  .catch(() => {});
