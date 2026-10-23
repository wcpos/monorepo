// Every screen that is not the POS, behind one dynamic root (see ./lazy.ts): modules
// these screens share stay in this chunk instead of being hoisted into the eager
// __common. Screens shared with the POS (receipt, header, drawer) are not here on purpose.
import * as React from 'react';

import { useT } from '../../../contexts/translations';
import {
	BarcodeScanning,
	CardReadersSettings,
	CustomerDisplaySettings,
	GeneralSettings,
	PrintingSettings,
	SettingsPage,
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
	SettingsPage,
	TaxSettings,
	ThemeSettings,
};

export function BarcodeScanningSettingsPage() {
	const t = useT();
	return (
		<SettingsPage title={t('settings.barcode_scanning')} testID="screen-settings-barcode-scanning">
			<BarcodeScanning />
		</SettingsPage>
	);
}

export function CardReadersSettingsPage() {
	const t = useT();
	return (
		<SettingsPage title={t('settings.card_readers')} testID="screen-settings-card-readers">
			<CardReadersSettings />
		</SettingsPage>
	);
}

export function CustomerDisplaySettingsPage() {
	const t = useT();
	return (
		<SettingsPage
			title={t('settings.customer_display.title')}
			testID="screen-settings-customer-display"
		>
			<CustomerDisplaySettings />
		</SettingsPage>
	);
}

export function GeneralSettingsPage() {
	const t = useT();
	return (
		<SettingsPage title={t('settings.general')} testID="screen-settings-general">
			<GeneralSettings />
		</SettingsPage>
	);
}

export function PrintingSettingsPage() {
	const t = useT();
	return (
		<SettingsPage title={t('settings.printing')} testID="screen-settings-printing">
			<PrintingSettings />
		</SettingsPage>
	);
}

export function TaxSettingsPage() {
	const t = useT();
	return (
		<SettingsPage title={t('settings.tax')} testID="screen-settings-tax">
			<TaxSettings />
		</SettingsPage>
	);
}

export function ThemeSettingsPage() {
	const t = useT();
	return (
		<SettingsPage title={t('settings.theme')} testID="screen-settings-theme">
			<ThemeSettings />
		</SettingsPage>
	);
}
