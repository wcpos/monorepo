import { describe, expect, it } from 'vitest';

import { createLiveChangeSignalSource } from './change-signal-source';

function response(checkpoint: Record<string, unknown>): Response {
	return new Response(
		JSON.stringify({
			changes: [],
			checkpoint,
			complete: true,
		}),
		{ status: 200, headers: { 'content-type': 'application/json' } }
	);
}

describe('createLiveChangeSignalSource — sequence-log checkpoint head', () => {
	it('maps checkpoint.head onto the sequence-log page', async () => {
		const source = createLiveChangeSignalSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async () => response({ since: 7, head: '42' }),
		});

		await expect(
			source.pollSequenceLog({ cursor: { sequence: 5 }, limit: 100 })
		).resolves.toMatchObject({ cursor: { sequence: 7 }, head: 42 });
	});

	it('leaves head undefined when the checkpoint omits it', async () => {
		const source = createLiveChangeSignalSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async () => response({ since: 7 }),
		});

		const page = await source.pollSequenceLog({ cursor: { sequence: 5 }, limit: 100 });

		expect(page.head).toBeUndefined();
	});
});
