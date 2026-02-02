import { generateZReportHTML } from './generate-html';

const makeData = (overrides = {}) => ({
	storeName: 'Test Store',
	storeId: 1,
	reportGenerated: '2024-01-15 10:00:00',
	reportPeriod: { from: '2024-01-01', to: '2024-01-15' },
	cashierName: 'John',
	cashierId: 42,
	totalOrders: 10,
	total: '$1000.00',
	totalTax: '$100.00',
	netSales: '$900.00',
	discountTotal: '$50.00',
	paymentMethodsArray: [
		{ payment_method: 'cash', payment_method_title: 'Cash', total: '$500.00' },
		{ payment_method: 'card', payment_method_title: 'Card', total: '$500.00' },
	],
	taxTotalsArray: [{ rate_id: 1, label: 'GST', total: '$100.00' }],
	shippingTotalsArray: [],
	userStoreArray: [{ cashierId: '42', storeId: '1', totalOrders: 10, totalAmount: '$1000.00' }],
	totalItemsSold: '25',
	averageOrderValue: '$100.00',
	t: {
		reportGenerated: 'Report Generated',
		reportPeriodStart: 'Period Start',
		reportPeriodEnd: 'Period End',
		cashier: 'Cashier',
		salesSummary: 'Sales Summary',
		totalOrders: 'Total Orders',
		totalNetSales: 'Net Sales',
		totalTaxCollected: 'Tax Collected',
		totalSales: 'Total Sales',
		totalDiscounts: 'Discounts',
		paymentMethods: 'Payment Methods',
		unpaid: 'Unpaid',
		unknown: 'Unknown',
		taxes: 'Taxes',
		shipping: 'Shipping',
		cashierStoreTotals: 'Cashier/Store Totals',
		cashierId: 'Cashier ID',
		storeId: 'Store ID',
		additionalInfo: 'Additional Info',
		itemsSold: 'Items Sold',
		averageOrderValue: 'Avg Order Value',
	},
	...overrides,
});

describe('generateZReportHTML', () => {
	it('should return a valid HTML string', () => {
		const html = generateZReportHTML(makeData());
		expect(html).toContain('<!DOCTYPE html>');
		expect(html).toContain('</html>');
	});

	it('should include store name and ID', () => {
		const html = generateZReportHTML(makeData());
		expect(html).toContain('Test Store (ID: 1)');
	});

	it('should include cashier info', () => {
		const html = generateZReportHTML(makeData());
		expect(html).toContain('John (ID: 42)');
	});

	it('should include payment methods', () => {
		const html = generateZReportHTML(makeData());
		expect(html).toContain('Cash:');
		expect(html).toContain('Card:');
	});

	it('should translate unpaid payment method', () => {
		const data = makeData({
			paymentMethodsArray: [
				{ payment_method: 'unpaid', payment_method_title: 'Not Paid', total: '$100.00' },
			],
		});
		const html = generateZReportHTML(data);
		expect(html).toContain('Unpaid:');
	});

	it('should translate unknown payment method', () => {
		const data = makeData({
			paymentMethodsArray: [
				{ payment_method: 'unknown', payment_method_title: 'Whatever', total: '$50.00' },
			],
		});
		const html = generateZReportHTML(data);
		expect(html).toContain('Unknown:');
	});

	it('should include tax totals', () => {
		const html = generateZReportHTML(makeData());
		expect(html).toContain('GST:');
	});

	it('should not include shipping section when empty', () => {
		const html = generateZReportHTML(makeData());
		expect(html).not.toContain('Shipping</div>');
	});

	it('should include shipping section when present', () => {
		const data = makeData({
			shippingTotalsArray: [{ method_id: 'flat_rate', total: '$10.00' }],
		});
		const html = generateZReportHTML(data);
		expect(html).toContain('Shipping');
		expect(html).toContain('flat_rate:');
	});

	it('should not include user/store section for single user', () => {
		const html = generateZReportHTML(makeData());
		expect(html).not.toContain('Cashier/Store Totals');
	});

	it('should include user/store section for multiple users', () => {
		const data = makeData({
			userStoreArray: [
				{ cashierId: '42', storeId: '1', totalOrders: 5, totalAmount: '$500.00' },
				{ cashierId: '43', storeId: '2', totalOrders: 5, totalAmount: '$500.00' },
			],
		});
		const html = generateZReportHTML(data);
		expect(html).toContain('Cashier/Store Totals');
		expect(html).toContain('Cashier ID: 42');
		expect(html).toContain('Cashier ID: 43');
	});

	it('should include additional info section', () => {
		const html = generateZReportHTML(makeData());
		expect(html).toContain('Items Sold:');
		expect(html).toContain('25');
		expect(html).toContain('Average Order Value:');
	});
});
