import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Breadcrumb } from '../breadcrumb';
import { HStack } from '../hstack';
import { IconButton } from '../icon-button';
import { useIsPhone } from '../lib/device';
import { cn } from '../lib/utils';
import { StatusBadge, type StatusBadgeProps } from '../status-badge';
import { Text } from '../text';

export type PageBarProps = ViewProps & {
	title: string;
	subtitle?: string;
	status?: { label: string; variant?: StatusBadgeProps['variant']; testID?: string };
	// A label, not a bare handler: an icon-only control carries no accessible name of
	// its own, and the caller owns the translated string (Codex review on #2188).
	onMenu?: { label: string; onPress: () => void };
	back?: { label: string; onPress: () => void; testID?: string };
};

export function PageBar({
	title,
	subtitle,
	status,
	onMenu,
	back,
	children,
	testID,
	className,
	style,
	...props
}: PageBarProps) {
	const insets = useSafeAreaInsets();
	const phone = useIsPhone();
	const id = (part: string) => (testID ? `${testID}-${part}` : undefined);
	return (
		<View
			testID={testID}
			className={cn('bg-background', className)}
			style={[style, { paddingTop: insets.top }]}
			{...props}
		>
			<HStack className="h-ctl border-border bg-background items-center gap-2 border-b pr-2 pl-4">
				{phone &&
					(back ? (
						<Breadcrumb parents={[back]} testID={id('back')} />
					) : onMenu ? (
						<IconButton
							name="bars"
							onPress={onMenu.onPress}
							aria-label={onMenu.label}
							testID={id('menu')}
							className="h-ctl w-ctl -ml-2 items-center justify-center"
						/>
					) : null)}
				<View className="min-w-0 shrink">
					<Text
						testID={id('title')}
						className="text-foreground font-semibold"
						numberOfLines={1}
						ellipsizeMode="tail"
					>
						{title}
					</Text>
				</View>
				{subtitle !== undefined && (
					<Text
						testID={id('subtitle')}
						className="text-muted-foreground min-w-0 shrink"
						numberOfLines={1}
						ellipsizeMode="tail"
					>
						{subtitle}
					</Text>
				)}
				{status && <StatusBadge {...status} testID={status.testID ?? id('status')} />}
				<View className="flex-1" />
				<HStack className="items-center gap-1">{children}</HStack>
			</HStack>
		</View>
	);
}
