import * as React from 'react';

import { useT } from '../../../contexts/translations';
import { UISettingsColumnsOnlyForm, UISettingsDialog } from './ui-settings';

// Literal keys per page, so the translation check sees each one.
const OPEN_LABELS = {
	orders: 'orders.display_options',
	products: 'products.display_options',
	customers: 'customers.display_options',
	coupons: 'coupons.display_options',
} as const;

/**
 * A page's display options: its columns in the same settings side panel the POS opens, so
 * display settings have one chrome app-wide. Restore defaults is the panel's footer action;
 * the columns form registers the page's reset with it.
 */
export function DisplayOptions({
	id,
	title,
	testID = id,
}: {
	id: 'orders' | 'products' | 'customers' | 'coupons';
	title: string;
	testID?: string;
}) {
	const t = useT();
	return (
		<UISettingsDialog
			title={title}
			triggerTestID={`${testID}-bar-display`}
			triggerLabel={t(OPEN_LABELS[id])}
			contentTestID={`${testID}-display-options`}
			closeTestID={`${testID}-display-close`}
			restoreTestID={`${testID}-display-restore`}
		>
			<UISettingsColumnsOnlyForm id={id} />
		</UISettingsDialog>
	);
}
