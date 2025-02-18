import * as React from 'react';
import { Text, View } from 'react-native';

import { TextRef, ViewRef } from '@rn-primitives/types';

import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

const Card = React.forwardRef<ViewRef, React.ComponentPropsWithoutRef<typeof View>>(
	({ className, ...props }, ref) => (
		<View
			ref={ref}
			className={cn(
				'border-border bg-card shadow-foreground/10 rounded-lg border shadow-sm',
				className
			)}
			{...props}
		/>
	)
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<ViewRef, React.ComponentPropsWithoutRef<typeof View>>(
	({ className, ...props }, ref) => (
		<View ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
	)
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<TextRef, React.ComponentPropsWithoutRef<typeof Text>>(
	({ className, ...props }, ref) => (
		<Text
			role="heading"
			aria-level={3}
			ref={ref}
			className={cn(
				'text-card-foreground text-2xl font-semibold leading-none tracking-tight',
				className
			)}
			{...props}
		/>
	)
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<TextRef, React.ComponentPropsWithoutRef<typeof Text>>(
	({ className, ...props }, ref) => (
		<Text ref={ref} className={cn('text-muted-foreground text-sm', className)} {...props} />
	)
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<ViewRef, React.ComponentPropsWithoutRef<typeof View>>(
	({ className, ...props }, ref) => (
		<TextClassContext.Provider value="text-card-foreground">
			<View ref={ref} className={cn('p-6 pt-0', className)} {...props} />
		</TextClassContext.Provider>
	)
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<ViewRef, React.ComponentPropsWithoutRef<typeof View>>(
	({ className, ...props }, ref) => (
		<View ref={ref} className={cn('flex flex-row items-center p-6 pt-0', className)} {...props} />
	)
);
CardFooter.displayName = 'CardFooter';

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
