import * as React from 'react';
import { View } from 'react-native';

import { Text } from '../text';
import { ScrollableTabsList, Tabs, TabsContent, TabsList, TabsTrigger } from './index';

// The overflow arrows' names come from the caller, as the app's caller translates them.
function LabelledScrollableTabsList(props: React.ComponentProps<typeof TabsList>) {
	return <ScrollableTabsList {...props} previousLabel="Previous tab" nextLabel="Next tab" />;
}

function Example({ disabled = false, scrollable = false }) {
	const [value, setValue] = React.useState('Form');
	const List = scrollable ? LabelledScrollableTabsList : TabsList;
	const labels = scrollable
		? ['Form', 'JSON', 'Preview', 'Details', 'History', 'Notes', 'Settings', 'Activity']
		: ['Form', 'JSON', 'Preview'];
	return (
		<Tabs value={value} onValueChange={setValue}>
			<List>
				{labels.map((label, index) => (
					<TabsTrigger
						key={label}
						value={label}
						label={label}
						disabled={disabled && index === 2}
						testID={`gallery-tab-${label}`}
					>
						<Text>{label}</Text>
					</TabsTrigger>
				))}
			</List>
			<TabsContent value={value}>
				<Text>Item details</Text>
			</TabsContent>
		</Tabs>
	);
}

export const stories = [
	{ id: 'default', render: () => <Example /> },
	{ id: 'disabled', render: () => <Example disabled /> },
	{
		id: 'scrollable',
		render: () => (
			<View className="w-80">
				<Example scrollable />
			</View>
		),
	},
];
