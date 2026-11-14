import isEqual from 'lodash/isEqual';

import {
	derive,
	fromMinor,
	isLivePaymentStatus,
	type MetaDataEntry,
	PAID_UNITS_META_KEY,
	paidUnitsMeta,
	type PaymentRow,
	readLedger,
	readPaidUnits,
	SPLIT_META_KEY,
	splitPlanMeta,
	toMinor,
	withMetaReplaced,
} from '@wcpos/order-math';
import type { EngineRecord } from '@wcpos/query';
import type { PayloadChanges } from '@wcpos/query/mutations';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import {
	getCheckoutModeSnapshot,
	pickUnits,
	setAllocations,
	setPickedUnits,
	setSplitOn,
	setTenderPlan,
} from '../checkout-mode';
import { type Allocations, mergedAllocations, rowsSince, type SplitView } from './split-view';
import {
	planLegs,
	type TenderAction,
	type TenderLineId,
	type TenderPlan,
	type TenderState,
} from './tender-state';

const logger = getLogger(['wcpos', 'pos', 'checkout', 'tender']);

type Meta = MetaDataEntry[] | undefined;

export interface SplitDeps {
	/** The order record: every journal reads it when it runs. */
	order: Pick<EngineRecord<'orders'>, 'uuid' | 'getLatest'>;
	/** The resolver write door (`writeLedgerChanges` on this order), resolved inside the write. */
	write: (changes: PayloadChanges) => Promise<unknown>;
	/** The tender reducer's own dispatch: it carries the plan by delegation, set only from here. */
	dispatch: (action: TenderAction) => void;
	state: Pick<TenderState, 'plan' | 'entryDirty'>;
	dp: number;
	titleOf: (methodId: string) => string;
	/** One chain per order: a partial leg's stamp a later one overtook must not put older units back. */
	stamps: { current: Promise<void> };
	logContext: Record<string, unknown>;
}

/** What one press knew: the keypad's split as it was drawn, and the sale's amounts. */
export interface PressFacts {
	view: Pick<SplitView, 'legUnits' | 'rowsSinceFrom'>;
	/** The order's meta as the keypad drew it: an abandoned split there is cleared. */
	meta: Meta;
	wholeOrder: boolean;
	balanceMinor: number;
	amountMinor: number;
}

/** The `_wcpos_paid_units` entry for these allocations; a stale key is cleared; undefined: none. */
function paidUnitsEntry(meta: Meta, allocations: Allocations): MetaDataEntry | undefined {
	if (Object.keys(allocations).length > 0) return paidUnitsMeta(allocations);
	// A refused completing attempt, or the last allocated leg voided, can leave units on the order.
	const stale = (meta ?? []).some(
		({ key, value }) => key === PAID_UNITS_META_KEY && value !== null
	);
	return stale ? { key: PAID_UNITS_META_KEY, value: null } : undefined;
}

/** A plan stored for this order across a remount. A stored plan is a split: its chip is on. */
export function restoredPlan(uuid: string, balanceMinor: number): TenderPlan | null {
	const plan = getCheckoutModeSnapshot().tenderPlans.get(uuid) ?? null;
	// A no-op unless the store lost the chip.
	if (balanceMinor > 0 && plan !== null) setSplitOn(uuid, true);
	return plan;
}

/**
 * The split's write side: the only writer of the plan (the checkout store's and the reducer's),
 * the Split chip, the picks, each payment's frozen units and `_wcpos_paid_units` on the order.
 */
