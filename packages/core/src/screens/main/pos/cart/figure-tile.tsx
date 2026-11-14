import { View } from 'react-native';

import { AmountFigure } from '@wcpos/components/amount-figure';
import { Text } from '@wcpos/components/text';

export function FigureTile({
	label,
	value,
	sub,
	testID,
}: {
	label: string;
	value: string;
	sub?: string;
	testID: string;
}) {
	return (
		<View testID={testID} className="border-border flex-1 rounded-lg border px-3 py-2.5">
			<Text variant="key">{label}</Text>
			<AmountFigure size="tile">{value}</AmountFigure>
			{sub && <Text variant="key">{sub}</Text>}
		</View>
	);
}
