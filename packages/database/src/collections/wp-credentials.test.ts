import { sanitizeWPCredentialsData } from './wp-credentials';

describe('sanitizeWPCredentialsData', () => {
	it('drops token_type and unknown fields before wp_credentials documents are persisted', () => {
		const sanitized = sanitizeWPCredentialsData({
			uuid: '71d74953-eb1a-42ee-9960-46b624b9fa7b',
			id: 1,
			username: 'admin',
			email: 'paul@example.com',
			first_name: '',
			last_name: '',
			nice_name: 'admin',
			display_name: 'admin',
			role: 'administrator',
			roles: ['administrator', '', 123],
			avatar_url: 'https://example.com/avatar.jpg',
			access_token: 'access-token',
			refresh_token: 'refresh-token',
			token_type: 'Bearer',
			expires_at: 123456,
			stores: ['store-1'],
			unexpected_server_field: 'do-not-persist',
		});

		expect(sanitized).toEqual({
			uuid: '71d74953-eb1a-42ee-9960-46b624b9fa7b',
			id: 1,
			username: 'admin',
			email: 'paul@example.com',
			first_name: '',
			last_name: '',
			nice_name: 'admin',
			display_name: 'admin',
			roles: ['administrator'],
			avatar_url: 'https://example.com/avatar.jpg',
			access_token: 'access-token',
			refresh_token: 'refresh-token',
			expires_at: 123456,
			stores: ['store-1'],
		});
	});

	it('converts a legacy role string to the roles array', () => {
		expect(sanitizeWPCredentialsData({ uuid: 'cred-1', role: 'shop_manager' })).toEqual({
			uuid: 'cred-1',
			roles: ['shop_manager'],
		});
	});
});

describe('wp_credentials migration strategy', () => {
	it('strips token_type while migrating legacy wp_credentials documents to schema v3', async () => {
		const { userCollections } = await import('./index');
		const migrateToV3 = userCollections.wp_credentials.migrationStrategies?.[3];

		expect(typeof migrateToV3).toBe('function');
		expect(
			migrateToV3?.({
				uuid: 'cred-1',
				role: 'administrator',
				token_type: 'Bearer',
				access_token: 'access-token',
			})
		).toEqual({
			uuid: 'cred-1',
			roles: ['administrator'],
			access_token: 'access-token',
		});
	});
});
