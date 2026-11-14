import {
	APP_EDITABLE_STORE_FIELDS,
	AUTO_SYNCED_STORE_FIELDS,
	storesLiteral,
} from './schemas/stores';

describe('stores schema', () => {
	it('defaults scale to auto', () => {
		expect(storesLiteral.properties.scale.default).toBe('auto');
		expect(storesLiteral.version).toBe(1);
	});

	it('reads an unset icon family as auto', () => {
		expect(storesLiteral.properties.icons.enum).toEqual([
			'auto',
			'tabler',
			'hugeicons',
			'phosphor',
		]);
		expect(storesLiteral.properties.icons.default).toBe('auto');
		expect(storesLiteral.version).toBe(1);
	});

	// The type set beside the icon family: version 1 added it with a pass-through migration (#3205).
	it('reads an unset type set as auto', () => {
		expect(storesLiteral.properties.fonts.enum).toEqual([
			'auto',
			'system',
			'instrument',
			'grotesk',
			'fraunces',
			'manrope',
		]);
		expect(storesLiteral.properties.fonts.default).toBe('auto');
		expect(storesLiteral.version).toBe(1);
	});

	it('defaults decimal quantities off and syncs the server setting', () => {
		expect(storesLiteral.properties).toHaveProperty('decimal_qty', {
			title: 'Decimal quantities',
			description: 'Whether the store accepts decimal quantities on POS orders.',
			type: 'boolean',
			default: false,
		});
		expect(AUTO_SYNCED_STORE_FIELDS).toContain('decimal_qty');
		expect(storesLiteral.version).toBe(1);
	});

	// Settings > Tax lets the till pick how tax is based and how prices and tax
	// totals are shown; a hydration or cashier sync must not put the store's value
	// back (monorepo#3377). The calculation inputs stay server-owned and synced.
	it('keeps the tax display choices local and syncs the calculation inputs', () => {
		for (const field of [
			'tax_based_on',
			'tax_display_shop',
			'tax_display_cart',
			'price_display_suffix',
			'tax_total_display',
		]) {
			expect(APP_EDITABLE_STORE_FIELDS).toContain(field);
			expect(AUTO_SYNCED_STORE_FIELDS).not.toContain(field);
		}
		for (const field of [
			'calc_taxes',
			'prices_include_tax',
			'shipping_tax_class',
			'tax_round_at_subtotal',
		]) {
			expect(AUTO_SYNCED_STORE_FIELDS).toContain(field);
		}
	});

	// The scale step is a device preference beside the theme: a login or a cashier
	// sync must never overwrite the step a merchant set on this screen.
	it('does not treat scale as a server-owned field', async () => {
		const { SERVER_OWNED_STORE_FIELDS } = await import('./schemas/stores');

		expect(SERVER_OWNED_STORE_FIELDS as readonly string[]).not.toContain('scale');
		expect(SERVER_OWNED_STORE_FIELDS as readonly string[]).not.toContain('icons');
		expect(SERVER_OWNED_STORE_FIELDS as readonly string[]).not.toContain('fonts');
		expect(SERVER_OWNED_STORE_FIELDS as readonly string[]).not.toContain('theme');
	});
});