export function splitCommands(deps: SplitDeps) {
	const { order, write, dispatch, state, dp, titleOf, stamps, logContext } = deps;
	const { uuid } = order;
	/**
	 * The allocations to journal: the order's `_wcpos_paid_units` under the till's, for the rows
	 * of `ledger` that are live. The caller passes the ledger it knows to be current: the stored
	 * meta can lag the row that just landed or the void that just answered.
	 */
	const journaled = (
		meta: Meta,
		ledger: PaymentRow[],
		paymentId?: string,
		legUnits?: Record<TenderLineId, number> | null
	) => {
		const live = new Set(
			ledger.filter(({ status }) => isLivePaymentStatus(status)).map(({ id }) => id)
		);
		const stored = Object.fromEntries(
			Object.entries(
				mergedAllocations(meta, getCheckoutModeSnapshot().allocations.get(uuid) ?? null)
			).filter(([id]) => live.has(id))
		);
		// The completing leg can be journaled before its row exists in the ledger.
		return paymentId && legUnits ? { ...stored, [paymentId]: legUnits } : stored;
	};
	/**
	 * Stamps run one after another and read the order at write time, never at call time (Greptile
	 * on #3421). `rows` are the caller's newer facts (the row that just landed, the void that just
	 * answered), laid over the ledger as the order has it.
	 */
	const stamp = (rows: PaymentRow[]) => {
		const next = stamps.current.then(async () => {
			try {
				// Resolved inside the atomic write against the payload as it is then: an adoption from
				// the store or another till between the call and the commit is merged, not overwritten
				// (Codex on #3421). An unchanged key is no write at all.
				await write((payload) => {
					const meta = payload.meta_data as Meta;
					const ledger = readLedger(meta).map(
						(row) => rows.find((candidate) => candidate.id === row.id) ?? row
					);
					for (const row of rows) if (!ledger.some(({ id }) => id === row.id)) ledger.push(row);
					const allocations = journaled(meta, ledger);
					const entry = paidUnitsEntry(meta, allocations);
					if (!entry || (entry.value !== null && isEqual(allocations, readPaidUnits(meta))))
						return {};
					return { meta_data: withMetaReplaced(meta, [entry]) };
				});
			} catch (error) {
				// Best effort: a local meta write must never fail a sale; completion journals again.
				logger.warn('Failed to journal paid units', {
					context: { ...logContext, error: getErrorMessage(error) },
				});
			}
		});
		stamps.current = next;
		return next;
	};
	const balanceOf = (ledger: PaymentRow[]) =>
		// The balance the summary shows (`derive()`): captured money only (ADR 0040 D6), and a
		// succeeded refund on a reopened sale due again (Codex 4342609028 on #2831).
		toMinor(derive(order.getLatest().payload.total, ledger, [], { dp }).balance, dp);
	/** The next payment is planned over `ledger`; THIS payment's picks are spent, a paid sale ends the chip. */
	const replan = (ledger: PaymentRow[], balanceMinor: number) => {
		dispatch({
			type: 'tender-recorded',
			balanceMinor,
			rowsSinceFrom: rowsSince(state.plan, ledger, dp, titleOf),
		});
		if (balanceMinor <= 0) setSplitOn(uuid, false);
		setPickedUnits(uuid, null);
	};

	return {
		/** Zero units unpicks; a pick replaces a stored plan (the reducer's follows the picks). */
		pick: (lineId: TenderLineId, units: number) => pickUnits(uuid, lineId, units),
		on: () => setSplitOn(uuid, true),
		/** The picks changed (the pane or the bill): they replace an active plan and are the entry again. */
		picksChanged(picked: Record<TenderLineId, number>, balanceMinor: number) {
			if (state.plan && Object.keys(picked).length > 0)
				dispatch({ type: 'clear-plan', balanceMinor, keepSplit: true, keepPicks: true });
			dispatch({ type: 'picks-changed' });
		},
		setPlan(plan: TenderPlan, balanceMinor: number) {
			dispatch({ type: 'set-plan', plan, balanceMinor });
			setSplitOn(uuid, true);
			setPickedUnits(uuid, null);
			setTenderPlan(uuid, plan);
		},
		/** The plan goes; `keepSplit` (Change split) leaves the chip, `keepPicks` the picks. */
		clear(options: Omit<Extract<TenderAction, { type: 'clear-plan' }>, 'type'>) {
			dispatch({ type: 'clear-plan', ...options });
			if (!options.keepSplit) setSplitOn(uuid, false);
			if (!options.keepPicks) setPickedUnits(uuid, null);
			setTenderPlan(uuid, null);
		},
		/** The keypad leaves the split: the chip and the picks go, and the plan too unless only `back`. */
		leave(action: Extract<TenderAction, { type: 'back' | 'arm-custom' | 'reset' }>) {
			dispatch(action);
			setSplitOn(uuid, false);
			setPickedUnits(uuid, null);
			if (action.type !== 'back') setTenderPlan(uuid, null);
		},
		/** A terminal leg began: its picks were frozen at the press, the entry clears. */
		legStarted() {
			dispatch({ type: 'tender-started' });
			setPickedUnits(uuid, null);
		},
		press({ view, meta, wholeOrder, balanceMinor, amountMinor }: PressFacts) {
			const { legUnits, rowsSinceFrom } = view;
			// The STORED plan is journaled, not the active one: the last leg of a finished split still
			// records its shares (activePlan is null once the legs are done). A whole-order gateway has none.
			const plan = wholeOrder ? null : state.plan;
			return {
				/**
				 * A leg's units freeze under its row id at the press (every manual and terminal leg):
				 * nothing is read from the picks when it settles, or units picked while a terminal
				 * payment waited would land on it (Greptile and Codex on #3412). A gateway leg has none.
				 */
				legPressed(paymentId: string) {
					if (!legUnits) return;
					setAllocations(uuid, {
						...(getCheckoutModeSnapshot().allocations.get(uuid) ?? {}),
						[paymentId]: legUnits,
					});
				},
				/**
				 * The split as the cashier saw it and the per-payment units (THIS leg's included, under
				 * an id minted before the write, Greptile on #3400), written with the leg. With no plan, a
				 * split an earlier abandoned attempt left on the order is cleared: it must not describe a
				 * sale that was then completed in one go. A stamp in flight lands first.
				 */
				async completionMeta(paymentId: string | undefined) {
					await stamps.current;
					const split = plan
						? [
								splitPlanMeta({
									kind: plan.kind,
									ways: planLegs(plan, rowsSinceFrom, balanceMinor).label.ways,
									shares: [
										...rowsSinceFrom.map(({ minor }) => fromMinor(minor, dp)),
										fromMinor(amountMinor, dp),
									],
								}),
							]
						: (meta ?? []).some(({ key, value }) => key === SPLIT_META_KEY && value !== null)
							? [{ key: SPLIT_META_KEY, value: null }]
							: undefined;
					// Only live rows' allocations: a failed leg's picks never describe the sale.
					const latest = order.getLatest().payload.meta_data;
					const entry = paidUnitsEntry(
						latest,
						journaled(latest, readLedger(latest), paymentId, legUnits)
					);
					return entry ? [...(split ?? []), entry] : split;
				},
			};
		},
		/**
		 * A leg landed. The plan stays stored until the sale is paid, whatever the leg count (a remount
		 * before a short split's last leg must keep it, roadmap#422). A partial leg's units are
		 * journaled on the order (#3421): the completing leg's provenance write carries its own.
		 */
		legRecorded(row: PaymentRow) {
			const latest = readLedger(order.getLatest().payload.meta_data);
			const index = latest.findIndex((candidate) => candidate.id === row.id);
			if (index < 0) latest.push(row);
			else latest[index] = row;
			const balanceMinor = balanceOf(latest);
			replan(latest, balanceMinor);
			setTenderPlan(uuid, balanceMinor > 0 ? state.plan : null);
			if (balanceMinor > 0) void stamp(latest);
		},
		/**
		 * A voided payment's units are unpaid again. An untouched entry follows the balance and the
		 * surviving legs (Greptile on #3405); an amount the cashier typed stays theirs (CodeRabbit).
		 */
		async legVoided(paymentId: string) {
			const { [paymentId]: _dropped, ...kept } =
				getCheckoutModeSnapshot().allocations.get(uuid) ?? {};
			setAllocations(uuid, kept);
			const latest = readLedger(order.getLatest().payload.meta_data).map((candidate) =>
				candidate.id === paymentId ? { ...candidate, status: 'voided' as const } : candidate
			);
			await stamp(latest);
			if (!state.entryDirty) replan(latest, balanceOf(latest));
		},
	};
}
