import ZSchemaModule from 'z-schema';

import { storesLiteral } from './stores';

/**
 * Validates against the real store schema with the same validator RxDB installs in
 * dev builds (`wrappedValidateZSchemaStorage` wraps z-schema). Production builds run
 * unvalidated, so a schema that is too narrow does not fail there — it fails for
 * developers, and it would fail for merchants the moment validation is ever turned
 * on. That asymmetry is why these are pinned here rather than left to be noticed.
 */
// The package is CJS with a `default` key; whether the import already unwraps it
// depends on the interop setting, so accept either shape.
const ZSchema = ((ZSchemaModule as unknown as { default?: unknown }).default ?? ZSchemaModule) as {
	create: () => { validate: (doc: unknown, schema: unknown) => boolean };
};

function validateStore(doc: Record<string, unknown>) {
	// This z-schema build throws on an invalid document rather than returning false.
	return ZSchema.create().validate(doc, storesLiteral as unknown as object);
}

it('the validator itself is wired up — a bad schema path would make every case vacuous', () => {
	expect(typeof ZSchema.create).toBe('function');
	expect(validateStore({ localID: 'a' })).toBe(true);
});

describe('stores schema — shipping_tax_class', () => {
	/**
	 * The regression. Tax classes are user-definable in WooCommerce, and
	 * TaxClassSelect builds its options from the server's tax-class list, so a
	 * merchant who adds "luxury" can select it for shipping. The schema used to
	 * enum only WooCommerce's four built-in classes and rejected it.
	 */
	it('accepts a merchant-defined tax class', () => {
		expect(() => validateStore({ localID: 'a', shipping_tax_class: 'luxury' })).not.toThrow();
	});

	/**
	 * The two values that are not slugs still have to pass: 'inherit' means "follow
	 * the cart items", and '' is how WooCommerce REST spells the standard class.
	 */
	it.each(['inherit', '', 'reduced-rate', 'zero-rate'])(
		'still accepts the built-in value %p',
		(value) => {
			expect(() => validateStore({ localID: 'a', shipping_tax_class: value })).not.toThrow();
		}
	);

	it('still rejects a non-string', () => {
		expect(() => validateStore({ localID: 'a', shipping_tax_class: 42 })).toThrow();
	});
});
