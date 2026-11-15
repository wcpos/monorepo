/**
 * A GMT bound for a Woo REST query sent with `dates_are_gmt`: `YYYY-MM-DDTHH:MM:SS`,
 * no milliseconds, no zone suffix. WordPress reads a suffixed string as an instant and
 * converts it to SITE time before comparing it with the `_gmt` column
 * (WP_Date_Query::build_mysql_datetime), which moves the window by the site offset.
 */
export function wooGmtDate(epochSeconds: number): string {
	return new Date(epochSeconds * 1_000).toISOString().slice(0, 19);
}
