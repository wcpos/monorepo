import * as React from 'react';
import { View } from 'react-native';

import { DocsLink } from '@wcpos/components/docs-link';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../contexts/translations';
import { useCurrentOrder } from '../contexts/current-order';
import { type EngineWarningCode, useOrderEngineWarnings } from '../contexts/order-engine-warnings';
import {
	type OrderMoneyDivergence,
	type OrderMoneyDivergenceField,
	STORE_LEVEL_DIVERGENCE_THRESHOLD,
	useOrderMoneyDivergence,
} from '../contexts/order-money-divergence';

const DOCS_URL = 'https://docs.wcpos.com/support/troubleshooting/totals-disagree';

/**
 * The cashier's sentence per engine warning kind (#1560).
 *
 * `@wcpos/order-math` reports a fault as data — `malformed_pos_data` when a
 * line's saved price basis is unreadable, `unknown_tax_rate_id` when the order
 * references a rate the store no longer has — and both mean the same thing at
 * the counter: THE MONEY ON THIS ORDER MAY BE WRONG. They differ in what the
 * merchant does about it, which is why each gets its own sentence rather than
 * one generic line.
 *
 * A switch of LITERAL `t()` calls, not a key map: `scripts/extract-js-strings.js`
 * parses `t('...')` out of the source, so a key reached through a variable never
 * reaches a translator and ships English to every locale. (The order-level field
 * labels above are reached that way and have exactly that problem; this is not
 * the change that fixes them.) The return type makes a missing case a compile
 * error, so a third warning kind cannot land unlabelled.
 */
function engineWarningText(code: EngineWarningCode, t: (key: string) => string): string {
	switch (code) {
		case 'malformed_pos_data':
			return t('pos_cart.engine_warning_malformed_pos_data');
		case 'unknown_tax_rate_id':
			return t('pos_cart.engine_warning_unknown_tax_rate_id');
	}
}

/**
 * The order-level money slots, in the order a cashier reads a receipt. Anything
 * outside this list is per-line (`line_items[<uuid>].total_tax`,
 * `tax_lines[<id>].tax_total`) and is counted rather than named: the path means
 * something to support and nothing to the person at the counter, and a cart
 * banner listing twelve of them would bury the number that matters.
 *
 * This list must cover `ORDER_MONEY_FIELDS` in
 * packages/sync-engine/src/write-path/order-money-divergence.ts EXACTLY. A field
 * the producer treats as order-level and this one omits does not go unlabelled —
 * it falls through to the per-line count, so a divergence in `discount_tax`
 * alone reads as "1 line amount also differs" and the two figures the cashier
 * needs disappear entirely. Pinned in totals-changed-banner.test.tsx.
 */
