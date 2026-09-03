export type TenderTab = 'payments' | 'legacy';
export type TenderView = 'select' | 'amount' | 'cancel';

export interface TenderState {
	tab: TenderTab;
	view: TenderView;
	/** Method id being tendered; null in the 'select' and 'cancel' views. */
	methodId: string | null;
	/** Keypad entry in minor units. */
	entryMinor: number;
	/** False until the cashier has touched the keypad since the entry was pre-filled. */
	entryDirty: boolean;
	/** Pre-fill, in minor units, for the NEXT tender, set from the split menu. */
	splitShareMinor: number | null;
	splitMenuOpen: boolean;
}

/** '0'..'9' plus the two edit keys. There is deliberately no decimal key: digits shift in from the right. */
export type TenderKey =
	'0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'clear' | 'backspace';

export type TenderAction =
	| { type: 'set-tab'; tab: TenderTab }
	| { type: 'pick-method'; methodId: string; prefillMinor: number }
	| { type: 'key'; key: TenderKey }
	| { type: 'set-entry'; minor: number }
	| { type: 'back' }
	| { type: 'tender-recorded' }
	| { type: 'open-split-menu' }
	| { type: 'close-split-menu' }
	| { type: 'set-split-share'; minor: number | null }
	| { type: 'request-cancel' }
	| { type: 'reset' };
/** $9,999,999.99 at two decimals — a till will never legitimately take more, and it stops a stuck key running the display off the screen. */
export const MAX_TENDER_MINOR = 999999999;
export const initialTenderState: TenderState = {
	tab: 'payments',
	view: 'select',
	methodId: null,
	entryMinor: 0,
	entryDirty: false,
	splitShareMinor: null,
	splitMenuOpen: false,
};

export function tenderReducer(state: TenderState, action: TenderAction): TenderState {
	switch (action.type) {
		case 'set-tab':
			return { ...state, tab: action.tab };
		case 'pick-method':
			return {
				...state,
				view: 'amount',
				methodId: action.methodId,
				entryMinor: action.prefillMinor,
				entryDirty: false,
				splitShareMinor: null,
				splitMenuOpen: false,
			};
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
		case 'back':
			return {
				...state,
				view: 'select',
				methodId: null,
				entryMinor: 0,
				entryDirty: false,
			};
		case 'tender-recorded':
			return {
				...state,
				view: 'select',
				methodId: null,
				entryMinor: 0,
				entryDirty: false,
				splitShareMinor: null,
			};
		case 'open-split-menu':
			return { ...state, splitMenuOpen: true };
		case 'close-split-menu':
			return { ...state, splitMenuOpen: false };
		case 'set-split-share':
			return { ...state, splitShareMinor: action.minor, splitMenuOpen: false };
		case 'request-cancel':
			return { ...state, view: 'cancel', splitMenuOpen: false };
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
