/**
 * The server's own sentence for a refused request, read from a WP REST error body.
 *
 * A WordPress fatal (memory exhausted, a plugin's uncaught exception) answers
 * 500 as `{ code: 'internal_server_error', message: '<p>There has been a
 * critical error on this website.</p>…' }` — the top-level `message` is the
 * localized boilerplate and names nothing. When the site exposes error details,
 * the PHP error itself rides in `data.error` in the `error_get_last()` shape
 * `{ type, message, file, line }`, and THAT sentence ("Allowed memory size of
 * 134217728 bytes exhausted") is the answer support needs, so it wins over the
 * boilerplate with `file:line` appended the way PHP reports a fatal. Sites that
 * hide error details send no `data.error`, so the top-level message stays the
 * fallback (#2439).
 */
export function readServerSentence(
	body: unknown,
	status: number | null | undefined
): string | undefined {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
	const error = body as Record<string, unknown>;
	// Only a 5xx is a fatal. A 4xx may carry a caller-defined `data.error` object
	// of its own (a gateway diagnostic under a validation message), and there the
	// top-level message is the one written for the cashier.
	const fatal =
		typeof status === 'number' && status >= 500 ? readWpFatalDetail(error.data) : undefined;
	if (fatal !== undefined) return fatal;
	if (typeof error.message !== 'string') return undefined;
	const message = stripTags(error.message);
	if (message.length === 0) return undefined;
	const params = error.code === 'rest_invalid_param' ? readInvalidParams(error.data) : undefined;
	return params ?? message;
}

/**
 * WordPress's `rest_invalid_param` message only lists the failing keys; WHY each failed is in
 * `data.params` (`{ email: 'Invalid email address.' }`). Each entry names its key, so it
 * replaces the message rather than trailing it: the ledger's 200-character cap cuts from the
 * end, which is where the reasons would sit.
 */
function readInvalidParams(data: unknown): string | undefined {
	if (typeof data !== 'object' || data === null) return undefined;
	const params = (data as Record<string, unknown>).params;
	if (typeof params !== 'object' || params === null) return undefined;
	const entries = Object.entries(params)
		.filter((entry): entry is [string, string] => typeof entry[1] === 'string')
		.map(([key, reason]) => `${key}: ${stripTags(reason)}`);
	return entries.length > 0 ? entries.join('; ') : undefined;
}

/**
 * The ledger observer (`sanitizeReason`) caps a quoted sentence at 200
 * characters, cutting from the END — exactly where the location is appended.
 * The whole sentence is therefore built to fit under it: the location is sized
 * first (shortened to its file name when even the WordPress-relative path is
 * long), and the PHP message takes whatever is left. A fatal's first line is a
 * sentence, but an uncaught exception's `message` runs on into a stack trace,
 * so only the first line is quoted.
 */
export const SERVER_SENTENCE_MAX_CHARS = 200;
/** The location may not squeeze the message below this; past it the path drops to its file name. */
const MIN_MESSAGE_CHARS = 80;

export function readWpFatalDetail(data: unknown): string | undefined {
	if (data === null || typeof data !== 'object') return undefined;
	const error = (data as Record<string, unknown>).error;
	if (error === null || typeof error !== 'object') return undefined;
	const { message: raw, file, line } = error as Record<string, unknown>;
	if (typeof raw !== 'string') return undefined;
	const firstLine = stripTags(raw.split('\n')[0] ?? '');
	if (firstLine === '') return undefined;
	const location = typeof file === 'string' && file !== '' ? fatalLocation(file, line) : '';
	const budget = Math.max(SERVER_SENTENCE_MAX_CHARS - location.length, MIN_MESSAGE_CHARS);
	const message = firstLine.length > budget ? `${firstLine.slice(0, budget - 1)}…` : firstLine;
	return `${message}${location}`;
}

/**
 * ` in wp-includes/class-wpdb.php:2324`. Everything before the WordPress root
 * (`/home/u123/domains/shop.example/public_html/`) is the host's directory
 * layout, which says nothing about the fault and eats the quote budget, so the
 * path starts at `wp-content/`, `wp-includes/` or `wp-admin/`; a path outside
 * those roots, or one still too long to leave the message its minimum, keeps
 * only its file name — the line number always survives.
 */
