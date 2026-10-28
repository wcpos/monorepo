import * as React from 'react';
import { View, ViewProps } from 'react-native';

import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

function Card({ className, ...props }: ViewProps) {
	return <View className={cn('border-border bg-card rounded-lg border', className)} {...props} />;
}

function CardContent({ className, ...props }: ViewProps) {
	return (
		<TextClassContext.Provider value="text-card-foreground">
			<View className={cn('p-4 pt-0', className)} {...props} />
		</TextClassContext.Provider>
	);
}

export { Card, CardContent };
