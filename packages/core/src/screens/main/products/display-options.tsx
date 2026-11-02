import * as React from 'react';

import { FormSegmentedControl } from '@wcpos/components/form';
import { useDocField } from '@wcpos/query';

import { useT } from '../../../contexts/translations';
import { DisplayOptions } from '../components/display-options';
import { useUISettings } from '../contexts/ui-settings';

/**
 * The POS panel's variations style, shown and written here too: the Products page and the POS
 * products panel open a variable product's variations the same way, from one setting. It sits
 * inside the columns form (`before`), so it draws that form's label, though it writes its own doc.
 */
function VariationsStyle() {
	const t = useT();
	const { uiSettings, patchUI } = useUISettings('pos-products');
	const value = useDocField(uiSettings, (doc) => doc.variationsStyle) ?? 'drill';
	return (
		// A field of the panel, though not of the columns form's values: it writes pos-products.
		<FormSegmentedControl
			name="variationsStyle"
			onBlur={() => undefined}
			label={t('pos_products.variations_style')}
			testID="products-variations-style"
			value={value}
			onChange={(variationsStyle: string) => void patchUI({ variationsStyle })}
			segments={[
				{ value: 'drill', label: t('pos_products.variations_open_in_place') },
				// This page is always a table: no popover here.
				{ value: 'inline', label: t('pos_products.variations_expanded_rows') },
			]}
		/>
	);
}

export function ProductsDisplayOptions() {
	return <DisplayOptions id="products" before={<VariationsStyle />} />;
}
