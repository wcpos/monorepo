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
		id: 'preview',
		render: () => (
			<Breadcrumb testID="preview" parents={parents} here="Tote bag">
				<View className="bg-muted size-7" />
				<Text>Tote bag</Text>
			</Breadcrumb>
		),
	},
];
