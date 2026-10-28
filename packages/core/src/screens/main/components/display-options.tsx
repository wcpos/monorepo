import * as React from 'react';

import { useT } from '../../../contexts/translations';
import { UISettingsColumnsOnlyForm, UISettingsDialog } from './ui-settings';

/**
 * A page's display options: its columns in the same settings side panel the POS opens, so
 * display settings have one chrome app-wide. Restore defaults is the panel's footer action;
 * the columns form registers the page's reset with it.
 */
export function DisplayOptions({
	id,
	before,
}: {
	id: 'orders' | 'products' | 'customers' | 'coupons';
	/** A page's own settings above its columns. */
	before?: React.ReactNode;
}) {
	const t = useT();
	// A literal t() per key, so the string extractor sees each one: the trigger's label, the panel's title.
	const [open, title] = {
		orders: [t('orders.display_options'), t('orders.order_settings')],
		products: [t('products.display_options'), t('common.product_settings')],
		customers: [t('customers.display_options'), t('customers.customer_settings')],
		coupons: [t('coupons.display_options'), t('coupons.coupon_settings')],
	}[id];
	return (
		<UISettingsDialog
			title={title}
			triggerTestID={`${id}-bar-display`}
			triggerLabel={open}
			contentTestID={`${id}-display-options`}
			closeTestID={`${id}-display-close`}
			restoreTestID={`${id}-display-restore`}
		>
			<UISettingsColumnsOnlyForm id={id} before={before} />
		</UISettingsDialog>
	);
}
