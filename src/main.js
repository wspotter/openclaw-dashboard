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
        <p class="eyebrow">Ollie Integrations</p>
        <h1>Ollie Dashboard</h1>
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

    <section class="coach-strip" aria-label="Katherine beginner workflow">
      <p>
        <strong>Katherine mode:</strong>
        1) Click <strong>Refresh</strong>.
        2) Open <strong>Delivery Hub</strong> for package totals.
        3) Open <strong>Mailcow</strong> for urgent messages.
      </p>
      <div class="coach-actions">
        <a class="coach-link" href="https://mail.theprintery.biz/SOGo/so" target="_blank" rel="noopener noreferrer">Open Store Email</a>
        <a class="coach-link" href="/katherine-quickstart.html" target="_blank" rel="noopener noreferrer">Open Katherine Quickstart</a>
        <a class="coach-link" href="/integration-help.html" target="_blank" rel="noopener noreferrer">Open Integration Help</a>
      </div>
    </section>

    <section class="newbie-board" id="newbie-board" aria-label="Beginner dashboard board">
      <article class="nb-card">
        <h2>Start Here</h2>
        <p>Use this same order every morning.</p>
        <ul class="nb-checklist">
          <li><button type="button" class="nb-check" data-check-id="refresh">Refresh dashboard</button></li>
          <li><button type="button" class="nb-check" data-check-id="delivery">Review Delivery Hub totals</button></li>
          <li><button type="button" class="nb-check" data-check-id="email">Check urgent email</button></li>
          <li><button type="button" class="nb-check" data-check-id="brief">Run daily briefing</button></li>
        </ul>
      </article>

      <article class="nb-card">
        <h2>Live Snapshot</h2>
        <p>Plain-language system health and today numbers.</p>
        <div id="nb-live-grid" class="nb-live-grid"></div>
      </article>

      <article class="nb-card">
        <h2>Ask Ollie</h2>
        <p>Click to copy a ready-to-send message.</p>
        <div class="nb-prompts">
          <button type="button" class="nb-prompt" data-prompt="Give me today so far and yesterday final delivery summary.">Delivery Summary</button>
          <button type="button" class="nb-prompt" data-prompt="Summarize urgent unread emails and suggest replies.">Urgent Email Summary</button>
          <button type="button" class="nb-prompt" data-prompt="Show driver SMS reports that need review and what to fix.">Driver Text Review</button>
          <button type="button" class="nb-prompt" data-prompt="Give me a step-by-step next actions list for this shift.">What Should I Do Next</button>
          <button type="button" class="nb-prompt" data-prompt="Route this to ollie-local (LM Studio): Give me today so far and yesterday final delivery summary.">Ask Ollie Local (LM Studio)</button>
        </div>
      </article>

      <article class="nb-card nb-chat-card">
        <h2>Talk to Ollie</h2>
        <p>Type or dictate here, then send it to Ollie.</p>
        <label class="nb-chat-label" for="nb-chat-input">Message</label>
        <textarea id="nb-chat-input" class="nb-chat-input" rows="4" placeholder="Ask Ollie a question or dictate with the microphone."></textarea>
        <div class="nb-voice-row">
          <span class="nb-voice-status" id="nb-voice-status">idle</span>
          <button type="button" class="nb-voice-button" id="nb-voice-toggle">Start listening</button>
          <button type="button" class="nb-voice-button" id="nb-tts-toggle">Voice on</button>
        </div>
        <p id="nb-chat-result" class="nb-chat-result" aria-live="polite">Ready.</p>
        <div class="nb-chat-actions">
          <button type="button" class="nb-send-button" data-send-agent="ollie">Send to Ollie</button>
          <button type="button" class="nb-send-button secondary" data-send-agent="ollie-local">Send to Ollie Local</button>
        </div>
      </article>
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
  newbieBoard: document.querySelector('#newbie-board'),
  newbieLiveGrid: document.querySelector('#nb-live-grid'),
  chatInput: document.querySelector('#nb-chat-input'),
  voiceStatus: document.querySelector('#nb-voice-status'),
  voiceToggle: document.querySelector('#nb-voice-toggle'),
  ttsToggle: document.querySelector('#nb-tts-toggle'),
  chatResult: document.querySelector('#nb-chat-result'),
};