const ORDER_LEVEL_FIELDS: { field: string; labelKey: string }[] = [
	{ field: 'total', labelKey: 'pos_cart.totals_disagree_field_total' },
	{ field: 'total_tax', labelKey: 'pos_cart.totals_disagree_field_total_tax' },
	{ field: 'cart_tax', labelKey: 'pos_cart.totals_disagree_field_cart_tax' },
	{ field: 'discount_total', labelKey: 'pos_cart.totals_disagree_field_discount' },
	{ field: 'discount_tax', labelKey: 'pos_cart.totals_disagree_field_discount_tax' },
	{ field: 'shipping_total', labelKey: 'pos_cart.totals_disagree_field_shipping' },
	{ field: 'shipping_tax', labelKey: 'pos_cart.totals_disagree_field_shipping_tax' },
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
 * Five deliberate choices:
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
 *  - ALWAYS LINKS OUT. The "why totals disagree" docs link shows on every
 *    divergence, not only at store-level escalation. Encounter one is the most
 *    confusing moment and used to be the only one with nothing to click; a
 *    quiet standing link answers "what is this?" without pulling the cashier
 *    off the sale, while the loud "show this to your manager" call-to-action
 *    stays gated on escalation.
 *
 * It renders nothing on the overwhelmingly common path: a 2dp ack of the same
 * money is not divergence (#946), so this is silent on ordinary sales.
 *
 * ── TWO findings, one slot (#1560) ──────────────────────────────────────────
 *
 * The banner also carries the order-math engine's warnings — a line whose saved
 * price basis could not be read, a tax rate id the store no longer has. They
 * arrive by a different route (a client-side engine call, not a server ack) and
 * the merchant does something different about each, but they answer the SAME
 * cashier question this banner already exists to answer: is the money on this
 * sale right? A second banner would make the cashier hold two places on screen
 * to answer one question, so the two render as sibling notices here instead.
 * Every choice above holds for both — inline, not modal, not dismissible.
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
	const engineWarnings = useOrderEngineWarnings(orderId);

	if (!divergence && engineWarnings.length === 0) return null;

	return (
		<View testID={testID} className="border-attention/50 bg-attention/10 m-2 rounded-md border p-2">
			<VStack className="gap-1">
				{divergence ? (
					<DivergenceNotice
						divergence={divergence}
						divergedOrderCount={divergedOrderCount}
						testID={testID}
					/>
				) : null}
				{engineWarnings.length > 0 ? (
					<EngineWarningNotice
						warnings={engineWarnings}
						separated={divergence != null}
						testID={testID}
					/>
				) : null}
			</VStack>
		</View>
	);
}

/** The server-overruled-our-arithmetic half. See the header for every choice in it. */
function DivergenceNotice({
	divergence,
	divergedOrderCount,
	testID,
}: {
	divergence: OrderMoneyDivergence;
	divergedOrderCount: number;
	testID: string;
}) {
	const t = useT();
	const { named, lineLevelCount } = partitionFields(divergence.fields);
	// One diverged sale is a sale to check. Several is a property of the install,
	// and that is the thing support needs to hear — a cashier cannot act on it,
	// but they can pass it on (ADR 0032 §5.3).
	const storeLevel = divergedOrderCount >= STORE_LEVEL_DIVERGENCE_THRESHOLD;

	return (
		<>
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
				</VStack>
			) : null}

			{/*
			 * The link is shown on EVERY divergence, not only at store-level
			 * escalation. The first time a cashier meets this banner is the most
			 * confusing moment, and it is the one that used to have nothing to
			 * click: the "why totals disagree" explanation only appeared once three
			 * sales had diverged. A quiet, standing link answers "what is this?" on
			 * encounter one without pulling the cashier off the sale — the loud
			 * "show this to whoever manages your store" call-to-action stays gated
			 * on escalation above, where it belongs.
			 *
			 * It belongs to THIS notice, not to the banner: the page explains why the
			 * store's arithmetic and the POS's differ, which says nothing about an
			 * engine warning. Pointing an unreadable price basis at it would answer a
			 * question the cashier did not ask with one they cannot act on.
			 */}
			<DocsLink testID={`${testID}-docs-link`} href={DOCS_URL}>
				{t('pos_cart.totals_disagree_docs_link')}
			</DocsLink>
		</>
	);
}

/**
 * The order-math half (#1560): the engine could not read something this order's
 * money rests on.
 *
 * It shares the banner rather than getting a surface of its own — same slot,
 * same "check this before handing over goods" job, and the two can be true at
 * once. `separated` draws the rule between them when they are, so the cashier
 * reads two findings rather than one run-on paragraph.
 */
function EngineWarningNotice({
	warnings,
	separated,
	testID,
}: {
	warnings: readonly EngineWarningCode[];
	separated: boolean;
	testID: string;
}) {
	const t = useT();

	return (
		<VStack
			testID={`${testID}-engine-warnings`}
			className={separated ? 'border-attention/30 gap-1 border-t pt-1' : 'gap-1'}
		>
			<Text className="text-sm font-medium">{t('pos_cart.engine_warnings_title')}</Text>
			{warnings.map((code) => (
				<Text
					key={code}
					testID={`${testID}-engine-warning-${code}`}
					className="text-muted-foreground text-sm"
				>
					{engineWarningText(code, t)}
				</Text>
			))}
		</VStack>
	);
}

/** The cart mount: the current order, read from context. */
export function CartTotalsChangedBanner() {
	const { currentOrderRecord } = useCurrentOrder();
	return <TotalsChangedBanner orderId={currentOrderRecord.uuid} />;
}
