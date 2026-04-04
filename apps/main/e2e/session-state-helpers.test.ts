import { extractSessionIdsFromDatabases, findRxStateStoreTarget } from './session-state-helpers';

describe('session-state-helpers', () => {
	it('extracts IDs from legacy RxDB document stores', () => {
		const databases = [
			{
				name: 'wcposusers_v2',
				version: 1,
				stores: [
					{
						name: 'sites-8-documents',
						records: [{ i: 'site-local-id', d: { uuid: 'site-uuid', url: 'https://dev-free.wcpos.com' } }],
					},
					{
						name: 'wp_credentials-8-documents',
						records: [{ i: 'cred-local-id', d: { uuid: 'cred-uuid', access_token: 'token' } }],
					},
					{
						name: 'stores-8-documents',
						records: [{ i: 'store-local-id', d: { localID: 'store-local-id', id: 1, name: 'Main Store' } }],
					},
				],
			},
		];

		expect(extractSessionIdsFromDatabases(databases as any)).toEqual({
			siteID: 'site-uuid',
			wpCredentialsID: 'cred-uuid',
			storeID: 'store-local-id',
		});
	});

	it('extracts IDs when store names no longer end with -documents', () => {
		const databases = [
			{
				name: 'wcposusers_v3',
				version: 3,
				stores: [
					{
						name: 'sites-8',
						records: [{ i: 'site-local-id', d: { uuid: 'site-uuid', url: 'https://dev-free.wcpos.com' } }],
					},
					{
						name: 'wp_credentials-8',
						records: [
							{
								i: 'cred-local-id',
								d: { uuid: 'cred-uuid', access_token: 'token', stores: ['store-from-wp-user'] },
							},
						],
					},
				],
			},
		];

		expect(extractSessionIdsFromDatabases(databases as any)).toEqual({
			siteID: 'site-uuid',
			wpCredentialsID: 'cred-uuid',
			storeID: 'store-from-wp-user',
		});
	});

	it('finds the rx-state-v2 target store without relying on suffix', () => {
		const databases = [
			{
				name: 'wcposusers_v3',
				version: 5,
				stores: [{ name: 'rx-state-v2-abc123', records: [] }],
			},
		];

		expect(findRxStateStoreTarget(databases as any)).toEqual({
			dbName: 'wcposusers_v3',
			dbVersion: 5,
			storeName: 'rx-state-v2-abc123',
		});
	});
});
