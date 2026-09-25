import { useMemo, useState } from 'react';
import type { Recipe, Ingredient, StockItem } from '../types';
import { quantityForStockUnit, STOCK_LOCATIONS } from '../lib/stock';

interface Props {
  recipe: Recipe;
  allIngredients: Ingredient[];
  stock: StockItem[];
  onCook: (depleted: { ingredientId: string; location: StockItem['location'] }[], consumptions: { ingredientId: string; location: StockItem['location']; quantity: number; unit: string }[]) => void;
  onClose: () => void;
}

export function CookedModal({ recipe, allIngredients, stock, onCook, onClose }: Props) {
  const [depleted, setDepleted] = useState<Set<string>>(new Set());
  const stockForIngredient = (ingredientId: string) => stock
    .filter((item) => item.ingredientId === ingredientId && item.quantity > 0)
    .sort((a, b) => ['koelkast', 'voorraadkast', 'vriezer'].indexOf(a.location) - ['koelkast', 'voorraadkast', 'vriezer'].indexOf(b.location));
  const automatic = useMemo(() => (recipe.recipeIngredients ?? []).flatMap((ingredient) => {
    if (!ingredient.ingredientId) return [];
    const item = stockForIngredient(ingredient.ingredientId)[0];
    if (!item) return [];
    const quantity = quantityForStockUnit(ingredient.amount, item.unit);
    return quantity === null ? [] : [{ ingredientId: item.ingredientId, location: item.location, quantity, unit: item.unit, name: ingredient.name, available: item.quantity }];
  }), [recipe.recipeIngredients, stock]);
  const automaticIds = new Set(automatic.map((item) => `${item.ingredientId}:${item.location}`));
  const manual = recipe.ingredients
    .flatMap((id) => stockForIngredient(id).map((item) => ({ ingredient: allIngredients.find((candidate) => candidate.id === id), stock: item })))
    .filter((entry): entry is { ingredient: Ingredient; stock: StockItem } => !!entry.ingredient && !automaticIds.has(`${entry.ingredient.id}:${entry.stock.location}`));
  const unlinked = (recipe.recipeIngredients ?? []).filter((item) => !item.ingredientId);

  function toggle(id: string) {
    setDepleted((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  function confirm() {
    onCook(manual.filter(({ ingredient, stock: item }) => depleted.has(`${ingredient.id}:${item.location}`)).map(({ ingredient, stock: item }) => ({ ingredientId: ingredient.id, location: item.location })), automatic.map(({ name: _name, available: _available, ...item }) => item));
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header"><h2>✓ {recipe.name} gekookt</h2><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body">
          {automatic.length > 0 && <>
            <p className="text-muted" style={{ marginBottom: '.65rem', fontSize: '.88rem' }}>Deze hoeveelheden worden direct van je voorraad afgetrokken.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem', marginBottom: '1rem' }}>
              {automatic.map((item) => <div key={`${item.ingredientId}:${item.location}`} style={{ display: 'flex', alignItems: 'center', gap: '.65rem', padding: '.5rem .6rem', borderRadius: 6, background: 'var(--accent-light)' }}>
                <span style={{ flex: 1, fontSize: '.9rem' }}>{item.name} <small className="text-muted">({STOCK_LOCATIONS.find((location) => location.id === item.location)?.label})</small></span><strong style={{ fontSize: '.85rem', color: 'var(--accent)' }}>−{item.quantity} {item.unit}</strong>{item.quantity > item.available && <span title="Er is minder aanwezig; de voorraad wordt nul." style={{ fontSize: '.8rem' }}>⚠</span>}
              </div>)}
            </div>
          </>}
          {manual.length > 0 && <>
            <p className="text-muted" style={{ marginBottom: '.6rem', fontSize: '.88rem' }}>Vink alleen een product aan als het helemaal op is.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem', marginBottom: '1rem' }}>
              {manual.map(({ ingredient, stock: item }) => <label key={`${ingredient.id}:${item.location}`} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.45rem .6rem', borderRadius: 6, cursor: 'pointer', background: depleted.has(`${ingredient.id}:${item.location}`) ? '#fee2e2' : 'var(--tag-bg)' }}>
                <input type="checkbox" checked={depleted.has(`${ingredient.id}:${item.location}`)} onChange={() => toggle(`${ingredient.id}:${item.location}`)} /><span style={{ flex: 1, fontSize: '.9rem', textDecoration: depleted.has(`${ingredient.id}:${item.location}`) ? 'line-through' : 'none' }}>{ingredient.name} <small className="text-muted">({STOCK_LOCATIONS.find((location) => location.id === item.location)?.label})</small></span><span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{item.quantity} {item.unit} op</span>
              </label>)}
            </div>
          </>}
          {automatic.length === 0 && manual.length === 0 && <p className="text-muted" style={{ marginBottom: '1.25rem', fontSize: '.88rem' }}>Geen gekoppelde voorraad gevonden voor dit recept.</p>}
          {unlinked.length > 0 && <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Niet bijgehouden: {unlinked.map((item) => item.name).join(', ')}.</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button onClick={confirm} style={{ padding: '.45rem 1.1rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Koken bevestigen</button></div>
        </div>
      </div>
    </div>
  );
}

