import * as React from 'react';

import { Card, CardDescription, CardHeader, CardTitle } from '@wcpos/components/card';
import { VStack } from '@wcpos/components/vstack';

export function HealthPlaceholder({
	title,
	subtitle,
	testID,
}: {
	title: string;
	subtitle: string;
	testID: string;
}) {
	return (
		<VStack testID={testID} className="flex-1 p-4 md:p-6">
			<Card className="max-w-2xl">
				<CardHeader className="gap-2">
					<CardTitle>{title}</CardTitle>
					<CardDescription>{subtitle}</CardDescription>
				</CardHeader>
			</Card>
		</VStack>
	);
}
