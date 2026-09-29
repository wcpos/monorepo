import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@wcpos/components/icon';
import { Skeleton } from '@wcpos/components/skeleton';
import { Text } from '@wcpos/components/text';

export function ReportCard({
	testID,
	name,
	figure,
	onOpen,
	head,
	children,
}: React.PropsWithChildren<{
	testID: string;
	name: string;
	figure: string;
	onOpen?: () => void;
	head?: React.ReactNode;
}>) {
	const Head = onOpen ? Pressable : View;
	return (
		<View testID={testID} className="bg-card flex-1 gap-3 rounded-md border p-4">
			<Head
				className={`flex-row items-center justify-between gap-3 ${onOpen ? 'min-h-11 active:opacity-70' : ''}`}
				{...(onOpen
					? {
							testID: `${testID}-open`,
							onPress: onOpen,
							accessibilityRole: 'button' as const,
							accessibilityLabel: name,
						}
					: {})}
			>
				<Text className="text-muted-foreground min-w-0 flex-1 text-base">{name}</Text>
				<Text testID={`${testID}-figure`} className="text-foreground font-semibold tabular-nums">
					{figure}
				</Text>
				{onOpen && <Icon name="chevronRight" className="text-muted-foreground" />}
			</Head>
			{head}
			{children}
		</View>
	);
}
export function CardSkeleton({ testID, name }: { testID: string; name: string }) {
	return (
		<ReportCard testID={`${testID}-loading`} name={name} figure="">
			<Skeleton shape="line" className="w-full" />
			<Skeleton shape="line" className="w-1/2" />
		</ReportCard>
	);
}
