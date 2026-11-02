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
			roles: ['administrator', '', 123, 'administrator'],
			capabilities: ['edit_products', '', 123, 'edit_products', 'publish_products'],
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
			capabilities: ['edit_products', 'publish_products'],
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

	it('preserves an explicitly empty roles array', () => {
		expect(sanitizeWPCredentialsData({ uuid: 'cred-2', roles: [] })).toEqual({
			uuid: 'cred-2',
			roles: [],
		});
	});

	it('preserves an explicitly empty capabilities array', () => {
		expect(sanitizeWPCredentialsData({ uuid: 'cred-2', capabilities: [] })).toEqual({
			uuid: 'cred-2',
			capabilities: [],
		});
	});

	it('falls back to the legacy role when roles entries are invalid', () => {
		expect(
			sanitizeWPCredentialsData({
				uuid: 'cred-3',
				role: 'editor',
				roles: ['', 123],
			})
		).toEqual({
			uuid: 'cred-3',
			roles: ['editor'],
		});
	});
});

describe('wp_credentials schema', () => {
	it('uses schema version 0 with the optional capabilities field', async () => {
		const { wpCredentialsLiteral } = await import('./schemas/wp-credientials');

		expect(wpCredentialsLiteral.version).toBe(0);
	});
});
