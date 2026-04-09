import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('orders filter-bar query guards', () => {
	it('normalizes the selected customer id and keys the selected-customer query by that id', () => {
		const ordersFilterBar = readFileSync(join(__dirname, 'filter-bar.tsx'), 'utf8');

		expect(ordersFilterBar).toContain('const rawCustomerID = useObservableEagerState(');
		expect(ordersFilterBar).toContain('return toNumber(rawCustomerID as string | number);');
		expect(ordersFilterBar).toContain(
			"queryKeys: ['customers', 'orders-customer-filter', customerID ?? 'none']"
		);
		expect(ordersFilterBar).toContain('initialParams:');
		expect(ordersFilterBar).toContain('selector: { id: customerID }');
		expect(ordersFilterBar).not.toContain("queryKeys: ['customers', 'customer-filter']");
		expect(ordersFilterBar).not.toContain('.equals(customerID as unknown as number)');
	});
});
