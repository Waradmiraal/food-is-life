import { useCallback, useEffect, useRef, useState } from 'react';
import type { Ingredient, MealHistory, PlannedDay, Preferences, Recipe, StockItem } from '../types';
import { INGREDIENTS } from '../data/ingredients';
import { RECIPES } from '../data/recipes';
import { cookOnServer, getState, hasLegacyData, importLegacyData, putDocument, type Versioned } from './centralApi';
import { normalizeStock } from './stock';

function localDateStr(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
function getMonday(date: Date): Date {
  const monday = new Date(date);
  monday.setDate(monday.getDate() + (monday.getDay() === 0 ? -6 : 1 - monday.getDay()));
  monday.setHours(0, 0, 0, 0);
  return monday;
}
function buildWeek(monday: Date): PlannedDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return { date: localDateStr(date), recipeId: null, lunch: index < 5 ? 'boterham' : null };
  });
}

export function useAppState() {
  const [recipes, setRecipes] = useState<Recipe[]>(RECIPES);
  const [ingredients, setIngredients] = useState<Ingredient[]>(INGREDIENTS);
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [week, setWeek] = useState<PlannedDay[]>(() => buildWeek(getMonday(new Date())));
  const [history, setHistory] = useState<MealHistory[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({ excludedRecipes: [] });
  const [stock, setStock] = useState<StockItem[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverImported, setServerImported] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const versions = useRef<Record<string, number>>({});

  const loadState = useCallback(async (monday: Date) => {
    const mondayKey = localDateStr(monday);
    try {
      const response = await getState(mondayKey);
      const document = <T,>(key: string) => response.documents[key] as Versioned<T>;
      setRecipes(document<Recipe[]>('recipes').value);
      setIngredients(document<Ingredient[]>('ingredients').value);
      const savedStock = normalizeStock(document<unknown>('stock').value);
      setStock(savedStock);
      setHistory(document<MealHistory[]>('history').value);
      setPreferences(document<Preferences>('preferences').value);
      setWeek(document<PlannedDay[]>(`week/${mondayKey}`).value);
      for (const [key, value] of Object.entries(response.documents)) versions.current[key] = value.version;
      setServerImported(response.localStorageImported);
      setError(null);
      setLastSyncedAt(new Date());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Geen verbinding met de centrale opslag.');
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { void loadState(weekStart); }, [loadState, weekStart]);
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadState(weekStart);
    };
    const interval = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [loadState, weekStart]);

  async function persist<T>(key: string, value: T) {
    const version = versions.current[key];
    if (!version) return setError('De centrale opslag is nog niet geladen.');
    try {
      const updated = await putDocument(key, value, version);
      versions.current[key] = updated.version;
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Opslaan is mislukt.');
      await loadState(weekStart);
    }
  }

  function navigateWeek(delta: number) {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + delta * 7);
    setWeekStart(next);
  }
  function assignMeal(date: string, recipeId: string | null, note?: string) {
    setWeek((current) => {
      const next = current.map((day) => day.date === date ? { ...day, recipeId, note } : day);
      void persist(`week/${localDateStr(weekStart)}`, next);
      return next;
    });
  }
  function setLunch(date: string, lunch: 'boterham' | 'skip' | null) {
    setWeek((current) => {
      const next = current.map((day) => day.date === date ? { ...day, lunch } : day);
      void persist(`week/${localDateStr(weekStart)}`, next);
      return next;
    });
  }
  function recipesChange(change: (current: Recipe[]) => Recipe[]) {
    setRecipes((current) => { const next = change(current); void persist('recipes', next); return next; });
  }
  function ingredientsChange(change: (current: Ingredient[]) => Ingredient[]) {
    setIngredients((current) => { const next = change(current); void persist('ingredients', next); return next; });
  }
  function stockChange(change: (current: StockItem[]) => StockItem[]) {
    setStock((current) => { const next = change(current); void persist('stock', next); return next; });
  }

  function toggleFavorite(recipeId: string) { recipesChange((current) => current.map((recipe) => recipe.id === recipeId ? { ...recipe, favorite: !recipe.favorite } : recipe)); }
  function addRecipe(recipe: Recipe) { recipesChange((current) => [...current, recipe]); }
  function updateRecipe(recipe: Recipe) { recipesChange((current) => current.map((item) => item.id === recipe.id ? recipe : item)); }
  function deleteRecipe(id: string) { recipesChange((current) => current.filter((recipe) => recipe.id !== id)); }
  function updateIngredient(ingredient: Ingredient) { ingredientsChange((current) => current.map((item) => item.id === ingredient.id ? ingredient : item)); }
  function addIngredient(ingredient: Ingredient) { ingredientsChange((current) => [...current, ingredient]); }
  function toggleExcluded(recipeId: string) {
    setPreferences((current) => {
      const ids = new Set(current.excludedRecipes);
      ids.has(recipeId) ? ids.delete(recipeId) : ids.add(recipeId);
      const next = { ...current, excludedRecipes: [...ids] };
      void persist('preferences', next);
      return next;
    });
  }
  function addStock(ingredientId: string, location: StockItem['location'] = 'voorraadkast') {
    stockChange((current) => {
      return current.some((item) => item.ingredientId === ingredientId && item.location === location)
        ? current
        : [...current, { ingredientId, quantity: 1, unit: 'stuks', location }];
    });
  }
  function updateStock(item: StockItem) {
    stockChange((current) => {
      const next = current.filter((existing) => !(existing.ingredientId === item.ingredientId && existing.location === item.location));
      return item.quantity > 0 ? [...next, item] : next;
    });
  }
  function removeStock(item: StockItem) {
    stockChange((current) => current.filter((existing) => !(existing.ingredientId === item.ingredientId && existing.location === item.location)));
  }
  function addToStock(ingredientIds: string[]) {
    stockChange((current) => {
      const currentIds = new Set(current.map((item) => `${item.ingredientId}:${item.location}`));
      return [...current, ...ingredientIds.filter((id) => !currentIds.has(`${id}:voorraadkast`)).map((ingredientId) => ({ ingredientId, quantity: 1, unit: 'stuks', location: 'voorraadkast' as const }))];
    });
  }
  function uncookMeal(date: string, recipeId: string) {
    setHistory((current) => {
      const next = current.filter((entry) => !(entry.date === date && entry.recipeId === recipeId));
      void persist('history', next);
      return next;
    });
  }
  function cookMeal(date: string, recipeId: string, depleted: { ingredientId: string; location: StockItem['location'] }[], consumptions: { ingredientId: string; location: StockItem['location']; quantity: number; unit: string }[]) {
    const consumed = new Map<string, number>();
    for (const consumption of consumptions) consumed.set(`${consumption.ingredientId}:${consumption.location}`, (consumed.get(`${consumption.ingredientId}:${consumption.location}`) ?? 0) + consumption.quantity);
    const depletedKeys = new Set(depleted.map((item) => `${item.ingredientId}:${item.location}`));
    const nextStock = stock.filter((item) => !depletedKeys.has(`${item.ingredientId}:${item.location}`)).map((item) => {
      const quantity = consumed.get(`${item.ingredientId}:${item.location}`);
      return quantity !== undefined ? { ...item, quantity: Math.max(0, item.quantity - quantity) } : item;
    });
    const nextHistory = [...history, { date, recipeId }];
    setStock(nextStock);
    setHistory(nextHistory);
    void (async () => {
      try {
        const result = await cookOnServer({ date, recipeId, depleted, consumptions, stockVersion: versions.current.stock, historyVersion: versions.current.history });
        versions.current.stock = result.stock.version;
        versions.current.history = result.history.version;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Kookactie is mislukt.');
        await loadState(weekStart);
      }
    })();
  }
  async function importOldBrowserData() { await importLegacyData(); await loadState(weekStart); }
  function goToCurrentWeek() { setWeekStart(getMonday(new Date())); }

  return {
    recipes, ingredients, week, weekStart, history, preferences, stock, ready, error, serverImported, lastSyncedAt,
    hasLegacyData: hasLegacyData(), navigateWeek, assignMeal, toggleFavorite, addRecipe, updateRecipe, deleteRecipe,
    updateIngredient, addIngredient, goToCurrentWeek, toggleExcluded, addStock, updateStock, removeStock, addToStock, cookMeal, uncookMeal,
    setLunch, importOldBrowserData, refresh: () => loadState(weekStart),
  };
}

