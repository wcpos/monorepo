/**
 * Gravatar answers a hash it does not know with the `d` (or `default`) picture, and WordPress
 * and WooCommerce ask for `d=mm`: the grey silhouette, which loads and so never falls back. Any
 * host under gravatar.com (www, secure, 0-2) serving `/avatar/`, with or without a scheme.
 */
const GRAVATAR_AVATAR_URL = /^(?:https?:)?\/\/(?:[a-z0-9-]+\.)*gravatar\.com\/avatar\//i;

/**
 * Dropped before `d=404` is appended: the default (`d`/`default`), and the force-default flag
 * (`f`/`forcedefault`, any value), which serves the default for EVERY hash and would reduce a
 * person with a real Gravatar to initials.
 */
const DROPPED_PARAM = /^(?:amp;)?(?:d|default|f|forcedefault)(?:=|$)/i;

/** True when `url` is a Gravatar avatar URL. */
export function isGravatarUrl(url: string | null | undefined): boolean {
	return typeof url === 'string' && GRAVATAR_AVATAR_URL.test(url);
}

/**
 * Rewrite a Gravatar URL's default to `404`, so an email with no Gravatar fails to load and
 * the initials render instead of the silhouette. Every other URL (an upload, a custom avatar
 * plugin) is returned untouched. String surgery, not `URL`: React Native's `URL` has no
 * writable `searchParams`. `amp;` covers a URL that arrives HTML-escaped.
 */
export function withoutDefaultGravatar(url: string): string;
export function withoutDefaultGravatar(url: string | null | undefined): string | undefined;
export function withoutDefaultGravatar(url: string | null | undefined): string | undefined {
	if (url == null) return undefined;
	if (!isGravatarUrl(url)) return url;
	const hashAt = url.indexOf('#');
	const fragment = hashAt === -1 ? '' : url.slice(hashAt);
	const withoutFragment = hashAt === -1 ? url : url.slice(0, hashAt);
	const queryAt = withoutFragment.indexOf('?');
	const base = queryAt === -1 ? withoutFragment : withoutFragment.slice(0, queryAt);
	const query = queryAt === -1 ? '' : withoutFragment.slice(queryAt + 1);
	const params = query.split('&').filter((param) => param !== '' && !DROPPED_PARAM.test(param));
	params.push('d=404');
	return `${base}?${params.join('&')}${fragment}`;
}
