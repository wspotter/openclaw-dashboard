export function createCategoryGroup(category, tiles, renderTile, collapsedByDefault = true) {
  const section = document.createElement('section');
  section.className = 'category-group';

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'category-header';
  header.setAttribute('aria-expanded', String(!collapsedByDefault));

  const title = document.createElement('span');
  title.className = 'category-title';
  title.textContent = `${category}`;

  const count = document.createElement('span');
  count.className = 'category-count';
  count.textContent = `${tiles.length} tiles`;

  header.append(title, count);

  const content = document.createElement('div');
  content.className = 'category-content dashboard-grid';
  if (collapsedByDefault) {
    content.classList.add('is-collapsed');
  }

  tiles.forEach((tile) => {
    content.append(renderTile(tile));
  });

  header.addEventListener('click', () => {
    const collapsed = content.classList.toggle('is-collapsed');
    header.setAttribute('aria-expanded', String(!collapsed));
  });

  section.append(header, content);
  return section;
}
