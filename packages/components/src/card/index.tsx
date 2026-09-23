import * as React from 'react';
import { Text, TextProps, View, ViewProps } from 'react-native';

import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

function Card({ className, ...props }: ViewProps) {
	return (
		<View
			className={cn('border-border bg-card rounded-lg border shadow-md', className)}
			{...props}
		/>
	);
}

function CardHeader({ className, ...props }: ViewProps) {
	return <View className={cn('flex flex-col rounded-t-lg p-4', className)} {...props} />;
}

function CardTitle({ className, ...props }: TextProps) {
	return (
		<Text
			role="heading"
			aria-level={3}
			className={cn('text-card-foreground text-lg leading-none font-semibold', className)}
			{...props}
		/>
	);
}

function CardDescription({ className, ...props }: TextProps) {
	return <Text className={cn('text-muted-foreground text-sm', className)} {...props} />;
}

function CardContent({ className, ...props }: ViewProps) {
	return (
		<TextClassContext.Provider value="text-card-foreground">
			<View className={cn('p-4 pt-0', className)} {...props} />
		</TextClassContext.Provider>
	);
}

function CardFooter({ className, ...props }: ViewProps) {
	return <View className={cn('flex flex-row items-center p-4 pt-0', className)} {...props} />;
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
