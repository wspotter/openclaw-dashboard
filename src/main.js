import './styles/base.css';
import './styles/grid.css';
import './styles/tiles.css';
import './styles/panels.css';

import { createCategoryGroup } from './components/category-group.js';
import { DetailPanel } from './components/detail-panel.js';
import { createTileElement } from './components/tile.js';
import { computeLayout } from './core/layout-engine.js';
import { TileManager } from './core/tile-manager.js';

const app = document.querySelector('#app');

app.innerHTML = `
  <div class="dashboard-shell">
    <header class="top-bar">
      <div class="title-wrap">
        <p class="eyebrow">OpenClaw Integrations</p>
        <h1>OpenClaw Dashboard</h1>
      </div>
      <div class="toolbar">
        <label class="search-wrap" id="search-wrap" for="tile-search">
          <span>Search</span>
          <input id="tile-search" class="search-input" type="search" placeholder="Filter by tile, category, or id" autocomplete="off" />
        </label>
        <button type="button" class="toolbar-button" id="refresh-button">Refresh</button>
      </div>
    </header>

    <section class="meta-strip" id="meta-strip">
      <p id="density-label">Density: loading…</p>
      <p id="tile-count-label">Tiles: 0</p>
    </section>

    <main id="dashboard-content" class="dashboard-content"></main>

    <div class="toast" id="toast" role="status" aria-live="polite"></div>
  </div>
`;

const elements = {
  content: document.querySelector('#dashboard-content'),
  searchWrap: document.querySelector('#search-wrap'),
  searchInput: document.querySelector('#tile-search'),
  refreshButton: document.querySelector('#refresh-button'),
  densityLabel: document.querySelector('#density-label'),
  tileCountLabel: document.querySelector('#tile-count-label'),
  toast: document.querySelector('#toast'),
};

const manager = new TileManager();
const detailPanel = new DetailPanel(document.body, handleAction);

const uiState = {
  searchTerm: '',
  tiles: [],
  lastFocusedTileIndex: 0,
  toastTimer: null,
};

function showToast(message) {
  if (!message) {
    return;
  }

  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');

  if (uiState.toastTimer) {
    clearTimeout(uiState.toastTimer);
  }

  uiState.toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove('is-visible');
  }, 2200);
}

function openDetail(tileId) {
  const tile = uiState.tiles.find((entry) => entry.id === tileId);
  if (!tile) {
    return;
  }

  detailPanel.open(tile);
}

function handleAction(tileId, action) {
  const tile = uiState.tiles.find((entry) => entry.id === tileId);
  if (!tile || !action) {
    return;
  }

  if (action.type === 'link' && action.url) {
    window.open(action.url, '_blank', 'noopener,noreferrer');
    showToast(`Opened ${action.label}`);
    return;
  }

  if (action.type === 'prompt_input') {
    const input = window.prompt(action.label, '');
    if (input === null) {
      return;
    }
    const prepared = (action.command ?? '').replace('{input}', input);
    showToast(prepared ? `Prepared command: ${prepared}` : `${action.label} captured`);
    return;
  }

  if (action.command) {
    showToast(`Prepared command: ${action.command}`);
    return;
  }

  showToast(`${action.label} triggered`);
}

function createGrid(tiles, density) {
  const grid = document.createElement('div');
  grid.className = 'dashboard-grid';

  for (const tile of tiles) {
    grid.append(createTileElement(tile, density, handleAction, openDetail));
  }

  return grid;
}

function renderLayout() {
  const layout = computeLayout(uiState.tiles, uiState.searchTerm);
  elements.content.innerHTML = '';

  elements.content.dataset.density = layout.density;
  elements.content.classList.toggle('grouped-layout', layout.grouped);

  elements.densityLabel.textContent = `Density: ${layout.density}${layout.grouped ? ' grouped' : ''}`;
  elements.tileCountLabel.textContent = `Tiles: ${layout.totalVisible}`;

  const shouldShowSearch = uiState.tiles.length >= 10;
  elements.searchWrap.classList.toggle('is-hidden', !shouldShowSearch);

  if (!layout.filteredTiles.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <h2>No tiles found</h2>
      <p>Try changing your search query or add templates under <code>templates/</code>.</p>
    `;
    elements.content.append(empty);
    return;
  }

  if (layout.grouped) {
    for (const group of layout.groups) {
      const section = createCategoryGroup(
        group.category,
        group.tiles,
        (tile) => createTileElement(tile, layout.density, handleAction, openDetail),
        true,
      );
      elements.content.append(section);
    }
  } else {
    elements.content.append(createGrid(layout.filteredTiles, layout.density));
  }

  const openTileId = detailPanel.currentTileId;
  if (openTileId) {
    const tile = uiState.tiles.find((entry) => entry.id === openTileId);
    if (tile) {
      detailPanel.refresh(tile);
    }
  }
}

function getFocusableTiles() {
  return Array.from(document.querySelectorAll('.tile'));
}

function handleKeyboardNavigation(event) {
  const allowedKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter']);
  if (!allowedKeys.has(event.key)) {
    return;
  }

  const tagName = event.target?.tagName ?? '';
  if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
    if (event.key !== 'Enter') {
      return;
    }
  }

  const tiles = getFocusableTiles();
  if (!tiles.length) {
    return;
  }

  let activeIndex = tiles.findIndex((tile) => tile === document.activeElement);
  if (activeIndex < 0) {
    activeIndex = Math.min(uiState.lastFocusedTileIndex, tiles.length - 1);
  }

  if (event.key === 'Enter') {
    const active = tiles[activeIndex] ?? tiles[0];
    const tileId = active?.dataset.tileId;
    if (tileId) {
      openDetail(tileId);
      event.preventDefault();
    }
    return;
  }

  const activeTile = tiles[activeIndex] ?? tiles[0];
  const parent = activeTile.parentElement;
  const columnTemplate = getComputedStyle(parent).gridTemplateColumns;
  const columns = columnTemplate ? columnTemplate.split(' ').filter(Boolean).length : 1;

  let nextIndex = activeIndex;
  if (event.key === 'ArrowRight') {
    nextIndex = Math.min(activeIndex + 1, tiles.length - 1);
  }
  if (event.key === 'ArrowLeft') {
    nextIndex = Math.max(activeIndex - 1, 0);
  }
  if (event.key === 'ArrowDown') {
    nextIndex = Math.min(activeIndex + columns, tiles.length - 1);
  }
  if (event.key === 'ArrowUp') {
    nextIndex = Math.max(activeIndex - columns, 0);
  }

  uiState.lastFocusedTileIndex = nextIndex;
  tiles[nextIndex].focus();
  event.preventDefault();
}

elements.searchInput.addEventListener('input', (event) => {
  uiState.searchTerm = event.target.value;
  renderLayout();
});

elements.refreshButton.addEventListener('click', async () => {
  await manager.reloadDefinitions('manual-refresh');
  await manager.refreshAll();
  showToast('Dashboard refreshed');
});

document.addEventListener('keydown', handleKeyboardNavigation);

manager.addEventListener('tiles-updated', (event) => {
  uiState.tiles = event.detail.tiles;
  renderLayout();
});

async function initialize() {
  try {
    await manager.initialize();
  } catch (error) {
    console.error(error);
    showToast('Failed to initialize dashboard');
  }
}

initialize();
