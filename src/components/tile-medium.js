function formatValue(value) {
  if (value === null || value === undefined || value === '') {
    return '--';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

export function renderMediumTileBody(tile) {
  const body = document.createElement('div');
  body.className = 'tile-body tile-body-medium';

  const metrics = tile.metrics.slice(0, 3);
  for (const metric of metrics) {
    const row = document.createElement('div');
    row.className = 'metric-row';

    const label = document.createElement('span');
    label.className = 'metric-label';
    label.textContent = metric.label;

    const value = document.createElement('span');
    value.className = 'metric-value';
    value.textContent = formatValue(tile.state.metrics[metric.id]);

    row.append(label, value);
    body.append(row);
  }

  return body;
}
