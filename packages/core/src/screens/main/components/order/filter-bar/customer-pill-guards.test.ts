import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('customer pill guards', () => {
	it('uses the selected combobox customer item to seed the pill label immediately', () => {
		const customerPill = readFileSync(join(__dirname, 'customer-pill.tsx'), 'utf8');

		expect(customerPill).toContain(
			'const [selectedCustomer, setSelectedCustomer] = React.useState'
		);
		expect(customerPill).toContain('setSelectedCustomer(option.item ?? null);');
		expect(customerPill).toContain('if (selectedCustomer?.id === customerID)');
		expect(customerPill).toContain('extractNameFromJSON(customer)');
	});
});