const manager = new TileManager();
const detailPanel = new DetailPanel(document.body, handleAction);
const CHECKLIST_STORAGE_KEY = 'openclaw-dashboard-newbie-checks';

const uiState = {
  searchTerm: '',
  tiles: [],
  lastFocusedTileIndex: 0,
  toastTimer: null,
  checklist: loadChecklistState(),
  lastReply: 'Ready.',
  ttsEnabled: true,
  voiceMode: 'idle',
  recognition: null,
  speechSupported: false,
};

function loadChecklistState() {
  try {
    const raw = window.localStorage.getItem(CHECKLIST_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function persistChecklistState() {
  try {
    window.localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(uiState.checklist));
  } catch (_error) {
    // ignore storage errors
  }
}

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

function speakText(text) {
  if (!uiState.ttsEnabled || !window.speechSynthesis || !text) {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.onstart = () => {
    uiState.voiceMode = 'speaking';
    renderVoiceState();
  };
  utterance.onend = () => {
    uiState.voiceMode = 'idle';
    renderVoiceState();
  };
  utterance.onerror = () => {
    uiState.voiceMode = 'idle';
    renderVoiceState();
  };
  window.speechSynthesis.speak(utterance);
}

function renderVoiceState() {
  if (elements.voiceStatus) {
    elements.voiceStatus.textContent = uiState.voiceMode;
    elements.voiceStatus.dataset.state = uiState.voiceMode;
  }
  if (elements.voiceToggle) {
    elements.voiceToggle.textContent = uiState.voiceMode === 'listening' ? 'Stop listening' : 'Start listening';
  }
  if (elements.ttsToggle) {
    elements.ttsToggle.textContent = uiState.ttsEnabled ? 'Voice on' : 'Voice off';
  }
}

function setChatResult(text) {
  if (!text) {
    return;
  }
  uiState.lastReply = text;
  if (elements.chatResult) {
    elements.chatResult.textContent = text;
  }
}

async function sendChatMessage(agentId) {
  const draft = elements.chatInput?.value?.trim();
  if (!draft) {
    showToast('Type or dictate a message first');
    return;
  }
  const prepared =
    agentId === 'ollie-local'
      ? `Route this to ollie-local (LM Studio): ${draft}`
      : draft;
  const copied = await copyCommand(prepared);
  const assistantReply =
    agentId === 'ollie-local'
      ? 'Prepared for Ollie Local. Paste or send it in your normal Ollie chat surface.'
      : 'Prepared for Ollie. Paste or send it in your normal Ollie chat surface.';
  setChatResult(assistantReply);
  speakText(assistantReply);
  if (elements.chatInput) {
    elements.chatInput.value = '';
  }
  showToast(copied ? `Copied for ${agentId}` : assistantReply);
}

function initializeSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    uiState.voiceMode = 'listening';
    renderVoiceState();
  };
  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim();
    if (!transcript || !elements.chatInput) {
      return;
    }
    elements.chatInput.value = transcript;
    showToast('Voice captured');
  };
  recognition.onend = () => {
    if (uiState.voiceMode === 'listening') {
      uiState.voiceMode = 'idle';
      renderVoiceState();
    }
  };
  recognition.onerror = () => {
    uiState.voiceMode = 'idle';
    renderVoiceState();
    setChatResult('Voice capture had a problem. You can keep typing here instead.');
  };
  uiState.recognition = recognition;
  uiState.speechSupported = true;
}

function openDetail(tileId) {
  const tile = uiState.tiles.find((entry) => entry.id === tileId);
  if (!tile) {
    return;
  }

  detailPanel.open(tile);
}

async function copyCommand(command) {
  if (!command) {
    return false;
  }
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(command);
      return true;
    }
  } catch (_error) {
    // fall through
  }
  return false;
}

async function handleAction(tileId, action) {
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
    if (!prepared) {
      showToast(`${action.label} captured`);
      return;
    }

    const copied = await copyCommand(prepared);
    showToast(copied ? `Copied command: ${prepared}` : `Prepared command: ${prepared}`);
    return;
  }

  if (action.command) {
    const copied = await copyCommand(action.command);
    showToast(copied ? `Copied command: ${action.command}` : `Prepared command: ${action.command}`);
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

  renderNewbieBoard();
}

function formatMetric(value, fallback = '--') {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  return String(value);
}

