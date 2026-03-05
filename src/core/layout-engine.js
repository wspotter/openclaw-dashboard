const LARGE_TILE_LIMIT = 4;
const MEDIUM_TILE_LIMIT = 9;
const GROUPING_LIMIT = 20;

function normalizeSearchTerm(searchTerm) {
  return (searchTerm ?? '').trim().toLowerCase();
}

export function getDensityMode(tileCount) {
  if (tileCount <= LARGE_TILE_LIMIT) {
    return 'large';
  }

  if (tileCount <= MEDIUM_TILE_LIMIT) {
    return 'medium';
  }

  return 'compact';
}

export function shouldGroupByCategory(tileCount) {
  return tileCount > GROUPING_LIMIT;
}

export function filterTiles(tiles, searchTerm) {
  const normalizedTerm = normalizeSearchTerm(searchTerm);
  if (!normalizedTerm) {
    return tiles;
  }

  return tiles.filter((tile) => {
    const haystack = `${tile.name} ${tile.category} ${tile.template_id}`.toLowerCase();
    return haystack.includes(normalizedTerm);
  });
}

export function groupTilesByCategory(tiles) {
  const groupedMap = new Map();

  for (const tile of tiles) {
    const category = tile.category || 'uncategorized';
    if (!groupedMap.has(category)) {
      groupedMap.set(category, []);
    }
    groupedMap.get(category).push(tile);
  }

  return Array.from(groupedMap.entries())
    .map(([category, categoryTiles]) => ({ category, tiles: categoryTiles }))
    .sort((left, right) => left.category.localeCompare(right.category));
}

export function computeLayout(tiles, searchTerm) {
  const filteredTiles = filterTiles(tiles, searchTerm);
  const density = getDensityMode(filteredTiles.length);
  const grouped = shouldGroupByCategory(filteredTiles.length);
  const groups = grouped ? groupTilesByCategory(filteredTiles) : [];

  return {
    density,
    grouped,
    groups,
    filteredTiles,
    totalVisible: filteredTiles.length,
  };
}
