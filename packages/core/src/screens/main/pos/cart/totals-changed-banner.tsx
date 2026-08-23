import * as React from 'react';
import { View } from 'react-native';

import { DocsLink } from '@wcpos/components/docs-link';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../contexts/translations';
import { useCurrentOrder } from '../contexts/current-order';
import {
	type OrderMoneyDivergenceField,
	STORE_LEVEL_DIVERGENCE_THRESHOLD,
	useOrderMoneyDivergence,
} from '../contexts/order-money-divergence';

const DOCS_URL = 'https://docs.wcpos.com/support/troubleshooting/totals-disagree';

/**
 * The order-level money slots, in the order a cashier reads a receipt. Anything
 * outside this list is per-line (`line_items[<uuid>].total_tax`,
 * `tax_lines[<id>].tax_total`) and is counted rather than named: the path means
 * something to support and nothing to the person at the counter, and a cart
 * banner listing twelve of them would bury the number that matters.
 */
const ORDER_LEVEL_FIELDS: { field: string; labelKey: string }[] = [
	{ field: 'total', labelKey: 'pos_cart.totals_disagree_field_total' },
	{ field: 'total_tax', labelKey: 'pos_cart.totals_disagree_field_total_tax' },
	{ field: 'cart_tax', labelKey: 'pos_cart.totals_disagree_field_cart_tax' },
	{ field: 'discount_total', labelKey: 'pos_cart.totals_disagree_field_discount' },
	{ field: 'shipping_total', labelKey: 'pos_cart.totals_disagree_field_shipping' },
];

function partitionFields(fields: OrderMoneyDivergenceField[]) {
	const byField = new Map(fields.map((entry) => [entry.field, entry]));
	const named = ORDER_LEVEL_FIELDS.flatMap(({ field, labelKey }) => {
		const entry = byField.get(field);
		return entry ? [{ ...entry, labelKey }] : [];
	});
	const namedFields = new Set(named.map((entry) => entry.field));
	const lineLevelCount = fields.filter((entry) => !namedFields.has(entry.field)).length;
	return { named, lineLevelCount };
}

/**
 * "Your store changed this order's totals" — the cashier-facing half of R1,
 * under ADR 0032.
 *
 * WooCommerce owns money: the aggregate fields are read-only in its REST
 * schema, so the store recalculates every order from its lines and the POS's
 * arithmetic is a reproduction of that calculation. A divergence therefore
 * means the reproduction is wrong — a POS defect, a misconfigured store, or a
 * store computing something the POS does not model. All three are the same
 * event to the cashier, and all three are worth telling them about.
 *
 * Four deliberate choices:
 *
 *  - INLINE, not a toast. A toast auto-dismisses while the cashier is looking
 *    at the customer, and the one thing this alert must do is still be there
 *    when they look back. It also sits beside the numbers it is talking about,
 *    so "check the total" is one glance, not a memory exercise.
 *  - NOT a modal. The server's totals STAND — the sale is valid and blocking it
 *    would be the POS second-guessing its own source of truth. This tells the
 *    cashier to review before handing over goods; it does not stop them.
 *  - NOT DISMISSIBLE (changed 2026-08-23, ADR 0032 §5). It used to be, on the
 *    reasoning that the cashier acknowledges it once per order. That was right
 *    when divergence read as "noteworthy"; it is wrong now that it reads as
 *    "a product invariant is broken". A dismissed notice is a broken invariant
 *    nobody reports. It also had a mechanical cost: dismissal shared its state
 *    with the settlement guard, so waving the banner away un-suppressed the
 *    overruled arithmetic and pushed it straight back.
 *  - FIELD-LEVEL. The divergence record carries `expected` (the POS figure) and
 *    `got` (the store's) per field, which is enough for support to act without
 *    a screen share. Naming them here is what turns "check the total" into a
 *    report someone can do something with.
 *
 * It renders nothing on the overwhelmingly common path: a 2dp ack of the same
 * money is not divergence (#946), so this is silent on ordinary sales.
 *
 * `orderId` is explicit rather than read from the current-order context because
 * the banner has TWO mounts: the cart, and the checkout modal — which covers
 * the cart at exactly the moment the ruling cares about, "before handing over
 * goods", and which is handed its order directly.
 */
export function TotalsChangedBanner({
	orderId,
	testID = 'order-totals-changed-banner',
}: {
	orderId: string | undefined;
	testID?: string;
}) {
	const { divergence, divergedOrderCount } = useOrderMoneyDivergence(orderId);
	const t = useT();

	if (!divergence) return null;

	const { named, lineLevelCount } = partitionFields(divergence.fields);
	// One diverged sale is a sale to check. Several is a property of the install,
	// and that is the thing support needs to hear — a cashier cannot act on it,
	// but they can pass it on (ADR 0032 §5.3).
	const storeLevel = divergedOrderCount >= STORE_LEVEL_DIVERGENCE_THRESHOLD;

	return (
		<View testID={testID} className="border-attention/50 bg-attention/10 m-2 rounded-md border p-2">
			<VStack className="gap-1">
				<Text className="text-sm font-medium">{t('pos_cart.totals_changed_title')}</Text>
				<Text className="text-muted-foreground text-sm">{t('pos_cart.totals_changed_body')}</Text>

				{named.map((entry) => (
					<HStack key={entry.field} testID={`${testID}-field-${entry.field}`} className="gap-2">
						<Text className="text-muted-foreground text-sm">{t(entry.labelKey)}</Text>
						<Text className="text-sm font-medium">
							{t('pos_cart.totals_disagree_change', {
								before: entry.expected,
								after: entry.got,
							})}
						</Text>
					</HStack>
				))}

				{lineLevelCount > 0 ? (
					<Text testID={`${testID}-line-amounts`} className="text-muted-foreground text-xs">
						{t('pos_cart.totals_disagree_line_amounts', { count: lineLevelCount })}
					</Text>
				) : null}

				{storeLevel ? (
					<VStack
						testID={`${testID}-store-level`}
						className="border-attention/30 gap-1 border-t pt-1"
					>
						<Text className="text-sm font-medium">
							{t('pos_cart.totals_disagree_store_level_title', { count: divergedOrderCount })}
						</Text>
						<Text className="text-muted-foreground text-sm">
							{t('pos_cart.totals_disagree_store_level_body')}
						</Text>
						<DocsLink testID={`${testID}-docs-link`} href={DOCS_URL}>
							{t('pos_cart.totals_disagree_docs_link')}
						</DocsLink>
					</VStack>
				) : null}
			</VStack>
		</View>
	);
}

/** The cart mount: the current order, read from context. */
export function CartTotalsChangedBanner() {
	const { currentOrderRecord } = useCurrentOrder();
	return <TotalsChangedBanner orderId={currentOrderRecord.uuid} />;
}
