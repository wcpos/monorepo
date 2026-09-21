import get from 'lodash/get';

// Cloudflare marks managed challenge responses with the cf-mitigated header.
// Both transports deliver lower-cased header names (axios's AxiosHeaders and
// the Electron bridge's `Headers.entries()`), but the lookup does not rely on
// that: a mixed-case key from any other path must not slip past the check.
export const isBotChallengeError = (err: unknown): boolean => {
	const headers: unknown = get(err, ['response', 'headers']);
	if (!headers || typeof headers !== 'object') return false;
	const key = Object.keys(headers).find((name) => name.toLowerCase() === 'cf-mitigated');
	const mitigated = key === undefined ? undefined : (headers as Record<string, unknown>)[key];
	return typeof mitigated === 'string' && mitigated.trim().toLowerCase() === 'challenge';
};
