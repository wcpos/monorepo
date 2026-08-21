/**
 * Whether the connected server accepts a BARE JWT in `?authorization=`.
 *
 * WAF regexes that block the auth-param fallback trip on the literal
 * `Bearer ` prefix in the query string, not on the JWT. The plugin accepts
 * the bare form from 1.10.0 (Services\Auth::extract_token, free#1644);
 * every released 1.9.x hard-requires the prefix via sscanf, so an unknown
 * or older version must keep it — sending bare there breaks auth outright.
 */
export function bareAuthParamSupported(wcposVersion: string | null | undefined): boolean {
	const [, major, minor] = wcposVersion?.match(/^(\d+)\.(\d+)/) ?? [];
	return (
		major !== undefined &&
		minor !== undefined &&
		(Number(major) > 1 || (Number(major) === 1 && Number(minor) >= 10))
	);
}

export function formatAuthorizationParam(token: string, bareSupported: boolean): string {
	return bareSupported ? token : `Bearer ${token}`;
}
