import type { PaymentTransport } from '@wcpos/order-math';

export type TenderTab = 'payments' | 'legacy';
export type TenderView = 'select' | 'amount' | 'cancel';

export type TenderPlan =
	| { kind: 'even'; ways: number; from: number }
	| { kind: 'fixed'; firstMinor: number; title: string | null; from: number }
	| { kind: 'items'; lineIds: number[]; firstMinor: number; ways: number; from: number };
export type SplitTab = 'even' | 'amount' | 'percent' | 'item';

export interface TenderState {
	tab: TenderTab;
	view: TenderView;
	/** Method id being tendered; null in the 'select' and 'cancel' views. */
	methodId: string | null;
	readerId: string | null;
	transport: PaymentTransport | null;
	/** Keypad entry in minor units. */
	entryMinor: number;
	/** False until the cashier has touched the keypad since the entry was pre-filled. */
	entryDirty: boolean;
	plan: TenderPlan | null;
	splitView: boolean;
	splitTab: SplitTab;
	pickedLineIds: number[];
	linesPaidBy: Record<number, string[]>;
}

/** '0'..'9' plus the two edit keys. There is deliberately no decimal key: digits shift in from the right. */
export type TenderKey =
	'0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'clear' | 'backspace';

export type TenderAction =
	| { type: 'set-tab'; tab: TenderTab }
	| {
			type: 'pick-method';
			methodId: string;
			prefillMinor: number;
			readerId: string | null;
			transport?: PaymentTransport | null;
	  }
	| { type: 'pick-transport'; transport: PaymentTransport }
	| { type: 'pick-reader'; readerId: string | null }
	| { type: 'tender-started' }
	| { type: 'key'; key: TenderKey }
	| { type: 'set-entry'; minor: number }
	| { type: 'back' }
	| {
			type: 'tender-recorded';
			rowsSinceFrom: { title: string; amountMinor: number }[];
			/** The order's balance once this row counts, so the next leg can be pre-typed. */
			balanceMinor: number;
	  }
	| { type: 'open-split' }
	| { type: 'close-split' }
	| { type: 'set-split-tab'; tab: SplitTab }
	| { type: 'toggle-split-line'; lineId: number }
	| { type: 'set-plan'; plan: TenderPlan; balanceMinor: number }
	| { type: 'clear-plan'; balanceMinor: number }
	| { type: 'arm-custom' }
	| { type: 'request-cancel' }
	| { type: 'reset' };
/** $9,999,999.99 at two decimals — a till will never legitimately take more, and it stops a stuck key running the display off the screen. */
export const MAX_TENDER_MINOR = 999999999;
export const initialTenderState: TenderState = {
	tab: 'payments',
	view: 'select',
	methodId: null,
	readerId: null,
	transport: null,
	entryMinor: 0,
	entryDirty: false,
	plan: null,
	splitView: false,
	splitTab: 'even',
	pickedLineIds: [],
	linesPaidBy: {},
};

/**
 * Reducer init. An order whose method the checkout store already holds — a URL seed, or a
 * tab the cashier is coming back to — reopens its keypad prefilled with the balance, exactly
 * as a tap on that tile would. Everything else starts from scratch.
 */
export function initTenderState({
	methodId,
	balanceMinor,
}: {
	methodId: string | null;
	balanceMinor: number;
}): TenderState {
	if (!methodId) return initialTenderState;
	return { ...initialTenderState, view: 'amount', methodId, entryMinor: balanceMinor };
}