function fatalLocation(file: string, line: unknown): string {
	const suffix =
		typeof line === 'number' || (typeof line === 'string' && line !== '') ? `:${line}` : '';
	// A Windows host reports `C:\inetpub\wwwroot\wp-includes\class-wpdb.php`.
	const path = file.split('\\').join('/');
	const slash = path.lastIndexOf('/');
	const fileName = slash === -1 ? path : path.slice(slash + 1);
	const maxLocation = SERVER_SENTENCE_MAX_CHARS - MIN_MESSAGE_CHARS;
	for (const root of ['/wp-content/', '/wp-includes/', '/wp-admin/']) {
		const at = path.indexOf(root);
		if (at === -1) continue;
		const location = ` in ${path.slice(at + 1)}${suffix}`;
		if (location.length <= maxLocation) return location;
		break;
	}
	const location = ` in ${fileName}${suffix}`;
	if (location.length <= maxLocation) return location;
	// Even the file name is absurd: keep its tail (extension) and the line number.
	const room = maxLocation - ` in …${suffix}`.length;
	return ` in …${fileName.slice(fileName.length - room)}${suffix}`;
}

/**
 * WordPress ships its error copy as HTML — the critical-error boilerplate is
 * `<p>…</p><p><a href="…">Learn more…</a></p>` — and the sentence is quoted on a
 * ledger row and in toasts, where tags would render literally. Entities are left
 * alone: the renderer decodes them.
 */
// Longest tag WordPress error copy emits is the troubleshooting link (~90 chars).
const TAG_MAX = 256;
const TAG_START = /[A-Za-z/!]/;
// Tag names WordPress and WooCommerce put in error copy, plus HTML comments.
// Attributes must be `name=value`: `and`/`z` are bare attribute names in HTML too, so
// `x<a and z>2` would otherwise read as an `<a>` tag and lose the sentence's middle.
const KNOWN_TAG =
	/^(?:\/?(?:p|a|br|b|strong|i|em|u|code|pre|span|div|ul|ol|li|h[1-6])(?:\s+[A-Za-z_:][A-Za-z0-9:._-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=`]+))*\s*\/?|!--[\s\S]*--|!\[CDATA\[[\s\S]*\]\])$/i;

function stripTags(html: string): string {
	// A linear scan rather than a `<[^>]*>` regex: on server-controlled input that
	// regex is polynomial on a run of `<` (CodeQL js/polynomial-redos), and the
	// scan keeps a lone `<` with no closing `>` as the literal it is.
	let text = '';
	let cursor = 0;
	while (cursor < html.length) {
		const open = html.indexOf('<', cursor);
		if (open === -1) {
			text += html.slice(cursor);
			break;
		}
		// Only tag syntax opens a tag: `<p`, `</p>`, `<!-- -->`. A `<` before a space,
		// a digit, another `<` or the end of the text is a comparison operator in a
		// PHP sentence ("Expected x < 5 and y > 2") and is kept, with its `>`.
		if (!TAG_START.test(html.charAt(open + 1))) {
			text += html.slice(cursor, open + 1);
			cursor = open + 1;
			continue;
		}
		// Look for the closing `>` only within TAG_MAX chars, so a crafted body of
		// `<a<a<a…>` costs a bounded window per `<` and the scan stays linear.
		const window = html.slice(open + 1, open + 1 + TAG_MAX);
		const closeInWindow = window.indexOf('>');
		// The run between `<` and `>` must be one of the tags WordPress's error copy
		// uses (or a comment); `x<y and z>2` is a sentence, not markup, and is kept.
		if (closeInWindow === -1 || !KNOWN_TAG.test(window.slice(0, closeInWindow))) {
			text += html.slice(cursor, open + 1);
			cursor = open + 1;
			continue;
		}
		text += `${html.slice(cursor, open)} `;
		cursor = open + 1 + closeInWindow + 1;
	}
	return text.replace(/\s+/g, ' ').trim();
}
