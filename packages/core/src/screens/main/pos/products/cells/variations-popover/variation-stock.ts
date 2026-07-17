export interface VariationStock {
	status: 'instock' | 'onbackorder' | 'outofstock';
	/** Quantity is only known when the variation manages its own stock */
	quantity: number | null;
	sellable: boolean;
}

export interface VariationStockInput {
	manage_stock?: boolean | 'parent';
	stock_quantity?: number | null;
	stock_status?: string;
	backorders?: string;
}

/**
 * Pure stock resolver shared by variation lists, selectors, and barcode scans.
 */
export function resolveVariationStock({
	manage_stock: manageStock,
	stock_quantity: stockQuantity,
	stock_status: stockStatus,
	backorders,
}: VariationStockInput): VariationStock {
	if (manageStock === true && Number.isFinite(stockQuantity)) {
		if ((stockQuantity as number) > 0) {
			return { status: 'instock', quantity: stockQuantity as number, sellable: true };
		}
		if (backorders === 'yes' || backorders === 'notify') {
			return { status: 'onbackorder', quantity: null, sellable: true };
		}
		return { status: 'outofstock', quantity: null, sellable: false };
	}

	if (stockStatus === 'outofstock') {
		return { status: 'outofstock', quantity: null, sellable: false };
	}
	if (stockStatus === 'onbackorder') {
		return { status: 'onbackorder', quantity: null, sellable: true };
	}
	return { status: 'instock', quantity: null, sellable: true };
}