export function tenderReducer(state: TenderState, action: TenderAction): TenderState {
	switch (action.type) {
		case 'set-tab':
			return { ...state, tab: action.tab };
		case 'pick-method':
			return {
				...state,
				view: 'amount',
				methodId: action.methodId,
				readerId: action.readerId,
				transport: action.transport ?? null,
				entryMinor: state.entryDirty ? state.entryMinor : action.prefillMinor,
				entryDirty: state.entryDirty,
			};
		case 'pick-transport':
			return { ...state, transport: action.transport };
		case 'pick-reader':
			return { ...state, readerId: action.readerId };
		case 'key': {
			if (state.view !== 'amount') {
				return state;
			}
			if (action.key === 'backspace') {
				return { ...state, entryMinor: Math.floor(state.entryMinor / 10), entryDirty: true };
			}
			if (action.key === 'clear') {
				return { ...state, entryMinor: 0, entryDirty: true };
			}
			const digit = Number(action.key);
			if (!state.entryDirty) {
				return { ...state, entryMinor: digit, entryDirty: true };
			}
			const entryMinor = state.entryMinor * 10 + digit;
			return entryMinor > MAX_TENDER_MINOR ? state : { ...state, entryMinor };
		}
		case 'set-entry':
			return {
				...state,
				entryMinor: Math.max(0, Math.min(action.minor, MAX_TENDER_MINOR)),
				entryDirty: true,
			};
		case 'tender-started':
			// A leg is being recorded: the method stays chosen for the next one; the entry
			// clears until `tender-recorded` pre-types the next planned leg.
			return { ...state, entryMinor: 0, entryDirty: false, splitView: false };
		case 'back':
			return {
				...state,
				view: 'select',
				methodId: null,
				readerId: null,
				transport: null,
				entryMinor: 0,
				entryDirty: false,
			};
		case 'tender-recorded': {
			const linesPaidBy = { ...state.linesPaidBy };
			if (
				state.plan?.kind === 'items' &&
				action.rowsSinceFrom.reduce((sum, row) => sum + row.amountMinor, 0) >= state.plan.firstMinor
			) {
				for (const id of state.plan.lineIds) {
					// Preserve the group's original methods when subsequently taking the rest.
					linesPaidBy[id] ??= [...new Set(action.rowsSinceFrom.map((row) => row.title))];
				}
			}
			// The method stays chosen for the next leg (the selector is always on screen now);
			// the entry pre-types the next planned leg, or the balance when no plan is left.
			const rows = action.rowsSinceFrom.map((row) => ({
				minor: row.amountMinor,
				title: row.title,
			}));
			const plan = activePlan(state.plan, rows.length, action.balanceMinor);
			const entryMinor = plan
				? planLegs(plan, rows, action.balanceMinor).thisPaymentMinor
				: action.balanceMinor;
			return {
				...state,
				view: state.methodId ? 'amount' : 'select',
				entryMinor,
				entryDirty: false,
				splitView: false,
				pickedLineIds: [],
				linesPaidBy,
			};
		}
		case 'open-split':
			return {
				...state,
				splitView: true,
				pickedLineIds:
					state.plan?.kind === 'items'
						? state.plan.lineIds.filter((id) => !state.linesPaidBy[id])
						: state.pickedLineIds,
			};
		case 'close-split':
			return { ...state, splitView: false };
		case 'set-split-tab':
			return { ...state, splitTab: action.tab };
		case 'toggle-split-line':
			if (state.linesPaidBy[action.lineId]) return state;
			return {
				...state,
				pickedLineIds: state.pickedLineIds.includes(action.lineId)
					? state.pickedLineIds.filter((id) => id !== action.lineId)
					: [...state.pickedLineIds, action.lineId],
			};
		case 'set-plan':
			return {
				...state,
				plan: action.plan,
				splitView: false,
				pickedLineIds: [],
				entryMinor:
					state.view === 'amount'
						? planLegs(action.plan, [], action.balanceMinor).thisPaymentMinor
						: state.entryMinor,
				entryDirty: state.view !== 'amount' && state.entryDirty,
			};
		case 'clear-plan':
		case 'arm-custom':
			return {
				...state,
				plan: null,
				splitView: false,
				view: action.type === 'arm-custom' ? 'amount' : state.view,
				entryMinor: action.type === 'clear-plan' ? action.balanceMinor : 0,
				entryDirty: false,
			};
		case 'request-cancel':
			return { ...state, view: 'cancel', splitView: false };
		case 'reset':
			return initialTenderState;
	}
}
/**
 * What the leg applies to the order. Cash may be tendered above the balance;
 * the excess is change, never an overpayment on the order.
 */
