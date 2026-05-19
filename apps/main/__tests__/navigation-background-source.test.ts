import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appRoot = join(__dirname, '..');

const navigatorLayouts = [
	'app/(auth)/_layout.tsx',
	'app/(app)/_layout.tsx',
	'app/(app)/(drawer)/_layout.tsx',
	'app/(app)/(drawer)/(pos)/_layout.tsx',
	'app/(app)/(drawer)/(pos)/(tabs)/_layout.tsx',
	'app/(app)/(drawer)/coupons/_layout.tsx',
	'app/(app)/(drawer)/customers/_layout.tsx',
	'app/(app)/(drawer)/orders/_layout.tsx',
	'app/(app)/(drawer)/products/_layout.tsx',
];

describe('web theme background bridge', () => {
	it('keeps navigator backgrounds theme-aware without reintroducing native Uniwind subscriptions', () => {
		for (const layout of navigatorLayouts) {
			const source = readFileSync(join(appRoot, layout), 'utf8');

			expect(source).toContain('useNavigationBackground');
			expect(source).toContain('screenBackgroundColor');
		}
	});
});
