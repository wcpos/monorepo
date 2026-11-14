import {
	countsTowardPaid,
	type PaymentMethodDescriptor,
	type PaymentRow,
	roundedDue,
	settlesAtRoundedDue,
} from '@wcpos/order-math';

import {
	activePlan,
	appliedMinor,
	changeMinor,
	heroForPicked,
	percentOfMinor,
	planLegs,
	quickTenderedAmounts,
	type TenderLineId,
	type TenderState,
	unitsMinor,
} from './tender-state';

import type { SplitView } from './split-view';

/** The notes a cashier is handed: the balance itself, then the next whole 5, 10 and 50. */
const QUICK_TENDER_STEPS = [5, 10, 50] as const;

type FigureMethod = Pick<PaymentMethodDescriptor, 'capture' | 'capabilities' | 'defaults'>;

/**
 * A gateway that takes no part payment runs the whole order (§4.1): it has no split, and its
 * entry is the balance whatever another pill or a plan left typed.
 */
export const runsWholeOrder = (method: FigureMethod | null) =>
	method?.capture.mode === 'gateway' && !method.capabilities.amount.partial;

/** The plain facts the keypad's numbers are derived from. */
export interface TenderFacts {
	/** Store decimal places; every `*Minor` number is in these units. */
	dp: number;
	balanceMinor: number;
	/** The order's ledger rows, in ledger order. */
	rows: readonly PaymentRow[];
	/** The selected method, or null in the select view. */
	method: FigureMethod | null;
	state: Pick<
		TenderState,
		'view' | 'entryMinor' | 'entryDirty' | 'extraMinor' | 'entryMode' | 'plan'
	>;
	/** The split's facts (`splitView`): the lines, this payment's picks, the paid units, the legs taken. */
	split: Pick<SplitView, 'picked' | 'unpaidUnits' | 'rowsSinceFrom'> & {
		lines: readonly { id: TenderLineId; quantity: number; totalMinor: number }[];
		paidUnits: Record<TenderLineId, { units: number }>;
	};
}

/** Every number the keypad shows and commits, computed once (the hook) and formatted (the pane). */
export type TenderFigures = ReturnType<typeof tenderFigures>;

