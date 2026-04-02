interface ResolvePriceNumDecimalsOptions {
	contextDp?: number | null;
	storeDp?: number | null;
}

export function resolvePriceNumDecimals({
	contextDp,
	storeDp,
}: ResolvePriceNumDecimalsOptions): number {
	return contextDp ?? storeDp ?? 2;
}
