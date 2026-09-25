import type { StockItem } from '../types';

export const STOCK_UNITS = ['stuks', 'g', 'kg', 'ml', 'l', 'pakken', 'blikken', 'zakken'] as const;

export function normalizeStock(value: unknown): StockItem[] {
  if (!Array.isArray(value)) return [];
  const items = value.flatMap((item): StockItem[] => {
    // Compatibility with the former `string[]` stock format.
    if (typeof item === 'string') return [{ ingredientId: item, quantity: 1, unit: 'stuks' }];
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Partial<StockItem>;
    if (typeof candidate.ingredientId !== 'string' || !candidate.ingredientId) return [];
    const quantity = typeof candidate.quantity === 'number' && Number.isFinite(candidate.quantity)
      ? Math.max(0, candidate.quantity)
      : 1;
    const unit = typeof candidate.unit === 'string' && candidate.unit.trim() ? candidate.unit.trim() : 'stuks';
    const minimumQuantity = typeof candidate.minimumQuantity === 'number' && Number.isFinite(candidate.minimumQuantity)
      ? Math.max(0, candidate.minimumQuantity)
      : undefined;
    return [{ ingredientId: candidate.ingredientId, quantity, unit, ...(minimumQuantity !== undefined ? { minimumQuantity } : {}) }];
  });

  // The latest occurrence wins, avoiding duplicate product rows after imports.
  return Array.from(new Map(items.map((item) => [item.ingredientId, item])).values());
}

export function stockIds(stock: StockItem[]): string[] {
  return stock.filter((item) => item.quantity > 0).map((item) => item.ingredientId);
}

export function formatStock(item: StockItem): string {
  return `${item.quantity} ${item.unit}`;
}

