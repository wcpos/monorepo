/**
 * The drawer tile's formatted figure as the count field's inputs to try, in order. The last
 * separator is the decimal point when one or two digits follow it. When exactly three follow, the
 * figure alone cannot say whether it is a thousands separator or a three-decimal point, so both
 * readings are returned, the thousands reading first.
 */
export function cashInputs(figure: string): string[] {
	const number = /\d[\d.,'\s\u00A0\u202F]*/.exec(figure)?.[0].replace(/[^\d]+$/, '') ?? '';
	const decimals = /[.,](\d{1,3})$/.exec(number)?.[1];
	const digits = number.replace(/\D/g, '');
	if (!decimals) return [digits];
	const whole = number.slice(0, -decimals.length - 1).replace(/\D/g, '');
	const decimal = `${whole}.${decimals}`;
	return decimals.length === 3 ? [digits, decimal] : [decimal];
}
