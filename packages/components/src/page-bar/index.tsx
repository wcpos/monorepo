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
	/** The page's search field: sits beside the title and takes the width, up to a cap. */
	search?: React.ReactNode;
};

export function PageBar({
	title,
	subtitle,
	status,
	onMenu,
	back,
	search,
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
			{/* No rule under the bar: the content below sits on its own surface (a card), so the
			    bar and the ground are one colour and a line would only draw a box around nothing.
			    Wide widths give the bar room for a full-height field; the phone keeps the control
			    height because its search has a row of its own. */}
			<HStack
				className={cn('bg-background items-center gap-4 pr-2 pl-4', phone ? 'h-ctl gap-2' : 'h-16')}
			>
				{(phone || onMenu) &&
					(phone && back ? (
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
				{/* The middle takes whatever the title and controls leave. The search sits at its
				    left edge, beside the title, and fills it up to a cap: a field pushed to the
				    right edge reads as a control, not as the way into the page. */}
				<View className="min-w-0 flex-1 flex-row">
					{search != null && (
						<View testID={id('search')} className="max-w-160 min-w-0 flex-1">
							{search}
						</View>
					)}
				</View>
				<HStack className="items-center gap-1">{children}</HStack>
			</HStack>
		</View>
	);
}
