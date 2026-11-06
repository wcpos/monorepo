import * as React from 'react';
import { View } from 'react-native';

import { useT } from '@wcpos/core/contexts/translations';

import { PriceKeypad, type PriceKeypadHandle, type PriceKeypadProps } from './index';

function TranslatedPriceKeypad(props: Omit<PriceKeypadProps, 'labels' | 'format' | 'onChange'>) {
	const t = useT();
	return (
		<PriceKeypad
			{...props}
			format={(value) => `£${value.toFixed(2)}`}
			onChange={() => {}}
			labels={{
				backspace: t('common.backspace'),
				done: t('common.done'),
				discount: (percent) => t('pos_cart.discount_percent', { percent: String(percent) }),
				discountKey: (percent) => `−${percent}%`,
			}}
		/>
	);
}

function OpenPriceKeypad() {
	const ref = React.useRef<PriceKeypadHandle>(null);
	// Open the uncontrolled keypad once on mount for the isolated gallery shot.
	React.useEffect(() => {
		ref.current?.focus();
	}, []);
	return (
		<View className="h-96 w-64">
			<TranslatedPriceKeypad
				ref={ref}
				rest="text"
				value={3.2}
				discounts={[5, 10, 15]}
				testID="gallery-price-keypad-open"
			/>
		</View>
	);
}

export const stories = [
	{
		id: 'quiet',
		render: () => (
			<View className="w-64">
				<TranslatedPriceKeypad
					rest="text"
					value={3.2}
					discounts={[5, 10, 15]}
					testID="gallery-price-keypad-quiet"
				/>
			</View>
		),
	},
	{
		id: 'field',
		render: () => (
			<View className="w-64">
				<TranslatedPriceKeypad rest="field" value={12.5} testID="gallery-price-keypad-field" />
			</View>
		),
	},
	{
		id: 'blank',
		render: () => (
			<View className="w-64">
				<TranslatedPriceKeypad
					rest="field"
					placeholder="No minimum"
					testID="gallery-price-keypad-blank"
				/>
			</View>
		),
	},
	{
		id: 'invalid',
		render: () => (
			<View className="w-64">
				<TranslatedPriceKeypad
					rest="field"
					value={12.5}
					invalid
					testID="gallery-price-keypad-invalid"
				/>
			</View>
		),
	},
	{
		id: 'disabled',
		render: () => (
			<View className="w-64">
				<TranslatedPriceKeypad
					rest="text"
					value={3.2}
					disabled
					testID="gallery-price-keypad-disabled"
				/>
			</View>
		),
	},
	{
		id: 'key',
		render: () => (
			<View className="h-12 w-24">
				<TranslatedPriceKeypad rest="key" value={10} testID="gallery-price-keypad-key" />
			</View>
		),
	},
	{ id: 'open', isolated: true, render: () => <OpenPriceKeypad /> },
];
