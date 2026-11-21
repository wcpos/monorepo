/**
 * Whether a cart line's quantity may go below 0: a return inside the sale (± on the quantity
 * keypad), allowed while the sale still totals 0 or more (`pos.checkout_negative_total`).
 *
 * Always on today. A fiscal module (a jurisdiction whose receipts may not carry a negative line)
 * turns it off here, and the quantity keypad loses its ± key; nothing else reads it.
 */
export function signedQuantityAllowed(): boolean {
	return true;
}
