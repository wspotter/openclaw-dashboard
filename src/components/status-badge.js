export function createStatusBadge(status = 'unknown') {
  const badge = document.createElement('span');
  badge.className = `status-badge status-${status}`;
  badge.textContent = status;
  return badge;
}
