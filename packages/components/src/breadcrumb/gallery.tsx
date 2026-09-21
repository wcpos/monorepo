import { View } from 'react-native';

import { Text } from '../text';
import { Breadcrumb } from './index';

const parents = [{ label: 'Products', onPress: () => {} }] as const;
export const stories = [
	{
		id: 'place',
		render: () => <Breadcrumb testID="place" parents={parents} here="Tote bag" />,
	},
	{
		id: 'detail',
		render: () => (
			<Breadcrumb testID="detail" parents={parents} here="Tote bag" detail="· 12 variations" />
		),
	},
	{
		id: 'back',
		render: () => <Breadcrumb testID="back" parents={[{ label: 'Closures', onPress: () => {} }]} />,
	},
	{
		// A long translated label in a narrow pane: the row must grow rather than overflow
		// (ledger line 4). Without this cell the wrapping contract is invisible to the
		// baseline set, which is what the review of #2188 exposed.
		id: 'wrapped',
		render: () => (
			<View className="w-56">
				<Breadcrumb
					testID="wrapped"
					parents={[{ label: 'Produkte und Kategorien', onPress: () => {} }]}
					here="Umweltfreundliche Einkaufstasche"
				/>
			</View>
		),
	},
	{
		id: 'preview',
		render: () => (
			<Breadcrumb testID="preview" parents={parents} here="Tote bag">
				<View className="bg-muted size-7" />
				<Text>Tote bag</Text>
			</Breadcrumb>
		),
	},
];
