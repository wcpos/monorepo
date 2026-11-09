import * as React from 'react';
import { Platform } from 'react-native';

import { Text } from '@wcpos/components/text';
import { Tile } from '@wcpos/components/tile';

import { type CurrencyFormatOptions, useCurrencyFormat } from '../../hooks/use-currency-format';

export function DenominationTile({
	currencyOptions,
	value,
	pieces,
	add,
}: {
	currencyOptions?: CurrencyFormatOptions;
	value: string;
	pieces: number;
	add: (pieces: number) => void;
}) {
	const { format } = useCurrencyFormat(currencyOptions);
	const held = React.useRef(false);
	const timer = React.useRef<ReturnType<typeof setInterval> | undefined>(undefined);
	const stop = () => clearInterval(timer.current);
	// A held tile must stop ticking when the fold or count view unmounts.
	React.useEffect(() => () => clearInterval(timer.current), []);
	return (
		<Tile
			testID={`den-tile-${value}`}
			badge={pieces}
			accessibilityLabel={format(Number(value))}
			// Web otherwise adds its default 50 ms press-in delay to the hold duration.
			{...(Platform.OS === 'web' ? { delayPressIn: 0 } : {})}
			delayLongPress={400}
			onPressIn={() => {
				held.current = false;
			}}
			onLongPress={() => {
				held.current = true;
				add(10);
				timer.current = setInterval(() => add(10), 150);
			}}
			onPressOut={stop}
			onPress={() => {
				if (!held.current) add(1);
			}}
		>
			<Text
				variant="key"
				className="max-w-full tabular-nums"
				numberOfLines={1}
				adjustsFontSizeToFit
			>
				{format(Number(value))}
			</Text>
		</Tile>
	);
}
