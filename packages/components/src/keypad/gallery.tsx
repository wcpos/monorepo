import { View } from 'react-native';

import { useT } from '@wcpos/core/contexts/translations';

import { decimalRow, DIGIT_ROWS, Keypad, type KeypadKey } from './index';

const numeric = (t: (key: string) => string) => [
	...DIGIT_ROWS,
	decimalRow('.', t('common.backspace')),
];
const icons = (t: (key: string) => string): KeypadKey[][] => [
	...DIGIT_ROWS,
	[
		{ name: 'clear', icon: 'close', label: t('common.clear') },
		{ name: '0', label: '0' },
		{ name: 'backspace', icon: 'backspace', label: t('common.backspace') },
	],
];
const wide = (t: (key: string) => string) => [decimalRow(undefined, t('common.backspace'))];

function TranslatedKeypad({
	rows,
	...props
}: Omit<React.ComponentProps<typeof Keypad>, 'rows'> & { rows: typeof icons }) {
	const t = useT();
	return <Keypad {...props} rows={rows(t)} />;
}
export const stories = Object.entries({ numeric, icons, shrink: numeric, wide }).map(
	([id, rows]) => ({
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
	})
);
