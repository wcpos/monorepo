import * as React from 'react';
import { View } from 'react-native';

import { Skeleton } from '@wcpos/components/skeleton';
import { Text } from '@wcpos/components/text';

export function ReportCard({
	testID,
	name,
	figure,
	head,
	children,
}: React.PropsWithChildren<{
	testID: string;
	name: string;
	figure: string;
	head?: React.ReactNode;
}>) {
	return (
		<View testID={testID} className="bg-card flex-1 gap-3 rounded-md border p-4">
			<View className="flex-row items-center justify-between gap-3">
				<Text className="text-muted-foreground min-w-0 flex-1 text-base">{name}</Text>
				<Text testID={`${testID}-figure`} className="text-foreground font-semibold tabular-nums">
					{figure}
				</Text>
			</View>
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
