import * as React from 'react';

import type { EngineWarning } from '@wcpos/order-math';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import type { ErrorCode } from '@wcpos/utils/logger/generated/error-codes.generated';

const engineLogger = getLogger(['wcpos', 'pos', 'cart', 'engine']);

export type EngineWarningCode = EngineWarning['code'];

/**
 * THE sink for `@wcpos/order-math` warnings (#1560).
 *
 * The engine reports a fault as DATA rather than logging from inside the maths —
 * that is the whole point of the order-math package being pure (ADR
 * `2026-06-17-order-math-package`). It held up its end and core threw the result
 * away at every call site: five hooks each carried a paragraph explaining that
 * `warnings` was dropped "as it is at every other engine call site", and the
 * settle path — the one that runs on EVERY cart change — dropped it without even
 * that. Five copies of a paragraph justifying inaction is the shape of a decision
 * with no home, so this is the home: one report function, one rule, called
 * wherever an engine result crosses into core.
 *
 * Both warnings mean the same thing to the person at the counter: THE MONEY ON
 * THIS ORDER MAY BE WRONG. `malformed_pos_data` means a line's saved price basis
 * is unreadable, so its amount came from whatever totals were already on the
 * line; `unknown_tax_rate_id` means the order references a rate this store no
 * longer has. They carry separate error codes because the merchant's response
 * differs — re-add that line, versus ask the admin about a deleted tax rate.
 *
 * ── Not a toast ─────────────────────────────────────────────────────────────
 *
 * These fire per line mutation, so one bad line would re-toast on every edit, and
 * a cashier cannot repair malformed `pos_data` at the till anyway. But they must
 * know BEFORE taking payment, so the cashier-facing half rides the cart's
 * existing "the amounts on this order may not be right" surface —
 * `totals-changed-banner.tsx` — rather than inventing a second one. Inline,
 * beside the numbers it is talking about, and still there when the cashier looks
 * back from the customer.
 *
 * ── Why entries are STICKY for the order ────────────────────────────────────
 *
 * Same rule as the money-divergence store beside it, for the same reason: this is
 * a "the arithmetic on this sale rests on something it could not read" notice,
 * not a transient. Nothing re-scans a whole cart for every warning kind either —
 * `settleAggregate` sees line items only through their persisted totals, so a
 * malformed basis on a LINE ITEM is observable only at the mutation that touched
 * it. A set that cleared on the next settle would therefore flash and vanish for
 * exactly the warning the cashier most needs to see. It clears when the order
 * leaves the till.
 *
 * No scope-switch subscription, unlike the divergence store: entries are keyed by
 * order uuid, which is unique per order across stores, so a switch cannot show
 * one till's warnings on another's order. Stale ids simply age out of the cap.
 */
const ENGINE_WARNING_ERROR_CODES: Record<EngineWarningCode, ErrorCode> = {
	malformed_pos_data: ERROR_CODES.CART_LINE_PRICE_BASIS_UNREADABLE,
	unknown_tax_rate_id: ERROR_CODES.ORDER_TAX_RATE_UNKNOWN,
};

/** Developer-facing sentences. The cashier's copy lives in the banner. */
const ENGINE_WARNING_MESSAGES: Record<EngineWarningCode, string> = {
	malformed_pos_data: 'Cart line POS price basis could not be read; fell back to stored totals',
	unknown_tax_rate_id: 'Order references a tax rate id the store no longer has',
};

/**
 * The stable display order — the union's own order, so a cart carrying both
 * warnings does not reshuffle its banner between renders.
 */
const ENGINE_WARNING_ORDER: readonly EngineWarningCode[] = [
	'malformed_pos_data',
	'unknown_tax_rate_id',
];

/**
 * Orders whose warnings are held. Sticky entries have no automatic eviction
 * path, so a long shift against a store full of unreadable lines would otherwise
 * grow this without bound. The cashier only ever looks at the order in front of
 * them; the same bound, and the same reasoning, as MAX_HELD_DIVERGENCES.
 */
const MAX_HELD_ORDERS = 50;

/**
 * One log line per (order, code, detail), not per occurrence. The settle pass
 * runs on every cart change, so an unrepairable line would otherwise write the
 * same warning to the log on every keystroke and bury everything around it. The
 * detail is part of the key so a SECOND unknown rate id still gets its own entry.
 */
const MAX_LOGGED_KEYS = 500;

export type OrderEngineWarnings = readonly EngineWarningCode[];

const NO_WARNINGS: OrderEngineWarnings = [];

