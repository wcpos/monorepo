import get from 'lodash/get';

// Cloudflare marks managed challenge responses with the cf-mitigated header.
export const isBotChallengeError = (err: unknown): boolean => {
	const mitigated = get(err, ['response', 'headers', 'cf-mitigated']);
	return typeof mitigated === 'string' && mitigated.trim().toLowerCase() === 'challenge';
};