export function tenderFigures(facts: TenderFacts) {
	const { dp, balanceMinor, rows, method, state } = facts;
	const { lines, picked, unpaidUnits, rowsSinceFrom } = facts.split;
	// With a plan, a cash leg is the planned share: notes handed over above it are change,
	// not a bigger leg (the "50" chip for a 46,48 leg). A method that gives no change takes
	// what was typed, capped at the balance — typing a different amount IS changing the leg.
	// The last leg is whatever balance remains (rounding, or a short earlier leg), never the share.
	// A gateway that runs the whole order has no split: whatever plan is stored is ignored for it
	// (the Split chip is hidden on its keypad) and never written as the sale's provenance.
	const fixedAmount = runsWholeOrder(method);
	const plan = fixedAmount ? null : activePlan(state.plan, rowsSinceFrom.length, balanceMinor);
	const split = plan ? planLegs(plan, rowsSinceFrom, balanceMinor) : null;
	const legs = split?.legs ?? [];
	const done = legs.filter((leg) => leg.state === 'done');
	// Payments are numbered across the bill: those taken before the plan count too (ruled 2026-11-08).
	// `plan.from` indexes every ledger row; only the counted ones before it are payments.
	const n = rows.filter(countsTowardPaid).length + 1;
	const ways =
		rows.slice(0, plan?.from ?? 0).filter(countsTowardPaid).length + (split?.label.ways ?? 0);
	const groupDone =
		plan?.kind === 'items' && done.reduce((sum, leg) => sum + leg.minor, 0) >= plan.firstMinor;
	const thisPaymentMinor = split?.thisPaymentMinor ?? balanceMinor;
	const legCapMinor = method?.capabilities.change ? thisPaymentMinor : balanceMinor;
	// Cash rounding (#66, #84) previews what the cash.rounding hook decides at commit, with the
	// same functions on the same facts the commit dispatches.
	const { dueMinor: roundedDueMinor } = roundedDue(
		balanceMinor,
		method?.capture.mode === 'manual' ? method.defaults.rounding : null,
		dp
	);
	// THIS payment built from picked units: their price (all unpaid units picked carries the stray
	// rounding cents) plus any `+ amount`, until the cashier types over it (a cash tender).
	const paidOf = (lineId: TenderLineId) => facts.split.paidUnits[lineId]?.units ?? 0;
	const pickedMinor = lines.reduce((sum, { id, quantity, totalMinor }) => {
		const paid = Math.min(paidOf(id), quantity);
		const units = paid + (picked[id] ?? 0);
		return sum + unitsMinor(totalMinor, quantity, units) - unitsMinor(totalMinor, quantity, paid);
	}, 0);
	const picking = Object.keys(picked).length > 0;
	// Every unpaid unit picked, and what is left is only the cents `unitsMinor` floors away
	// (under one minor unit per unit): shipping, fees and a rounding fee stay in the rest,
	// never swallowed as "rounding" (CodeRabbit on #3405).
	const strayMinor = balanceMinor - pickedMinor;
	const allUnpaidPicked =
		picking &&
		lines.every(({ id }) => (picked[id] ?? 0) >= unpaidUnits[String(id)]) &&
		strayMinor >= 0 &&
		strayMinor < lines.reduce((sum, { quantity }) => sum + quantity, 0);
	const pickedEntryMinor =
		picking && (state.extraMinor !== null || !state.entryDirty)
			? heroForPicked(pickedMinor, balanceMinor, allUnpaidPicked) + (state.extraMinor ?? 0)
			: null;
	// Percent entry: the reducer's entry is the typed share; the money is a share of the balance.
	const percent = state.entryMode === 'percent';
	const percentMinor = percent ? percentOfMinor(balanceMinor, state.entryMinor) : null;
	// An untouched prefill of the balance is the due, so under rounding it is the rounded due.
	const entryMinor =
		pickedEntryMinor ??
		percentMinor ??
		(!state.entryDirty && state.entryMinor === balanceMinor ? roundedDueMinor : state.entryMinor);
	// A gateway that takes no part payment runs the whole order (§4.1): the entry is the balance
	// whatever another pill or a plan left typed, so the leg completes and is journaled as such.
	const enteredLegMinor = fixedAmount ? balanceMinor : appliedMinor(entryMinor, legCapMinor);
	const roundingMinor = settlesAtRoundedDue({
		amountMinor: enteredLegMinor,
		tenderedMinor: entryMinor,
		balanceMinor,
		dueMinor: roundedDueMinor,
	})
		? roundedDueMinor - balanceMinor
		: 0;
	const entryAppliedMinor = roundingMinor !== 0 ? roundedDueMinor : enteredLegMinor;
	const givesChange = method?.capabilities.change ?? false;
	const nowMinor = state.view === 'amount' ? entryAppliedMinor : thisPaymentMinor;
	// A cash entry the cash.rounding hook will settle is due the rounded amount (#66, #84).
	const dueMinor = roundingMinor !== 0 ? roundedDueMinor : thisPaymentMinor;
	const typed = state.entryDirty && entryAppliedMinor > 0 && entryAppliedMinor < balanceMinor;
	return {
		fixedAmount,
		/** The plan as the keypad sees it: null once its legs are taken, or for a fixed gateway. */
		plan,
		legs,
		/** The plan's untranslated label pieces; the flow localizes them. */
		label: split?.label ?? null,
		/** "Payment n of ways", numbered across the bill; `ways` is 0 without a plan. */
		n,
		ways,
		/** Planned payments still to come after this one. */
		toCome: legs.filter((leg) => leg.state === 'todo').length,
		groupDone,
		/** An items plan shared more than one way, its group not yet paid. */
		shared: plan?.kind === 'items' && plan.ways > 1 && !groupDone,
		/** The planned leg, or the balance with no plan. */
		thisPaymentMinor,
		roundedDueMinor,
		/** `roundedDueMinor - balanceMinor` when the entry settles at the rounded due, else 0. */
		roundingMinor,
		pickedMinor,
		allUnpaidPicked,
		percentMinor,
		/** The entry as the cashier sees it: picks, percent share or the (rounded) prefill. */
		entryMinor,
		/** The leg the entry makes before rounding (the commit's `amountMinor`). */
		enteredLegMinor,
		/** That leg after cash rounding: what the entry applies to the order. */
		entryAppliedMinor,
		entryChangeMinor: changeMinor(entryMinor, entryAppliedMinor, givesChange),
		/** THIS payment: the applied entry on the keypad, the planned share in the select view. */
		nowMinor,
		afterThisPaymentMinor: balanceMinor + roundingMinor - nowMinor,
		quickAmountsMinor: givesChange
			? quickTenderedAmounts(
					nowMinor,
					QUICK_TENDER_STEPS.map((step) => step * 10 ** dp)
				)
			: [],
		dueMinor,
		/** The Exact chip: the rounded due whenever this leg is the whole balance, since tapping it settles. */
		exactMinor: thisPaymentMinor === balanceMinor ? roundedDueMinor : dueMinor,
		/** The big figure. */
		shownMinor:
			state.view === 'select' ? dueMinor : fixedAmount || percent ? entryAppliedMinor : entryMinor,
		/** A no-change method typed past the balance; a fixed-amount gateway applies the balance whatever is typed. */
		noChange:
			method !== null && !givesChange && !fixedAmount && !percent && entryMinor > balanceMinor,
		/** An amount typed below the balance is THIS payment; the split helpers divide the rest. */
		typed,
		restMinor: balanceMinor - (typed ? entryAppliedMinor : 0),
		shareMinor: pickedMinor + (state.extraMinor ?? 0),
	};
}
