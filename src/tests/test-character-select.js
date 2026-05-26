import test from 'node:test';
import assert from 'node:assert';
import {
  createCharacterSelectState,
  openCharacterSelect,
  closeCharacterSelect,
  isCharacterSelectOpen,
  characterSelectId,
  characterSelectKey,
  consumeCharacterSelectAction,
} from '../render/character-select-screen.js';

test('charSelect: fresh state is closed with cursor at bear', () => {
  const s = createCharacterSelectState();
  assert.equal(s.open, false);
  assert.equal(characterSelectId(s), 'bear');
});

test('charSelect: open / close cycle', () => {
  const s = createCharacterSelectState();
  openCharacterSelect(s, 'wolf', 'preplay');
  assert.equal(isCharacterSelectOpen(s), true);
  assert.equal(characterSelectId(s), 'wolf');
  assert.equal(s.purpose, 'preplay');
  closeCharacterSelect(s);
  assert.equal(isCharacterSelectOpen(s), false);
});

test('charSelect: arrow keys move the cursor through the grid', () => {
  const s = createCharacterSelectState();
  openCharacterSelect(s, 'bear');
  characterSelectKey(s, 'ArrowRight');
  assert.equal(characterSelectId(s), 'wolf');
  characterSelectKey(s, 'ArrowRight');
  assert.equal(characterSelectId(s), 'monkey');
  characterSelectKey(s, 'ArrowLeft');
  characterSelectKey(s, 'ArrowLeft');
  assert.equal(characterSelectId(s), 'bear');
});

test('charSelect: ArrowDown wraps by row width 5', () => {
  const s = createCharacterSelectState();
  openCharacterSelect(s, 'bear');
  // CHARACTERS order: bear, wolf, monkey, lion, pig, mole, rabbit, elephant, owl, fox.
  // bear is index 0; +5 = mole (index 5).
  characterSelectKey(s, 'ArrowDown');
  assert.equal(characterSelectId(s), 'mole');
});

test('charSelect: Enter triggers play action; Escape closes', () => {
  const s = createCharacterSelectState();
  openCharacterSelect(s, 'lion', 'preplay');
  characterSelectKey(s, 'Enter');
  assert.equal(consumeCharacterSelectAction(s), 'play');
  // Already consumed; second call returns null.
  assert.equal(consumeCharacterSelectAction(s), null);
  characterSelectKey(s, 'Escape');
  assert.equal(consumeCharacterSelectAction(s), 'close');
});

test('charSelect: S triggers skillTree action; I triggers itemShop', () => {
  const s = createCharacterSelectState();
  openCharacterSelect(s, 'bear');
  characterSelectKey(s, 'S');
  assert.equal(consumeCharacterSelectAction(s), 'skillTree');
  characterSelectKey(s, 'I');
  assert.equal(consumeCharacterSelectAction(s), 'itemShop');
});

test('charSelect: callback fires on character change', () => {
  const s = createCharacterSelectState();
  openCharacterSelect(s, 'bear');
  let calls = 0;
  let lastId = null;
  characterSelectKey(s, 'ArrowRight', (id) => { calls += 1; lastId = id; });
  assert.equal(calls, 1);
  assert.equal(lastId, 'wolf');
});
