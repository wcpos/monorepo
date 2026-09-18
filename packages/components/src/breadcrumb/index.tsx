import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { Button } from '../button';
import { HStack } from '../hstack';
import { Icon } from '../icon';
import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';

type Crumb = { label: string; onPress: () => void; testID?: string };
export type BreadcrumbProps = ViewProps & {
	parents: readonly [Crumb, ...Crumb[]];
	here?: string;
	detail?: string;
	autoFocus?: boolean;
};

export function Breadcrumb({
	parents,
	here,
	detail,
	autoFocus,
	children,
	testID,
	className,
	...props
}: BreadcrumbProps) {
	const backRef = React.useRef<React.ElementRef<typeof View>>(null);
	const focusOnMount = React.useRef(autoFocus);
	// Drill-in focus is a mount action, never a response to changing parents.
	React.useEffect(() => {
		if (focusOnMount.current) backRef.current?.focus();
	}, []);
	const id = (part: string) => (testID ? `${testID}-${part}` : undefined);
	const separator = (
		<Text className="text-border text-lg" aria-hidden>
			›
		</Text>
	);
	return (
		<HStack testID={testID} className={cn('h-ctl items-center gap-1 pr-2', className)} {...props}>
			{parents.map((parent, index) => (
				<React.Fragment key={index}>
					{index > 0 && separator}
					<Button
						variant="ghost-quiet"
						size="sm"
						onPress={parent.onPress}
						testID={parent.testID ?? id(`parent-${index}`)}
						{...{ ref: index === parents.length - 1 ? backRef : undefined }}
					>
						<TextClassContext.Provider value={undefined}>
							<HStack className="max-w-full gap-1">
								{index === parents.length - 1 && <Icon name="chevronLeft" size="sm" />}
								<Text className="text-foreground shrink font-medium">{parent.label}</Text>
							</HStack>
						</TextClassContext.Provider>
					</Button>
				</React.Fragment>
			))}
			{here !== undefined && (
				<>
					{separator}
					<Text testID={id('here')} className="text-foreground shrink px-1 font-semibold">
						{here}
					</Text>
				</>
			)}
			{detail !== undefined && (
				<Text testID={id('detail')} className="text-muted-foreground">
					{detail}
				</Text>
			)}
			{children && <View className="ml-auto flex-row items-center gap-2">{children}</View>}
		</HStack>
	);
}
