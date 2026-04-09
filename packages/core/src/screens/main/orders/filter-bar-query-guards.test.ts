import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('orders filter-bar query guards', () => {
	it('normalizes the selected customer id before querying the customers collection', () => {
		const ordersFilterBar = readFileSync(join(__dirname, 'filter-bar.tsx'), 'utf8');

		expect(ordersFilterBar).toContain('const rawCustomerID = useObservableEagerState(');
		expect(ordersFilterBar).toContain('return toNumber(rawCustomerID as string | number);');
		expect(ordersFilterBar).not.toContain('.equals(customerID as unknown as number)');
	});
});
