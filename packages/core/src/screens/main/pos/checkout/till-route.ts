import type { ImperativeRouter } from 'expo-router';

// From checkout, the /cart tie between (columns) and (tabs) resolves to (columns) (#2363).
// Phones target (tabs) explicitly; dismissTo keeps repeated sales from stacking (tabs) routes.

/** The phone tab checkout hands the cashier back to. */
export type TillTab = 'products' | 'cart';

/** Where checkout returns to: the explicit phone (tabs) route on a phone, `/cart` when wide. */
export function tillHref(compact: boolean, tab: TillTab) {
	return compact
		? tab === 'products'
			? '/(app)/(drawer)/(pos)/(tabs)'
			: '/(app)/(drawer)/(pos)/(tabs)/cart'
		: '/cart';
}

/** Leaves checkout by dismissing to the phone tabs or replacing with the wide cart. */
export function returnToTill(
	router: Pick<ImperativeRouter, 'replace' | 'dismissTo'>,
	compact: boolean,
	tab: TillTab
): void {
	if (compact) router.dismissTo(tillHref(true, tab));
	else router.replace({ pathname: '/cart' });
}
