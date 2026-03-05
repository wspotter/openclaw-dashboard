import { renderCompactTileBody } from './tile-compact.js';
import { renderLargeTileBody } from './tile-large.js';
import { renderMediumTileBody } from './tile-medium.js';
import { createStatusBadge } from './status-badge.js';

function createActionElement(action, onAction, tileId) {
  const actionButton = document.createElement('button');
  actionButton.type = 'button';
  actionButton.className = 'tile-action';
  actionButton.textContent = action.label;
  actionButton.addEventListener('click', (event) => {
    event.stopPropagation();
    onAction(tileId, action);
  });

  return actionButton;
}

function createTileBody(tile, density) {
  if (density === 'large') {
    return renderLargeTileBody(tile);
  }

  if (density === 'medium') {
    return renderMediumTileBody(tile);
  }

  return renderCompactTileBody(tile);
}

function createTileFooter(tile, density, onAction) {
  const footer = document.createElement('footer');
  footer.className = 'tile-footer';

  const updated = document.createElement('span');
  updated.className = 'tile-updated';
  updated.textContent = tile.state.last_checked_at
    ? `Checked ${new Date(tile.state.last_checked_at).toLocaleTimeString()}`
    : 'Awaiting first poll';

  footer.append(updated);

  const maxActions = density === 'large' ? 2 : density === 'medium' ? 1 : 0;
  if (maxActions > 0 && tile.actions.length) {
    const actions = document.createElement('div');
    actions.className = 'tile-actions';

    tile.actions.slice(0, maxActions).forEach((action) => {
      actions.append(createActionElement(action, onAction, tile.id));
    });

    footer.append(actions);
  }

  return footer;
}

export function createTileElement(tile, density, onAction, onOpenDetail) {
  const tileElement = document.createElement('article');
  tileElement.className = `tile tile-${density} status-${tile.state.status}`;
  tileElement.dataset.tileId = tile.id;
  tileElement.dataset.category = tile.category;
  tileElement.tabIndex = 0;

  const header = document.createElement('header');
  header.className = 'tile-header';

  const heading = document.createElement('div');
  heading.className = 'tile-heading';

  const icon = document.createElement('span');
  icon.className = 'tile-icon';
  icon.textContent = tile.icon;

  const titleWrap = document.createElement('div');

  const title = document.createElement('h3');
  title.className = 'tile-title';
  title.textContent = tile.name;

  const meta = document.createElement('p');
  meta.className = 'tile-meta';
  meta.textContent = `${tile.category} · ${tile.source}`;

  titleWrap.append(title, meta);
  heading.append(icon, titleWrap);

  const status = createStatusBadge(tile.state.status);

  header.append(heading, status);

  const body = createTileBody(tile, density);
  const footer = createTileFooter(tile, density, onAction);

  tileElement.append(header, body, footer);

  tileElement.addEventListener('click', () => onOpenDetail(tile.id));

  tileElement.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onOpenDetail(tile.id);
    }
  });

  return tileElement;
}
