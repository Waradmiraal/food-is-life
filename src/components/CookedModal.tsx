import { useMemo, useState } from 'react';
import type { Recipe, Ingredient, StockItem } from '../types';
import { quantityForStockUnit } from '../lib/stock';

interface Props {
  recipe: Recipe;
  allIngredients: Ingredient[];
  stock: StockItem[];
  onCook: (ingredientIds: string[], consumptions: { ingredientId: string; quantity: number; unit: string }[]) => void;
  onClose: () => void;
}

export function CookedModal({ recipe, allIngredients, stock, onCook, onClose }: Props) {
  const [depleted, setDepleted] = useState<Set<string>>(new Set());
  const stockByIngredient = useMemo(() => new Map(stock.map((item) => [item.ingredientId, item])), [stock]);
  const automatic = useMemo(() => (recipe.recipeIngredients ?? []).flatMap((ingredient) => {
    if (!ingredient.ingredientId) return [];
    const item = stockByIngredient.get(ingredient.ingredientId);
    if (!item || item.quantity <= 0) return [];
    const quantity = quantityForStockUnit(ingredient.amount, item.unit);
    return quantity === null ? [] : [{ ingredientId: item.ingredientId, quantity, unit: item.unit, name: ingredient.name, available: item.quantity }];
  }), [recipe.recipeIngredients, stockByIngredient]);
  const automaticIds = new Set(automatic.map((item) => item.ingredientId));
  const manual = recipe.ingredients
    .map((id) => ({ ingredient: allIngredients.find((item) => item.id === id), stock: stockByIngredient.get(id) }))
    .filter((entry): entry is { ingredient: Ingredient; stock: StockItem } => !!entry.ingredient && !!entry.stock && entry.stock.quantity > 0 && !automaticIds.has(entry.ingredient.id));
  const unlinked = (recipe.recipeIngredients ?? []).filter((item) => !item.ingredientId);

  function toggle(id: string) {
    setDepleted((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  function confirm() {
    onCook(Array.from(depleted), automatic.map(({ name: _name, available: _available, ...item }) => item));
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
              {automatic.map((item) => <div key={item.ingredientId} style={{ display: 'flex', alignItems: 'center', gap: '.65rem', padding: '.5rem .6rem', borderRadius: 6, background: 'var(--accent-light)' }}>
                <span style={{ flex: 1, fontSize: '.9rem' }}>{item.name}</span><strong style={{ fontSize: '.85rem', color: 'var(--accent)' }}>−{item.quantity} {item.unit}</strong>{item.quantity > item.available && <span title="Er is minder aanwezig; de voorraad wordt nul." style={{ fontSize: '.8rem' }}>⚠</span>}
              </div>)}
            </div>
          </>}
          {manual.length > 0 && <>
            <p className="text-muted" style={{ marginBottom: '.6rem', fontSize: '.88rem' }}>Vink alleen een product aan als het helemaal op is.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem', marginBottom: '1rem' }}>
              {manual.map(({ ingredient, stock: item }) => <label key={ingredient.id} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.45rem .6rem', borderRadius: 6, cursor: 'pointer', background: depleted.has(ingredient.id) ? '#fee2e2' : 'var(--tag-bg)' }}>
                <input type="checkbox" checked={depleted.has(ingredient.id)} onChange={() => toggle(ingredient.id)} /><span style={{ flex: 1, fontSize: '.9rem', textDecoration: depleted.has(ingredient.id) ? 'line-through' : 'none' }}>{ingredient.name}</span><span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{item.quantity} {item.unit} op</span>
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

