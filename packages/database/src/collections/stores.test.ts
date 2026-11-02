import { AUTO_SYNCED_STORE_FIELDS, storesLiteral } from './schemas/stores';

describe('stores schema', () => {
	it('defaults scale to auto', () => {
		expect(storesLiteral.properties.scale.default).toBe('auto');
		expect(storesLiteral.version).toBe(0);
	});

	it('reads an unset icon family as auto', () => {
		expect(storesLiteral.properties.icons.enum).toEqual([
			'auto',
			'tabler',
			'hugeicons',
			'phosphor',
		]);
		expect(storesLiteral.properties.icons.default).toBe('auto');
		expect(storesLiteral.version).toBe(0);
	});

	it('defaults decimal quantities off and syncs the server setting', () => {
		expect(storesLiteral.properties).toHaveProperty('decimal_qty', {
			title: 'Decimal quantities',
			description: 'Whether the store accepts decimal quantities on POS orders.',
			type: 'boolean',
			default: false,
		});
		expect(AUTO_SYNCED_STORE_FIELDS).toContain('decimal_qty');
		expect(storesLiteral.version).toBe(0);
	});

	// The scale step is a device preference beside the theme: a login or a cashier
	// sync must never overwrite the step a merchant set on this screen.
	it('does not treat scale as a server-owned field', async () => {
		const { SERVER_OWNED_STORE_FIELDS } = await import('./schemas/stores');

		expect(SERVER_OWNED_STORE_FIELDS as readonly string[]).not.toContain('scale');
		expect(SERVER_OWNED_STORE_FIELDS as readonly string[]).not.toContain('icons');
		expect(SERVER_OWNED_STORE_FIELDS as readonly string[]).not.toContain('theme');
	});
});
