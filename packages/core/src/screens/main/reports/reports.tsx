import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { VStack } from '@wcpos/components/vstack';

import { Hero } from './hero';
import { PeriodSection } from './cards';
import { ReportsSyncProgress } from './sync-progress';

export function Reports({ title }: { title: React.ReactNode }) {
	const { bottom } = useSafeAreaInsets();
	return (
		<VStack
			testID="screen-reports"
			className="h-full"
			style={{ paddingBottom: bottom !== 0 ? bottom : undefined }}
		>
			<ErrorBoundary>
				<ReportsSyncProgress />
			</ErrorBoundary>
			<View className="flex-1">
				<ErrorBoundary>
					<ScrollView contentContainerClassName="gap-3 px-2">
						<Hero title={title} />
						<PeriodSection />
					</ScrollView>
				</ErrorBoundary>
			</View>
		</VStack>
	);
}
