import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('filter-bar loading localization', () => {
	it('uses the translation key instead of a hardcoded loading label in both pills', () => {
		const customerPill = readFileSync(join(__dirname, 'customer-pill.tsx'), 'utf8');
		const cashierPill = readFileSync(join(__dirname, 'cashier-pill.tsx'), 'utf8');

		expect(customerPill).toContain("t('common.loading')");
		expect(cashierPill).toContain("t('common.loading')");
		expect(customerPill).not.toContain("'Loading...'");
		expect(cashierPill).not.toContain("'Loading...'");
	});

	it('defines the loading translation string', () => {
		const translations = JSON.parse(
			readFileSync(
				join(__dirname, '../../../../../contexts/translations/locales/en/core.json'),
				'utf8'
			)
		) as Record<string, string>;

		expect(translations['common.loading']).toBeDefined();
	});
});