export function appliedMinor(entryMinor: number, balanceMinor: number): number {
	return Math.max(0, Math.min(entryMinor, balanceMinor));
}
/** Change handed back. Zero for any tender whose method cannot give change. */
export function changeMinor(
	entryMinor: number,
	appliedAmountMinor: number,
	givesChange: boolean
): number {
	return givesChange ? Math.max(0, entryMinor - appliedAmountMinor) : 0;
}
/**
 * Quick tendered amounts under a cash keypad: the balance itself, then the next
 * whole 5, 10 and 50 above it. Deduped, ascending, never below the balance.
 * The caller supplies those major-unit steps already scaled to minor units.
 */
export function quickTenderedAmounts(
	balanceMinor: number,
	stepsMinor: readonly number[]
): number[] {
	if (balanceMinor === 0) {
		return [];
	}

	const amounts = new Set<number>([balanceMinor]);
	for (const stepMinor of stepsMinor) {
		if (stepMinor <= 0) continue;
		const remainder = balanceMinor % stepMinor;
		amounts.add(remainder === 0 ? balanceMinor : balanceMinor + stepMinor - remainder);
	}
	return [...amounts].sort((left, right) => left - right);
}
/**
 * Even split shares. Returns the next tender's share, rounded half-up to the
 * minor unit; the last leg remains whatever balance is left.
 */
export function evenSplitShareMinor(balanceMinor: number, ways: number): number {
	if (ways < 2) {
		return balanceMinor;
	}
	const wholeShare = Math.floor(balanceMinor / ways);
	const remainder = balanceMinor % ways;
	return wholeShare + (remainder * 2 >= ways ? 1 : 0);
}

/** Completion is derived from payment rows, never an extra counter in the reducer. */
export function activePlan(
	plan: TenderPlan | null,
	taken: number,
	balanceMinor: number
): TenderPlan | null {
	if (!plan || balanceMinor === 0) return null;
	if (plan.kind !== 'items' && taken >= (plan.kind === 'even' ? plan.ways : 2)) return null;
	return plan;
}

export interface PlanLeg {
	minor: number;
	state: 'done' | 'now' | 'todo' | 'rest';
	title?: string;
}

/** Label pieces stay untranslated here; the flow supplies localized copy and item names. */
export function planLegs(
	plan: TenderPlan,
	rowsSinceFrom: { minor: number; title: string }[],
	balanceMinor: number
) {
	const taken = rowsSinceFrom.length;
	const legs: PlanLeg[] = rowsSinceFrom.map((row) => ({ ...row, state: 'done' }));
	const groupPaid = rowsSinceFrom.reduce((sum, row) => sum + row.minor, 0);
	const groupLeft =
		plan.kind === 'items'
			? Math.min(balanceMinor, Math.max(0, plan.firstMinor - groupPaid))
			: balanceMinor;
	const rest = plan.kind === 'items' && groupLeft === 0;
	const ways = plan.kind === 'fixed' ? 2 : Math.max(plan.ways, taken + 1);
	const left = plan.kind === 'fixed' || rest ? 1 : Math.max(1, ways - taken);
	const amount = rest ? balanceMinor : groupLeft;
	const each =
		plan.kind === 'fixed' && taken === 0
			? Math.min(plan.firstMinor, balanceMinor)
			: evenSplitShareMinor(amount, left);
	let remaining = amount;
	for (let i = 0; i < left; i++) {
		const minor = Math.min(remaining, i === left - 1 && plan.kind !== 'fixed' ? remaining : each);
		legs.push({ minor, state: i === 0 ? 'now' : 'todo' });
		remaining -= minor;
	}
	if (plan.kind === 'fixed' && remaining > 0) legs.push({ minor: remaining, state: 'todo' });
	if (plan.kind === 'items' && !rest && balanceMinor > groupLeft)
		legs.push({ minor: balanceMinor - groupLeft, state: 'rest' });
	const title = plan.kind === 'fixed' && taken === 0 ? plan.title : null;
	return { legs, thisPaymentMinor: each, label: { n: taken + 1, ways, rest, title } };
}
