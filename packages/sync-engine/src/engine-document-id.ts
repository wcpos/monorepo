export function engineDocumentIdFor(entity: 'product' | 'variation', wooId: number): string {
	return `woo-${entity}:${wooId}`;
}
