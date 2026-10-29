import * as React from 'react';

import { BeatingCount, useCountBeat } from '@wcpos/components/badge';
import { useDocField } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';
import { useCurrentOrder } from '../contexts/current-order';

/**
 * How many products the current cart holds: quantities summed across its lines, the number the
 * products panel's in-cart badge reads per product (`useProductCount`). Fee and shipping lines are
 * not products, so they are not counted.
 */
export function useCartItemCount() {
	const { currentOrderRecord } = useCurrentOrder();
	return useDocField(currentOrderRecord, (value) =>
		(value.payload.line_items ?? []).reduce(
			(sum: number, line: { quantity?: number }) => sum + (line.quantity ?? 1),
			0
		)
	) as number;
}

type Shown = { uuid: string; blank: boolean; identity: string; born: string | null };

/**
 * What the badge counts, for the beat's `identity`: the cart in front of the cashier, so a switch
 * to another cart moves nothing while the first line landing in a blank cart beats.
 *
 * Verified 2026-10-28: a blank cart keeps its uuid when its first line is written (`saveNewOrder`
 * births the resident under the template's uuid, `birthOrder` in `@wcpos/query/mutations`). But
 * the birth removes the template before the provider selects the born order, so the provider can
 * show the NEXT blank template for a render in between. So a blank followed by a blank is the same
 * cart, and so is the order a shown blank was born as; anything else is a switch.
 */
function useCartIdentity(record: { uuid: string; isNew?: boolean }) {
	const uuid = record.uuid;
	const blank = Boolean(record.isNew);
	const [shown, setShown] = React.useState<Shown>({ uuid, blank, identity: uuid, born: null });
	if (shown.uuid !== uuid || shown.blank !== blank) {
		const same = blank ? shown.blank : uuid === shown.born || (shown.blank && uuid === shown.uuid);
		setShown({
			uuid,
			blank,
			identity: same ? shown.identity : uuid,
			born: blank && shown.blank && uuid !== shown.uuid ? shown.uuid : null,
		});
	}
	return shown.identity;
}

/**
 * The phone Cart tab's badge over its icon: the blank cart's word ("New", the open-order strip's)
 * until the first product lands, then the count, with the beat the products panel's in-cart badge
 * plays (`InCartCount`). The pill form of that disc, so the word fits.
 */
export function CartTabCount() {
	const t = useT();
	const { currentOrderRecord } = useCurrentOrder();
	const count = useCartItemCount();
	const identity = useCartIdentity(currentOrderRecord as { uuid: string; isNew?: boolean });
	const text = count > 0 ? String(count) : t('pos_cart.new_cart_tab');
	const beat = useCountBeat({ value: count, text, identity });
	return (
		<BeatingCount
			pointerEvents="none"
			beat={beat}
			text={text}
			className="bg-primary h-5 min-w-5 rounded-full px-1.5"
			textClassName="text-primary-foreground text-xs font-bold tabular-nums"
		/>
	);
}