type WarningStore = Record<string, OrderEngineWarnings>;

const OrderEngineWarningsContext = React.createContext<WarningStore | undefined>(undefined);

/** What distinguishes two warnings of the same code — the log's dedupe key and its context. */
function warningDetail(warning: EngineWarning): Record<string, unknown> {
	return warning.code === 'unknown_tax_rate_id'
		? { rateId: warning.rateId }
		: { lineType: warning.where.lineType };
}

function detailKey(warning: EngineWarning): string {
	return warning.code === 'unknown_tax_rate_id' ? String(warning.rateId) : warning.where.lineType;
}

/** Drop the oldest orders once the held set outgrows its memory bound. */
function withinCap(byOrderId: WarningStore): WarningStore {
	const ids = Object.keys(byOrderId);
	if (ids.length <= MAX_HELD_ORDERS) return byOrderId;
	const kept: WarningStore = {};
	for (const id of ids.slice(ids.length - MAX_HELD_ORDERS)) kept[id] = byOrderId[id];
	return kept;
}

type ReportContext = {
	/** The order the engine call was computing for; `undefined` for an unsaved new order. */
	orderId: string | undefined;
	/** The core call site, for the log. */
	site: string;
};

export type ReportEngineWarnings = (
	warnings: readonly EngineWarning[],
	context: ReportContext
) => void;

const ReportEngineWarningsContext = React.createContext<ReportEngineWarnings | undefined>(
	undefined
);

/** No provider: log, do not throw. An advisory surface must never take the cart down. */
const REPORT_WITHOUT_PROVIDER: ReportEngineWarnings = () => undefined;

export function OrderEngineWarningsProvider({ children }: { children: React.ReactNode }) {
	const [byOrderId, setByOrderId] = React.useState<WarningStore>({});

	// The log's dedupe ledger. A ref, not state: nothing renders off it, and it
	// must not be reset by a re-render — a reset would re-log every held warning.
	const loggedKeys = React.useRef<Set<string>>(new Set());

	const reportEngineWarnings = React.useCallback<ReportEngineWarnings>(
		(warnings, { orderId, site }) => {
			if (warnings.length === 0) return;

			for (const warning of warnings) {
				const key = `${orderId ?? ''}|${warning.code}|${detailKey(warning)}`;
				if (loggedKeys.current.has(key)) continue;
				// Re-logging a handful of already-seen warnings costs one line each; an
				// unbounded ledger costs the shift.
				if (loggedKeys.current.size >= MAX_LOGGED_KEYS) loggedKeys.current.clear();
				loggedKeys.current.add(key);
				engineLogger.warn(ENGINE_WARNING_MESSAGES[warning.code], {
					code: ENGINE_WARNING_ERROR_CODES[warning.code],
					context: { site, orderId, ...warningDetail(warning) },
				});
			}

			// An unsaved new order has no uuid to key the banner by. It is logged above
			// and the cart edit that gives the order its uuid reports again.
			if (!orderId) return;

			setByOrderId((current) => {
				const held = current[orderId] ?? NO_WARNINGS;
				const merged = ENGINE_WARNING_ORDER.filter(
					(code) => held.includes(code) || warnings.some((warning) => warning.code === code)
				);
				// Same set: return the SAME state, or a settle on every cart change
				// re-renders every banner mount for nothing.
				if (merged.length === held.length) return current;
				return withinCap({ ...current, [orderId]: merged });
			});
		},
		[]
	);

	return (
		<ReportEngineWarningsContext.Provider value={reportEngineWarnings}>
			<OrderEngineWarningsContext.Provider value={byOrderId}>
				{children}
			</OrderEngineWarningsContext.Provider>
		</ReportEngineWarningsContext.Provider>
	);
}

/**
 * The one sink. Hand it whatever an engine call returned in `warnings` — an empty
 * array is the overwhelmingly common case and costs nothing.
 */
export function useReportEngineWarnings(): ReportEngineWarnings {
	return React.useContext(ReportEngineWarningsContext) ?? REPORT_WITHOUT_PROVIDER;
}

/**
 * The warning kinds held for one order, in a stable order.
 *
 * Returns an empty list outside the provider rather than throwing, for the same
 * reason `useOrderMoneyDivergence` does: this is advisory, and a missing provider
 * must never take the cart down with it.
 */
export function useOrderEngineWarnings(orderId: string | undefined): OrderEngineWarnings {
	const store = React.useContext(OrderEngineWarningsContext);
	return (orderId && store ? store[orderId] : undefined) ?? NO_WARNINGS;
}
