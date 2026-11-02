// Every screen that is not the POS, behind one dynamic root (see ./lazy.ts): modules
// these screens share stay in this chunk instead of being hoisted into the eager
// __common. Screens shared with the POS (receipt, header, drawer) are not here on purpose.
import * as React from 'react';

import { useT } from '../../../contexts/translations';
import { AreaPage } from '../components/navigation-area/area-page';
import {
	BarcodeScanning,
	CardReadersSettings,
	CustomerDisplaySettings,
	GeneralSettings,
	PrintingSettings,
	TaxSettings,
	ThemeSettings,
} from '../settings';

export { AddCouponScreen } from '../coupons/add';
export { AddCustomerScreen } from '../customers/add';
export { CouponsScreen } from '../coupons';
export { CustomersScreen } from '../customers';
export { DatabaseScreen } from '../health/database';
export { EditCouponScreen } from '../coupons/edit';
export { EditCustomerScreen } from '../customers/edit';
export { OrderScreen } from '../orders/edit';
export { EditProductScreen } from '../products/edit/product';
export { EditVariationScreen } from '../products/edit/variation';
export { LogsScreen } from '../logs';
export { MiniAppHost } from '../mini-apps';
export { OrdersScreen } from '../orders';
export { ProductsScreen } from '../products';
export { RefundOrderScreen } from '../orders/refund';
export { ReportsScreen } from '../reports';
export { Support } from '../support';
export {
	BarcodeScanning,
	CardReadersSettings,
	CustomerDisplaySettings,
	GeneralSettings,
	PrintingSettings,
	TaxSettings,
	ThemeSettings,
};

export function BarcodeScanningSettingsPage() {
	const t = useT();
	return (
		<AreaPage title={t('settings.barcode_scanning')} testID="screen-settings-barcode-scanning">
			<BarcodeScanning />
		</AreaPage>
	);
}

export function CardReadersSettingsPage() {
	const t = useT();
	return (
		<AreaPage title={t('settings.card_readers')} testID="screen-settings-card-readers">
			<CardReadersSettings />
		</AreaPage>
	);
}

export function CustomerDisplaySettingsPage() {
	const t = useT();
	return (
		<AreaPage
			title={t('settings.customer_display.title')}
			testID="screen-settings-customer-display"
		>
			<CustomerDisplaySettings />
		</AreaPage>
	);
}

export function GeneralSettingsPage() {
	const t = useT();
	return (
		<AreaPage title={t('settings.general')} testID="screen-settings-general">
			<GeneralSettings />
		</AreaPage>
	);
}

export function PrintingSettingsPage() {
	const t = useT();
	return (
		<AreaPage title={t('settings.printing')} testID="screen-settings-printing">
			<PrintingSettings />
		</AreaPage>
	);
}

export function TaxSettingsPage() {
	const t = useT();
	return (
		<AreaPage title={t('settings.tax')} testID="screen-settings-tax">
			<TaxSettings />
		</AreaPage>
	);
}

export function ThemeSettingsPage() {
	const t = useT();
	return (
		<AreaPage title={t('settings.theme')} testID="screen-settings-theme">
			<ThemeSettings />
		</AreaPage>
	);
}
