import * as React from 'react';
import { View } from 'react-native';

import { useRootContext } from '@rn-primitives/popover';

import * as C from './index';
import { Text } from '../text';
import { Button } from '../button';
import { DeviceScope } from '../lib/device';
function Panel() {
	const onOpenChange = React.useRef(useRootContext().onOpenChange);
	// Open the external primitive once for the gallery; these roots are uncontrolled.
	React.useEffect(() => onOpenChange.current(true), []);
	return (
		<>
			<C.PopoverTrigger asChild>
				<Button testID="cart-settings">
					<Text>Cart settings</Text>
				</Button>
			</C.PopoverTrigger>
			<C.PopoverContent inline align="start" avoidCollisions={false} testID="gallery-popover">
				{['Cart settings', 'Prices include tax', 'Receipts print automatically'].map((line) => (
					<Text key={line}>{line}</Text>
				))}
			</C.PopoverContent>
		</>
	);
}
export const stories = ['anchored', 'sheet'].map((id) => ({
	id,
	isolated: id === 'anchored',
	render: () => (
		<DeviceScope phone={id === 'sheet'}>
			<View
				className={`border-border bg-background relative h-96 ${id === 'sheet' ? 'w-80' : 'w-full'} overflow-hidden rounded-lg border [&>*]:flex-1`}
			>
				<C.Popover>
					<Panel />
				</C.Popover>
			</View>
		</DeviceScope>
	),
}));
