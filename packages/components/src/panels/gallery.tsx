import { View } from 'react-native';

import { Text } from '../text';
import { Panel, PanelGroup, PanelResizeHandle } from './index';

export const stories = (['horizontal', 'vertical'] as const).map((direction) => ({
	id: direction,
	render: () => (
		<View className="h-48">
			<PanelGroup direction={direction}>
				<Panel>
					<Text>Products</Text>
				</Panel>
				<PanelResizeHandle testID={`gallery-handle-${direction}`} />
				<Panel>
					<Text>Cart</Text>
				</Panel>
			</PanelGroup>
		</View>
	),
}));
