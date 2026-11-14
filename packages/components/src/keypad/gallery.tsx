import { View } from 'react-native';

import { useT } from '@wcpos/core/contexts/translations';

import { Keypad, type KeypadKey } from './index';

const digits = [
	['1', '2', '3'],
	['4', '5', '6'],
	['7', '8', '9'],
].map((row) => row.map((name) => ({ name, label: name })));
const zero: KeypadKey = { name: '0', label: '0', span: 2 };
const numeric = [...digits, [zero, { name: '.', label: '.' }]];
const icons = (t: (key: string) => string) => [
	...digits,
	[
		{ name: 'clear', icon: 'close' as const, label: t('common.clear') },
		{ name: '0', label: '0' },
		{ name: 'backspace', icon: 'backspace' as const, label: t('common.backspace') },
	],
];
function TranslatedKeypad({
	rows,
	...props
}: Omit<React.ComponentProps<typeof Keypad>, 'rows'> & { rows: typeof numeric | typeof icons }) {
	const t = useT();
	return <Keypad {...props} rows={typeof rows === 'function' ? rows(t) : rows} />;
}
export const stories = Object.entries({
	numeric,
	icons,
	shrink: numeric,
	wide: [[zero, { name: '.', label: '.' }]],
}).map(([id, rows]) => ({
	id,
	render: () => (
		<View className={id === 'shrink' ? 'h-56 w-64' : 'w-64'}>
			<TranslatedKeypad
				rows={rows}
				fit={id === 'shrink' ? 'shrink' : 'tile'}
				onPress={() => {}}
				testID={`gallery-keypad-${id}`}
			/>
		</View>
	),
}));
