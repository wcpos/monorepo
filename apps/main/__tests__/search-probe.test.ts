import { createSearchProbe } from '../e2e/search-probe';

jest.mock('@wcpos/utils/logger', () => ({ log: { warn: jest.fn() } }));

jest.resetModules();

describe('createSearchProbe', () => {
	it('preserves category ids assigned by product creation', async () => {
		const request = {
			post: async () => ({
				ok: () => true,
				status: () => 201,
				json: async () => ({
					id: 7,
					slug: 'e2e-probe',
					categories: [{ id: 19 }],
				}),
			}),
		};

		const created = await createSearchProbe({
			request: request as never,
			storeUrl: 'https://example.test',
			authorization: null,
			collection: 'products',
			workerIndex: 0,
		});

		expect(created).toMatchObject({ ok: true, probe: { categoryIds: [19] } });
	});
});
