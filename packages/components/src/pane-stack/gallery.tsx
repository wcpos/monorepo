import * as React from 'react';
import { View } from 'react-native';

import { Breadcrumb } from '../breadcrumb';
import { Button } from '../button';
import { Text } from '../text';
import { PaneStack } from './index';

const rows = (prefix: string, count: number) =>
	Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`);

function Rows({ labels, onPress }: { labels: string[]; onPress?: (label: string) => void }) {
	return labels.map((label) => (
		<View key={label} className="min-h-row border-border flex-row items-center border-b px-2">
			{onPress ? (
				<Button
					variant="ghost"
					size="sm"
					testID={`pane-row-${label}`}
					onPress={() => onPress(label)}
				>
					<Text>{label}</Text>
				</Button>
			) : (
				<Text>{label}</Text>
			)}
		</View>
	));
}

function Stage() {
	const [detail, setDetail] = React.useState<string | null>(null);
	return (
		<View className="border-border h-96 w-96 border">
			<PaneStack
				testID="pane-stack"
				detail={detail}
				paneClassName="bg-background"
				renderDetail={(parent) => (
					<View className="flex-1" testID="pane-detail">
						<Breadcrumb
							testID="pane-crumb"
							parents={[{ label: 'Products', onPress: () => setDetail(null) }]}
							here={parent}
							autoFocus
						/>
						<Rows labels={rows(`${parent} variation`, 6)} />
					</View>
				)}
			>
				<View className="flex-1" testID="pane-root">
					<Rows labels={rows('Product', 8)} onPress={setDetail} />
				</View>
			</PaneStack>
		</View>
	);
}

export const stories = [{ id: 'push', render: () => <Stage /> }];
