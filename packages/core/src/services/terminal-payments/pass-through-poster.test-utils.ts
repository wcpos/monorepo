import type { MoneyCommandPoster } from '@wcpos/query';

/**
 * A money command poster for tests that exercise a leg or the service, not the envelope: it
 * posts straight through, and its mirror, settle and abandon do nothing (the service's own `mirror`
 * option is what those tests observe). The envelope itself is pinned in query's
 * `money-command.test.ts` and, through a real poster, in `service.journal.test.ts`.
 */
export function passThroughPoster(
	post: (url: string, body: unknown) => Promise<{ data: unknown }>
): MoneyCommandPoster {
	return Object.assign((url: string, body: unknown) => post(url, body), {
		mirror: async () => undefined,
		settle: async () => undefined,
		abandon: async () => undefined,
		retire: async () => undefined,
	});
}
