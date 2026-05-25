const ROCK_OBJECT_TYPE = 'rock';

export function createGrid({ cols, rows }) {
  const grid = new Array(rows);
  for (let r = 0; r < rows; r++) {
    const row = new Array(cols);
    for (let c = 0; c < cols; c++) {
      row[c] = createEmptyCell();
    }
    grid[r] = row;
  }
  return grid;
}

export function inBounds(grid, c, r) {
  if (!Number.isFinite(c) || !Number.isFinite(r)) return false;
  if (c < 0 || r < 0) return false;
  const rows = grid.length;
  if (r >= rows) return false;
  const cols = grid[0].length;
  if (c >= cols) return false;
  return true;
}

export function cellAt(grid, c, r) {
  if (!inBounds(grid, c, r)) return null;
  return grid[r][c];
}

export function setObject(grid, c, r, obj) {
  if (!inBounds(grid, c, r)) {
    throw new Error(`setObject out of bounds: (${c}, ${r})`);
  }
  grid[r][c].object = obj;
}

export function clearObject(grid, c, r) {
  if (!inBounds(grid, c, r)) {
    throw new Error(`clearObject out of bounds: (${c}, ${r})`);
  }
  grid[r][c].object = null;
}

export function findRockCells(grid) {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  const result = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const obj = grid[r][c].object;
      if (obj && obj.type === ROCK_OBJECT_TYPE) {
        result.push({ col: c, row: r });
      }
    }
  }
  return result;
}

export function chebyshevRing(c, r, radius) {
  if (radius < 0) return [];
  if (radius === 0) return [{ col: c, row: r }];
  const result = [];
  const minCol = c - radius;
  const maxCol = c + radius;
  const topRow = r - radius;
  const bottomRow = r + radius;
  for (let cc = minCol; cc <= maxCol; cc++) {
    result.push({ col: cc, row: topRow });
  }
  for (let cc = minCol; cc <= maxCol; cc++) {
    result.push({ col: cc, row: bottomRow });
  }
  for (let rr = topRow + 1; rr <= bottomRow - 1; rr++) {
    result.push({ col: minCol, row: rr });
    result.push({ col: maxCol, row: rr });
  }
  return result;
}

function createEmptyCell() {
  return {
    object: null,
    hazard: null,
    windup: null,
  };
}
