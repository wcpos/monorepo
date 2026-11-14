/**
 * Test fixture: how a fake Woo server reads an `after` / `before` / `modified_after`
 * bound sent with `dates_are_gmt`. Woo compares the string with the `_gmt` column, so a
 * bound without a zone suffix is GMT. Bare `Date.parse()` would read it as host-local time.
 */
export function parseWooGmtSeconds(value: string): number {
	const zoned = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
	return Date.parse(zoned ? value : `${value}Z`) / 1_000;
}
