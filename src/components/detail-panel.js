function formatValue(value) {
  if (value === null || value === undefined || value === '') {
    return '--';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

export class DetailPanel {
  constructor(container, onAction) {
    this.container = container;
    this.onAction = onAction;
    this.currentTileId = null;

    this.panel = document.createElement('aside');
    this.panel.className = 'detail-panel';
    this.panel.setAttribute('aria-hidden', 'true');

    this.backdrop = document.createElement('div');
    this.backdrop.className = 'panel-backdrop';

    this.header = document.createElement('header');
    this.header.className = 'detail-header';

    this.title = document.createElement('h2');
    this.title.className = 'detail-title';

    this.subtitle = document.createElement('p');
    this.subtitle.className = 'detail-subtitle';

    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'panel-close';
    this.closeButton.textContent = 'Close';
    this.closeButton.addEventListener('click', () => this.close());

    this.header.append(this.title, this.subtitle, this.closeButton);

    this.content = document.createElement('div');
    this.content.className = 'detail-content';

    this.panel.append(this.header, this.content);
    this.container.append(this.backdrop, this.panel);

    this.backdrop.addEventListener('click', () => this.close());

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.close();
      }
    });
  }

  renderMetrics(tile) {
    const section = document.createElement('section');
    section.className = 'detail-section';

    const heading = document.createElement('h3');
    heading.textContent = 'Metrics';

    const list = document.createElement('dl');
    list.className = 'detail-metrics';

    for (const metric of tile.metrics) {
      const label = document.createElement('dt');
      label.textContent = metric.label;

      const value = document.createElement('dd');
      value.textContent = formatValue(tile.state.metrics[metric.id]);

      list.append(label, value);
    }

    section.append(heading, list);
    return section;
  }

  renderActions(tile) {
    const section = document.createElement('section');
    section.className = 'detail-section';

    const heading = document.createElement('h3');
    heading.textContent = 'Actions';

    const row = document.createElement('div');
    row.className = 'detail-actions';

    for (const action of tile.actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'detail-action';
      button.textContent = action.label;
      button.addEventListener('click', () => this.onAction(tile.id, action));
      row.append(button);
    }

    if (!tile.actions.length) {
      const empty = document.createElement('p');
      empty.className = 'detail-empty';
      empty.textContent = 'No actions defined for this tile.';
      section.append(heading, empty);
      return section;
    }

    section.append(heading, row);
    return section;
  }

  renderHealth(tile) {
    const section = document.createElement('section');
    section.className = 'detail-section';

    const heading = document.createElement('h3');
    heading.textContent = 'Health';

    const summary = document.createElement('p');
    summary.className = `detail-health status-${tile.state.status}`;
    summary.textContent = `Status: ${tile.state.status} · Latency: ${tile.state.latency_ms ?? '--'}ms`;

    section.append(heading, summary);

    if (tile.state.errors?.length) {
      const list = document.createElement('ul');
      list.className = 'detail-errors';

      tile.state.errors.forEach((error) => {
        const item = document.createElement('li');
        item.textContent = error;
        list.append(item);
      });

      section.append(list);
    }

    return section;
  }

  open(tile) {
    this.currentTileId = tile.id;
    this.title.textContent = `${tile.icon} ${tile.name}`;
    this.subtitle.textContent = `${tile.description} (${tile.template_id})`;

    this.content.innerHTML = '';
    this.content.append(this.renderHealth(tile), this.renderMetrics(tile), this.renderActions(tile));

    this.panel.classList.add('is-open');
    this.backdrop.classList.add('is-open');
    this.panel.setAttribute('aria-hidden', 'false');
  }

  close() {
    this.currentTileId = null;
    this.panel.classList.remove('is-open');
    this.backdrop.classList.remove('is-open');
    this.panel.setAttribute('aria-hidden', 'true');
  }

  refresh(tile) {
    if (this.currentTileId && tile.id === this.currentTileId) {
      this.open(tile);
    }
  }
}
