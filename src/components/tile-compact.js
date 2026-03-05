function formatValue(value) {
  if (value === null || value === undefined || value === '') {
    return '--';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

function createSparkline(points = []) {
  const width = 120;
  const height = 28;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'sparkline');

  if (!points.length) {
    return svg;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const coordinates = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((point - min) / range) * (height - 2) - 1;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', coordinates);
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', 'currentColor');
  polyline.setAttribute('stroke-width', '2');

  svg.append(polyline);
  return svg;
}

export function renderCompactTileBody(tile) {
  const body = document.createElement('div');
  body.className = 'tile-body tile-body-compact';

  const firstMetric = tile.metrics[0];
  const metricSummary = document.createElement('p');
  metricSummary.className = 'compact-metric';
  metricSummary.textContent = firstMetric
    ? `${firstMetric.label}: ${formatValue(tile.state.metrics[firstMetric.id])}`
    : 'No metrics';

  const history = firstMetric ? tile.state.metric_history[firstMetric.id] || [] : [];
  const sparkline = createSparkline(history);

  body.append(metricSummary, sparkline);
  return body;
}
