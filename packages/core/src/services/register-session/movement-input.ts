/**
 * The server's cash-movement grammar, mirrored on the device.
 *
 * `Sessions_Controller::movement_fields()` refuses a movement whose amount is not a plain
 * unsigned decimal string, whose integer part carries more than fifteen significant digits,
 * whose paid in/out amount is not positive, or whose reason is blank or over 500 characters.
 * Gating the confirm button on `Number(amount) > 0` alone let several of those through, and a
 * refused movement is cash that has already physically moved: the row is marked permanently
 * failed and never reaches the ledger.
 */
const SERVER_DECIMAL = /^\d+(?:\.\d+)?$/;
const MAX_INTEGER_DIGITS = 15;
const MAX_REASON_LENGTH = 500;

export type MovementType = 'paid_in' | 'paid_out' | 'no_sale';

/**
 * Rewrite what a keypad produced into the server's grammar, but only where the cashier's
 * intent is unambiguous: a bare leading or trailing point is a half-typed number, and a comma
 * followed by one or two digits is a decimal separator on a Spanish or German keypad.
 *
 * The digit count is the whole safeguard. `"1,000"` is a thousands separator to an English
 * cashier on a hardware keyboard and a decimal to nobody, so converting it would silently
 * record a movement of ONE — money quietly lost, which is the exact failure this module
 * exists to prevent. Anything ambiguous is left as typed so it fails visibly instead.
 */
const KEYPAD_DECIMAL_COMMA = /^(\d+),(\d{1,2})$/;
export function normalizeAmount(raw: string): string {
	const trimmed = raw.trim();
	const dotted = trimmed.replace(KEYPAD_DECIMAL_COMMA, '$1.$2');
	return dotted.replace(/^\./, '0.').replace(/\.$/, '');
}

/** Whether the server's `decimal()` would accept this string. */
export function isServerDecimal(value: string): boolean {
	if (!SERVER_DECIMAL.test(value)) return false;
	return value.split('.')[0].replace(/^0+/, '').length <= MAX_INTEGER_DIGITS;
}

/**
 * The field the server would name in its 400, or null when it would accept the movement.
 * A no sale carries no amount — the sheet sends '0' — but still needs a reason.
 */
export function movementFieldError(input: {
	type: MovementType;
	amount: string;
	reason: string;
}): 'amount' | 'reason' | null {
	if (input.type !== 'no_sale') {
		const amount = normalizeAmount(input.amount);
		if (!isServerDecimal(amount) || Number(amount) <= 0) return 'amount';
	}
	const reason = input.reason.trim();
	if (!reason || reason.length > MAX_REASON_LENGTH) return 'reason';
	return null;
}
