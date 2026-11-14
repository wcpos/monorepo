import * as React from 'react';
import { View } from 'react-native';

import { PriceKeypad, type PriceKeypadHandle, type PriceKeypadProps } from './index';

// The gallery route mounts no store, so no TranslationProvider: the labels are the English the
// cashier sees, written here (as the browse gallery bundles its own English) rather than raw keys.
const labels: PriceKeypadProps['labels'] = {
	backspace: 'Delete last digit',
	done: 'Done',
	discount: (percent) => `Discount (${percent}%)`,
	discountKey: (percent) => `−${percent}%`,
};
const format = (value: number) => `£${value.toFixed(2)}`;

// Keeps a committed price, so a Done in the gallery shows what was typed instead of snapping back.
function GalleryPriceKeypad({
	value: initial,
	...props
}: Omit<PriceKeypadProps, 'labels' | 'format' | 'onChange'>) {
	const [value, setValue] = React.useState(initial);
	return (
		<PriceKeypad {...props} value={value} format={format} labels={labels} onChange={setValue} />
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
			<GalleryPriceKeypad
				ref={ref}
				inline
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
				<GalleryPriceKeypad
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
				<GalleryPriceKeypad rest="field" value={12.5} testID="gallery-price-keypad-field" />
			</View>
		),
	},
	{
		id: 'blank',
		render: () => (
			<View className="w-64">
				<GalleryPriceKeypad
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
				<GalleryPriceKeypad
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
				<GalleryPriceKeypad
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
				<GalleryPriceKeypad rest="key" value={10} testID="gallery-price-keypad-key" />
			</View>
		),
	},
	{ id: 'open', isolated: true, render: () => <OpenPriceKeypad /> },
];
