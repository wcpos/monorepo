import * as React from 'react';
import { View } from 'react-native';

import { useRootContext } from '@rn-primitives/hover-card';

import * as C from './index';
import { Text } from '../text';
function Panel() {
	const onOpenChange = React.useRef(useRootContext().onOpenChange);
	// Open the external primitive once for the gallery; these roots are uncontrolled.
	React.useEffect(() => onOpenChange.current(true), []);
	return (
		<View className="border-border bg-background relative h-96 w-full overflow-hidden rounded-lg border">
			<C.HoverCardTrigger testID="customer">
				<Text>Paul K</Text>
			</C.HoverCardTrigger>
			<C.HoverCardContent inline align="start" testID="gallery-hover-card">
				<Text>Paul K</Text>
				<Text>Customer since 2024</Text>
			</C.HoverCardContent>
		</View>
	);
}
export const stories = [
	{
		id: 'card',
		render: () => (
			<C.HoverCard>
				<Panel />
			</C.HoverCard>
		),
	},
];
