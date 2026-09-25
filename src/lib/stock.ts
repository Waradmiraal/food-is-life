import type { StockItem, StockLocation } from '../types';

export const STOCK_UNITS = ['stuks', 'g', 'kg', 'ml', 'l', 'pakken', 'blikken', 'zakken'] as const;
export const STOCK_LOCATIONS: { id: StockLocation; label: string; icon: string }[] = [
  { id: 'voorraadkast', label: 'Voorraadkast', icon: '▣' },
  { id: 'koelkast', label: 'Koelkast', icon: '❄' },
  { id: 'vriezer', label: 'Vriezer', icon: '🧊' },
];

export function isStockLocation(value: unknown): value is StockLocation {
  return value === 'voorraadkast' || value === 'koelkast' || value === 'vriezer';
}

export function normalizeStock(value: unknown): StockItem[] {
  if (!Array.isArray(value)) return [];
  const items = value.flatMap((item): StockItem[] => {
    // Compatibility with the former `string[]` stock format.
    if (typeof item === 'string') return [{ ingredientId: item, quantity: 1, unit: 'stuks', location: 'voorraadkast' }];
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
    const location = isStockLocation(candidate.location) ? candidate.location : 'voorraadkast';
    return [{ ingredientId: candidate.ingredientId, quantity, unit, location, ...(minimumQuantity !== undefined ? { minimumQuantity } : {}) }];
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

/** Converts a recipe amount to the unit used for the stored product. */
export function quantityForStockUnit(amount: string | undefined, stockUnit: string): number | null {
  if (!amount) return null;
  const match = amount.trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|stuks?|pakken?|blikken?|zakken?)\b/);
  if (!match) return null;
  const quantity = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const unit = match[2]
    .replace(/^stuk$/, 'stuks').replace(/^pak$/, 'pakken').replace(/^blik$/, 'blikken').replace(/^zak$/, 'zakken');
  if (unit === stockUnit) return quantity;
  const mass = { g: 1, kg: 1000 } as Record<string, number>;
  const volume = { ml: 1, l: 1000 } as Record<string, number>;
  if (unit in mass && stockUnit in mass) return quantity * mass[unit] / mass[stockUnit];
  if (unit in volume && stockUnit in volume) return quantity * volume[unit] / volume[stockUnit];
  return null;
}