function getTileById(tileId) {
  return uiState.tiles.find((tile) => tile.id === tileId);
}

function buildSnapshotRows() {
  const delivery = getTileById('delivery-hub-main');
  const mailcow = getTileById('mailcow-main');
  const gateway = getTileById('openclaw-gateway');

  return [
    {
      label: 'Delivery',
      value: `Packages ${formatMetric(delivery?.state?.metrics?.packages_today, '0')} · Revenue ${formatMetric(delivery?.state?.metrics?.revenue_today, '$0')}`,
      tone: delivery?.state?.status || 'unknown',
    },
    {
      label: 'Top Driver',
      value: formatMetric(delivery?.state?.metrics?.top_driver, 'Not available'),
      tone: delivery?.state?.status || 'unknown',
    },
    {
      label: 'Email',
      value: `Unread ${formatMetric(mailcow?.state?.metrics?.unread_count, '0')} · Last mail ${formatMetric(mailcow?.state?.metrics?.last_received, 'unknown')}`,
      tone: mailcow?.state?.status || 'unknown',
    },
    {
      label: 'Gateway',
      value: `Status ${formatMetric(gateway?.state?.status, 'unknown')} · Sessions ${formatMetric(gateway?.state?.metrics?.active_sessions, '0')}`,
      tone: gateway?.state?.status || 'unknown',
    },
  ];
}

function renderNewbieBoard() {
  if (!elements.newbieBoard || !elements.newbieLiveGrid) {
    return;
  }

  const checks = elements.newbieBoard.querySelectorAll('.nb-check');
  checks.forEach((button) => {
    const key = button.dataset.checkId;
    const done = Boolean(key && uiState.checklist[key]);
    button.classList.toggle('is-done', done);
    button.setAttribute('aria-pressed', done ? 'true' : 'false');
  });

  const rows = buildSnapshotRows();
  elements.newbieLiveGrid.innerHTML = '';
  rows.forEach((row) => {
    const item = document.createElement('div');
    item.className = `nb-live-item status-${row.tone || 'unknown'}`;
    item.innerHTML = `
      <p class="nb-live-label">${row.label}</p>
      <p class="nb-live-value">${row.value}</p>
    `;
    elements.newbieLiveGrid.append(item);
  });
  renderVoiceState();
  setChatResult(uiState.lastReply);
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

elements.newbieBoard?.addEventListener('click', async (event) => {
  const checkButton = event.target.closest('.nb-check');
  if (checkButton) {
    const key = checkButton.dataset.checkId;
    if (key) {
      uiState.checklist[key] = !uiState.checklist[key];
      persistChecklistState();
      renderNewbieBoard();
      showToast(uiState.checklist[key] ? 'Marked done' : 'Marked not done');
    }
    return;
  }

  const promptButton = event.target.closest('.nb-prompt');
  if (promptButton) {
    const promptText = promptButton.dataset.prompt;
    if (!promptText) {
      return;
    }
    const copied = await copyCommand(promptText);
    showToast(copied ? 'Copied prompt for Ollie' : promptText);
    if (elements.chatInput) {
      elements.chatInput.value = promptText;
    }
    setChatResult('Prompt loaded into the message box below.');
    return;
  }

  const sendButton = event.target.closest('.nb-send-button');
  if (sendButton) {
    await sendChatMessage(sendButton.dataset.sendAgent);
    return;
  }
});

elements.voiceToggle?.addEventListener('click', () => {
  if (!uiState.speechSupported || !uiState.recognition) {
    setChatResult('Voice input is not available in this browser. You can still type here.');
    return;
  }
  if (uiState.voiceMode === 'listening') {
    uiState.recognition.stop();
    uiState.voiceMode = 'idle';
    renderVoiceState();
    return;
  }
  uiState.recognition.start();
});

elements.ttsToggle?.addEventListener('click', () => {
  uiState.ttsEnabled = !uiState.ttsEnabled;
  renderVoiceState();
  showToast(uiState.ttsEnabled ? 'Voice playback on' : 'Voice playback off');
});

manager.addEventListener('tiles-updated', (event) => {
  uiState.tiles = event.detail.tiles;
  renderLayout();
});

async function initialize() {
  try {
    initializeSpeechRecognition();
    await manager.initialize();
  } catch (error) {
    console.error(error);
    showToast('Failed to initialize dashboard');
  }
}

initialize();
