export function pingProbeUrl(wpAPIURL: string): string {
	const base = wpAPIURL.endsWith('/') ? wpAPIURL : `${wpAPIURL}/`;
	const querySeparator = wpAPIURL.includes('rest_route=') ? '&' : '?';

	return `${base}wcpos/v2/ping${querySeparator}wcpos=1`;
}
