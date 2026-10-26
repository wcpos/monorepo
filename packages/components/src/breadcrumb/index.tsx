import * as React from 'react';
import { Pressable, View, type ViewInstance, type ViewProps } from 'react-native';

import { HStack } from '../hstack';
import { Icon } from '../icon';
import { useIsPhone } from '../lib/device';
import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';

type Crumb = { label: string; onPress: () => void; testID?: string };
export type BreadcrumbProps = ViewProps & {
	parents: readonly [Crumb, ...Crumb[]];
	here?: string;
	autoFocus?: boolean;
};

export function Breadcrumb({
	parents,
	here,
	autoFocus,
	children,
	testID,
	className,
	...props
}: BreadcrumbProps) {
	const phone = useIsPhone();
	const backRef = React.useRef<ViewInstance>(null);
	const focusOnMount = React.useRef(autoFocus);
	// Drill-in focus is a mount action, never a response to changing parents.
	// `preventScroll`: a crumb mounts inside a pane that is still off-stage, and a browser
	// scrolls a focused element into view — which would yank the stage sideways mid-slide.
	React.useEffect(() => {
		if (focusOnMount.current) {
			(backRef.current as { focus: (options?: { preventScroll: boolean }) => void } | null)?.focus({
				preventScroll: true,
			});
		}
	}, []);
	const id = (part: string) => (testID ? `${testID}-${part}` : undefined);
	const separator = (
		<Icon name="chevronRight" size="xs" className="text-muted-foreground" aria-hidden />
	);
	return (
		<HStack
			testID={testID}
			className={cn('min-h-ctl flex-wrap items-center gap-1 pr-2', className)}
			{...props}
		>
			{parents.map((parent, index) =>
				phone && index < parents.length - 1 ? null : (
					<React.Fragment key={index}>
						{!phone && index > 0 && separator}
						<Pressable
							role="button"
							className="web:hover:bg-muted active:bg-muted rounded-md px-2 py-1"
							hitSlop={{ top: 8, bottom: 8 }}
							onPress={parent.onPress}
							testID={parent.testID ?? id(`parent-${index}`)}
							{...{ ref: index === parents.length - 1 ? backRef : undefined }}
						>
							<TextClassContext.Provider value={undefined}>
								<HStack className="max-w-full gap-1">
									{phone && <Icon name="chevronLeft" size="sm" />}
									<Text className="text-foreground shrink font-medium">{parent.label}</Text>
								</HStack>
							</TextClassContext.Provider>
						</Pressable>
					</React.Fragment>
				)
			)}
			{here !== undefined && (
				<>
					{!phone && separator}
					<Text testID={id('here')} className="text-foreground shrink px-1 font-semibold">
						{here}
					</Text>
				</>
			)}
			{children && <View className="ml-auto flex-row items-center gap-2">{children}</View>}
		</HStack>
	);
}
