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
});
