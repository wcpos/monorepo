import * as React from 'react';
import { Text, TextProps, View, ViewProps } from 'react-native';

import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

function Card({ className, ...props }: ViewProps) {
	return (
		<View
			className={cn(
				'border-border bg-card shadow-foreground/10 rounded-lg border shadow-sm',
				className
			)}
			{...props}
		/>
	);
}

function CardHeader({ className, ...props }: ViewProps) {
	return <View className={cn('flex flex-col p-6', className)} {...props} />;
}

function CardTitle({ className, ...props }: TextProps) {
	return (
		<Text
			role="heading"
			aria-level={3}
			className={cn(
				'text-card-foreground text-2xl font-semibold leading-none tracking-tight',
				className
			)}
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
			<View className={cn('p-6 pt-0', className)} {...props} />
		</TextClassContext.Provider>
	);
}

function CardFooter({ className, ...props }: ViewProps) {
	return <View className={cn('flex flex-row items-center p-6 pt-0', className)} {...props} />;
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
