import { View } from 'react-native';

import { Keypad, type KeypadKeyDescriptor } from './index';

const digits = [
	['1', '2', '3'],
	['4', '5', '6'],
	['7', '8', '9'],
].map((row) => row.map((value) => ({ value, label: value })));
const zero: KeypadKeyDescriptor = { value: '0', label: '0', span: 2 };
const numeric = [...digits, [zero, { value: '.', label: '.' }]];
const icons = [
	...digits,
	[
		{ value: 'clear', icon: 'xmark' as const },
		{ value: '0', label: '0' },
		{ value: 'backspace', icon: 'deleteLeft' as const },
	],
];
export const stories = Object.entries({
	numeric,
	icons,
	shrink: numeric,
	wide: [[zero, { value: '.', label: '.' }]],
}).map(([id, rows]) => ({
	id,
	render: () => (
		<View className={id === 'shrink' ? 'h-56 w-64' : 'w-64'}>
			<Keypad
				rows={rows}
				fit={id === 'shrink' ? 'shrink' : 'tile'}
				onPress={() => {}}
				testID={`gallery-keypad-${id}`}
			/>
		</View>
	),
}));
