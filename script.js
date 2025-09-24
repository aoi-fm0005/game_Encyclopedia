(function initCatalog() {
  const games = Array.isArray(window.GAMES) ? window.GAMES : [];
  const catalog = document.getElementById("game-catalog");
  const template = document.getElementById("game-card-template");
  const searchInput = document.getElementById("search-input");

  if (!catalog || !template) {
    return;
  }

  function renderGames(gameList) {
    catalog.innerHTML = "";

    if (!gameList.length) {
      const emptyState = document.createElement("p");
      emptyState.className = "empty-state";
      emptyState.textContent = "一致するゲームが見つかりませんでした。";
      catalog.appendChild(emptyState);
      return;
    }

    const fragment = document.createDocumentFragment();

    gameList.forEach((game) => {
      if (!game || typeof game !== "object") {
        return;
      }

      const card = template.content.firstElementChild.cloneNode(true);

      const titleEl = card.querySelector('[data-slot="title"]');
      const descriptionEl = card.querySelector('[data-slot="description"]');
      const labelsEl = card.querySelector('[data-slot="labels"]');
      const ctaEl = card.querySelector('[data-slot="cta"]');

      if (titleEl) {
        titleEl.textContent = game.title || "名称未設定のゲーム";
      }

      if (descriptionEl) {
        descriptionEl.textContent = game.description || "詳細は近日公開予定です。";
      }

      if (labelsEl) {
        labelsEl.innerHTML = "";
        const tags = [game.genre, game.duration, game.platform].filter(Boolean);

        if (tags.length === 0) {
          labelsEl.hidden = true;
        } else {
          labelsEl.hidden = false;
          tags.forEach((value) => {
            const tagEl = document.createElement("span");
            tagEl.className = "game-card__tag";
            tagEl.textContent = value;
            labelsEl.appendChild(tagEl);
          });
        }
      }

      if (ctaEl) {
        const label = game.ctaLabel || "プレイ";
        ctaEl.textContent = label;
        ctaEl.setAttribute("aria-label", `${game.title || label}を開く`);

        if (game.url) {
          ctaEl.href = game.url;
        } else {
          ctaEl.href = "#";
          ctaEl.setAttribute("aria-disabled", "true");
          ctaEl.classList.add("is-disabled");
        }
      }

      card.dataset.gameId = game.id || "";
      fragment.appendChild(card);
    });

    catalog.appendChild(fragment);
  }

  function handleSearch() {
    const searchTerm = searchInput.value.toLowerCase();
    const filteredGames = games.filter(game => 
      (game.title || '').toLowerCase().includes(searchTerm)
    );
    renderGames(filteredGames);
  }

  if (searchInput) {
    searchInput.addEventListener("input", handleSearch);
  }

  renderGames(games);
})();
