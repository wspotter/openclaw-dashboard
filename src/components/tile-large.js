function formatValue(value) {
  if (value === null || value === undefined || value === '') {
    return '--';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

export function renderLargeTileBody(tile) {
  const body = document.createElement('div');
  body.className = 'tile-body tile-body-large';

  const metricsGrid = document.createElement('div');
  metricsGrid.className = 'metrics-grid metrics-grid-large';

  for (const metric of tile.metrics) {
    const metricCard = document.createElement('div');
    metricCard.className = 'metric-card';

    const label = document.createElement('p');
    label.className = 'metric-label';
    label.textContent = metric.label;

    const value = document.createElement('p');
    value.className = 'metric-value';
    value.textContent = formatValue(tile.state.metrics[metric.id]);

    metricCard.append(label, value);
    metricsGrid.append(metricCard);
  }

  body.append(metricsGrid);
  return body;
}
