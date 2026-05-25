import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGrid,
  cellAt,
  inBounds,
  setObject,
  clearObject,
  findRockCells,
  chebyshevRing,
} from '../engine/grid.js';

const byColRow = (a, b) => (a.row - b.row) || (a.col - b.col);

test('createGrid produces row-major grid with distinct empty cells', () => {
  const grid = createGrid({ cols: 13, rows: 11 });
  assert.equal(grid.length, 11);
  assert.equal(grid[0].length, 13);
  assert.deepEqual(grid[5][7], { object: null, hazard: null, windup: null });
  assert.notEqual(grid[0][0], grid[0][1]);
  grid[0][0].object = { type: 'rock', id: 1 };
  assert.equal(grid[0][1].object, null);
});

test('inBounds rejects negatives and over-bounds', () => {
  const grid = createGrid({ cols: 13, rows: 11 });
  assert.equal(inBounds(grid, 0, 0), true);
  assert.equal(inBounds(grid, 12, 10), true);
  assert.equal(inBounds(grid, 13, 0), false);
  assert.equal(inBounds(grid, -1, 5), false);
  assert.equal(inBounds(grid, 0, 11), false);
  assert.equal(inBounds(grid, 0, -1), false);
});

test('cellAt returns the cell or null when out of bounds', () => {
  const grid = createGrid({ cols: 13, rows: 11 });
  const cell = cellAt(grid, 5, 5);
  assert.equal(cell, grid[5][5]);
  assert.equal(cellAt(grid, 99, 99), null);
  assert.equal(cellAt(grid, -1, 0), null);
});

test('setObject and clearObject mutate cell.object in place', () => {
  const grid = createGrid({ cols: 13, rows: 11 });
  setObject(grid, 3, 4, { type: 'rock', id: 1 });
  const cell = cellAt(grid, 3, 4);
  assert.equal(cell.object.type, 'rock');
  assert.equal(cell.object.id, 1);
  assert.equal(cell.hazard, null);
  assert.equal(cell.windup, null);
  clearObject(grid, 3, 4);
  assert.equal(cellAt(grid, 3, 4).object, null);
  assert.throws(() => setObject(grid, 99, 99, { type: 'rock', id: 2 }), /out of bounds/);
  assert.throws(() => clearObject(grid, -1, 0), /out of bounds/);
});

test('findRockCells returns only rock cells in row-major order', () => {
  const grid = createGrid({ cols: 13, rows: 11 });
  setObject(grid, 1, 1, { type: 'rock', id: 1 });
  setObject(grid, 2, 1, { type: 'rock', id: 2 });
  setObject(grid, 3, 5, { type: 'rock', id: 3 });
  setObject(grid, 4, 4, { type: 'fireball', id: 4 });
  const rocks = findRockCells(grid);
  assert.deepEqual(rocks, [
    { col: 1, row: 1 },
    { col: 2, row: 1 },
    { col: 3, row: 5 },
  ]);
  assert.deepEqual(findRockCells(createGrid({ cols: 5, rows: 5 })), []);
});

test('chebyshevRing returns center for radius 0 and 8 perimeter cells for radius 1', () => {
  assert.deepEqual(chebyshevRing(6, 5, 0), [{ col: 6, row: 5 }]);
  const ring1 = chebyshevRing(6, 5, 1);
  const expected1 = [
    { col: 5, row: 4 }, { col: 6, row: 4 }, { col: 7, row: 4 },
    { col: 5, row: 5 }, { col: 7, row: 5 },
    { col: 5, row: 6 }, { col: 6, row: 6 }, { col: 7, row: 6 },
  ];
  assert.deepEqual([...ring1].sort(byColRow), [...expected1].sort(byColRow));
  assert.deepEqual(chebyshevRing(0, 0, -1), []);
  assert.equal(chebyshevRing(10, 10, 2).length, 16);
});
