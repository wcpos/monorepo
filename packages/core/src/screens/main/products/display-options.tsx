import * as React from 'react';
import { View } from 'react-native';

import { SegmentedControl } from '@wcpos/components/segmented-control';
import { Text } from '@wcpos/components/text';
import { useDocField } from '@wcpos/query';

import { useT } from '../../../contexts/translations';
import { DisplayOptions } from '../components/display-options';
import { useUISettings } from '../contexts/ui-settings';

/**
 * The POS panel's variations style, shown and written here too: the Products page and the POS
 * products panel open a variable product's variations the same way, from one setting.
 */
function VariationsStyle() {
	const t = useT();
	const { uiSettings, patchUI } = useUISettings('pos-products');
	const value = useDocField(uiSettings, (doc) => doc.variationsStyle) ?? 'drill';
	return (
		<View className="gap-1 px-1">
			<Text>{t('pos_products.variations_style')}</Text>
			<SegmentedControl
				aria-label={t('pos_products.variations_style')}
				value={value}
				onValueChange={(variationsStyle) => void patchUI({ variationsStyle })}
				segments={[
					{
						value: 'drill',
						label: t('pos_products.variations_open_in_place'),
						testID: 'products-variations-style-drill',
					},
					{
						value: 'inline',
						// This page is always a table: no popover here.
						label: t('pos_products.variations_expanded_rows'),
						testID: 'products-variations-style-inline',
					},
				]}
			/>
		</View>
	);
}

export function ProductsDisplayOptions() {
	return <DisplayOptions id="products" before={<VariationsStyle />} />;
}
