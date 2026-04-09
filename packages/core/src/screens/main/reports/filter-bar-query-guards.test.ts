import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('reports filter-bar query guards', () => {
	it('does not force non-null assertions on optional queries', () => {
		const reportsFilterBar = readFileSync(join(__dirname, 'filter-bar.tsx'), 'utf8');

		expect(reportsFilterBar).not.toContain('customerQuery!');
		expect(reportsFilterBar).not.toContain('cashierQuery!');
		expect(reportsFilterBar).toContain('customerQuery?.');
		expect(reportsFilterBar).toContain('cashierQuery?.');
	});

	it('skips the customer lookup when the selected customer is the guest customer', () => {
		const reportsFilterBar = readFileSync(join(__dirname, 'filter-bar.tsx'), 'utf8');

		expect(reportsFilterBar).toContain('customerID !== 0');
	});

	it('normalizes the selected customer id before creating the selected customer state', () => {
		const reportsFilterBar = readFileSync(join(__dirname, 'filter-bar.tsx'), 'utf8');

		expect(reportsFilterBar).toContain('const rawCustomerID = useObservableEagerState(');
		expect(reportsFilterBar).toContain('return toNumber(rawCustomerID as string | number);');
	});
});
