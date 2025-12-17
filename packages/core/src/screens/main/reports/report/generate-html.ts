interface ReportData {
	storeName: string;
	storeId: number;
	reportGenerated: string;
	reportPeriod: {
		from: string;
		to: string;
	};
	cashierName: string;
	cashierId: number;
	totalOrders: number;
	total: string;
	totalTax: string;
	netSales: string;
	discountTotal: string;
	paymentMethodsArray: Array<{
		payment_method: string;
		payment_method_title: string;
		total: string;
	}>;
	taxTotalsArray: Array<{
		rate_id: number;
		label: string;
		total: string;
	}>;
	shippingTotalsArray: Array<{
		method_id: string;
		total: string;
	}>;
	userStoreArray: Array<{
		cashierId: string;
		storeId: string;
		totalOrders: number;
		totalAmount: string;
	}>;
	totalItemsSold: string;
	averageOrderValue: string;
	// Translation function results
	t: {
		reportGenerated: string;
		reportPeriodStart: string;
		reportPeriodEnd: string;
		cashier: string;
		salesSummary: string;
		totalOrders: string;
		totalNetSales: string;
		totalTaxCollected: string;
		totalSales: string;
		totalDiscounts: string;
		paymentMethods: string;
		unpaid: string;
		unknown: string;
		taxes: string;
		shipping: string;
		cashierStoreTotals: string;
		cashierId: string;
		storeId: string;
		additionalInfo: string;
		itemsSold: string;
		averageOrderValue: string;
	};
}

const styles = `
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}
		body {
			font-family: 'Courier New', Courier, monospace;
			font-size: 14px;
			line-height: 1.4;
			color: #000;
			padding: 10px;
		}
		.bold {
			font-weight: bold;
		}
		.center {
			text-align: center;
		}
		.uppercase {
			text-transform: uppercase;
		}
		.row {
			display: flex;
			justify-content: space-between;
		}
		.row > span {
			flex: 1;
		}
		.row > span:last-child {
			text-align: right;
		}
		.line {
			border-bottom: 1px solid #999;
			margin: 8px 0;
		}
		.br {
			height: 16px;
		}
		@media print {
			body {
				padding: 0;
			}
		}
	</style>
`;

/**
 * Generates HTML string for the ZReport.
 * This mirrors the React Native template.tsx component structure.
 */
export function generateZReportHTML(data: ReportData): string {
	const {
		storeName,
		storeId,
		reportGenerated,
		reportPeriod,
		cashierName,
		cashierId,
		totalOrders,
		total,
		totalTax,
		netSales,
		discountTotal,
		paymentMethodsArray,
		taxTotalsArray,
		shippingTotalsArray,
		userStoreArray,
		totalItemsSold,
		averageOrderValue,
		t,
	} = data;

	// Helper to create a row
	const row = (label: string, value: string, bold = false) => `
		<div class="row${bold ? ' bold' : ''}">
			<span>${label}</span>
			<span>${value}</span>
		</div>
	`;

	// Payment methods section
	const paymentMethodsHTML = paymentMethodsArray
		.map(({ payment_method, payment_method_title, total }) => {
			let label = payment_method_title;
			if (payment_method === 'unpaid') {
				label = t.unpaid;
			} else if (payment_method === 'unknown') {
				label = t.unknown;
			}
			return row(`${label}:`, total);
		})
		.join('');

	// Tax totals section
	const taxTotalsHTML = taxTotalsArray.map(({ label, total }) => row(`${label}:`, total)).join('');

	// Shipping section (only if there are shipping totals)
	const shippingHTML =
		shippingTotalsArray.length > 0
			? `
		<div class="line"></div>
		<div class="center uppercase">${t.shipping}</div>
		<div class="line"></div>
		${shippingTotalsArray.map(({ method_id, total }) => row(`${method_id}:`, total)).join('')}
		<div class="br"></div>
	`
			: '';

	// User/Store totals section (only if multiple cashiers/stores)
	const userStoreHTML =
		userStoreArray.length > 1
			? `
		<div class="line"></div>
		<div class="center uppercase">${t.cashierStoreTotals}</div>
		<div class="line"></div>
		${userStoreArray
			.map(
				({ cashierId, storeId, totalOrders, totalAmount }) => `
			<div class="row">
				<span style="flex: 2">${t.cashierId}: ${cashierId} - ${t.storeId}: ${storeId}</span>
				<span>${totalOrders}</span>
				<span>${totalAmount}</span>
			</div>
		`
			)
			.join('')}
		<div class="br"></div>
	`
			: '';

	return `
		<!DOCTYPE html>
		<html>
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			${styles}
		</head>
		<body>
			<div class="bold">${storeName} (ID: ${storeId})</div>
			<div>${t.reportGenerated}: ${reportGenerated}</div>
			<div>${t.reportPeriodStart}: ${reportPeriod.from}</div>
			<div>${t.reportPeriodEnd}: ${reportPeriod.to}</div>
			<div>${t.cashier}: ${cashierName} (ID: ${cashierId})</div>
			<div class="br"></div>

			<div class="line"></div>
			<div class="center uppercase">${t.salesSummary}</div>
			<div class="line"></div>
			${row('Total Orders:', String(totalOrders))}
			${row('Total Net Sales:', netSales)}
			${row('Total Tax Collected:', totalTax)}
			${row('Total Sales:', total, true)}
			${row('Total Discounts:', discountTotal)}
			<div class="br"></div>

			<div class="line"></div>
			<div class="center uppercase">${t.paymentMethods}</div>
			<div class="line"></div>
			${paymentMethodsHTML}
			<div class="br"></div>

			<div class="line"></div>
			<div class="center uppercase">${t.taxes}</div>
			<div class="line"></div>
			${taxTotalsHTML}
			<div class="br"></div>

			${shippingHTML}

			${userStoreHTML}

			<div class="line"></div>
			<div class="center uppercase">${t.additionalInfo}</div>
			<div class="line"></div>
			${row('Items Sold:', totalItemsSold)}
			${row('Average Order Value:', averageOrderValue)}
			<div class="br"></div>
		</body>
		</html>
	`;
}
