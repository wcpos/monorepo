import * as React from 'react';
import { View } from 'react-native';

import { Button } from '../button';
import { Text } from '../text';
import { SlideOver } from './index';

function Stage({ from }: { from: 'top' | 'bottom' }) {
	const [open, setOpen] = React.useState(false);
	const bar = (
		<View className="bg-card border-border h-ctl flex-row items-center border-y px-2">
			<Button
				variant="ghost"
				size="sm"
				testID={`slide-over-toggle-${from}`}
				onPress={() => setOpen((value) => !value)}
			>
				<Text>{open ? 'Close' : 'Open'}</Text>
			</Button>
		</View>
	);
	return (
		<View className="border-border h-96 w-96 border">
			{from === 'top' && bar}
			<View className="flex-1">
				{Array.from({ length: 6 }, (_, index) => (
					<View key={index} className="min-h-row border-border justify-center border-b px-2">
						<Text>Line {index + 1}</Text>
					</View>
				))}
				<SlideOver
					open={open}
					from={from}
					className="absolute inset-0"
					coverClassName="bg-background"
					testID={`slide-over-${from}`}
				>
					{Array.from({ length: 4 }, (_, index) => (
						<View key={index} className="min-h-row border-border justify-center border-b px-2">
							<Text>Order {index + 1}</Text>
						</View>
					))}
				</SlideOver>
			</View>
			{from === 'bottom' && bar}
		</View>
	);
}

export const stories = [
	{ id: 'from-bottom', render: () => <Stage from="bottom" /> },
	{ id: 'from-top', render: () => <Stage from="top" /> },
];
