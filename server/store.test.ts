import assert from 'node:assert/strict';
import test from 'node:test';
import { HouseholdStore, VersionConflictError } from './store.js';

test('maakt migratie en seed-documenten aan', () => {
  const store = new HouseholdStore();
  const recipes = store.get<unknown[]>('recipes');
  assert.ok(recipes.value.length > 0);
  assert.equal(recipes.version, 1);
  store.close();
});

test('weigert een verouderde documentversie', () => {
  const store = new HouseholdStore();
  const stock = store.get<unknown[]>('stock');
  store.put('stock', [{ ingredientId: 'ui', quantity: 2, unit: 'stuks' }], stock.version);
  assert.throws(() => store.put('stock', [{ ingredientId: 'knoflook', quantity: 1, unit: 'stuks' }], stock.version), VersionConflictError);
  store.close();
});

test('importeert legacygegevens maar één keer en maakt een compatibele back-up', () => {
  const store = new HouseholdStore();
  store.importLegacy({
    recipes: [],
    ingredients: [],
    stock: ['ui'],
    history: [{ date: '2026-09-21', recipeId: 'test' }],
    preferences: { excludedRecipes: ['test'] },
    'week-2026-09-21': [],
  });
  assert.deepEqual(store.get<unknown[]>('stock').value, [{ ingredientId: 'ui', quantity: 1, unit: 'stuks' }]);
  assert.throws(() => store.importLegacy({ stock: [] }), /al uitgevoerd/);
  const backup = store.backup();
  assert.deepEqual(backup.stock, [{ ingredientId: 'ui', quantity: 1, unit: 'stuks' }]);
  assert.deepEqual(backup['week-2026-09-21'], []);
  store.close();
});

test('herstelt een back-up zonder de eenmalige-importstatus te wijzigen', () => {
  const store = new HouseholdStore();
  const stock = store.get<unknown[]>('stock');
  store.put('stock', ['oude'], stock.version);
  store.restore({ stock: ['nieuwe'] });
  assert.deepEqual(store.get<unknown[]>('stock').value, [{ ingredientId: 'nieuwe', quantity: 1, unit: 'stuks' }]);
  store.close();
});

test('schrijft voorraad en geschiedenis atomair bij een kookactie', () => {
  const store = new HouseholdStore();
  const stock = store.get<unknown[]>('stock');
  const history = store.get<unknown[]>('history');
  store.put('stock', [
    { ingredientId: 'ui', quantity: 2, unit: 'stuks' },
    { ingredientId: 'tomaat', quantity: 4, unit: 'stuks' },
  ], stock.version);
  const result = store.cook({
    date: '2026-09-21',
    recipeId: 'test',
    ingredientIds: ['ui'],
    stockVersion: 2,
    historyVersion: history.version,
  });
  assert.deepEqual(result.stock.value, [{ ingredientId: 'tomaat', quantity: 4, unit: 'stuks' }]);
  assert.deepEqual(result.history.value, [{ date: '2026-09-21', recipeId: 'test' }]);
  store.close();
});

