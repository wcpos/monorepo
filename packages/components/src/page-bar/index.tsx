import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { Breadcrumb } from '../breadcrumb';
import { EdgeSurface } from '../edge-surface';
import { HStack } from '../hstack';
import { IconButton } from '../icon-button';
import { useIsPhone } from '../lib/device';
import { useGround } from '../lib/ground';
import { cn } from '../lib/utils';
import { StatusBadge, type StatusBadgeProps } from '../status-badge';
import { Text } from '../text';

export type PageBarProps = ViewProps & {
	/** Absent on a phone leaf page that carries its own heading (one title, not two). */
	title?: string;
	/**
	 * A scoped room's scope control, in the title's place when there is no `title`: still
	 * left, still one bar.
	 */
	titleSlot?: React.ReactNode;
	subtitle?: string;
	status?: { label: string; variant?: StatusBadgeProps['variant']; testID?: string };
	// A label, not a bare handler: an icon-only control carries no accessible name of
	// its own, and the caller owns the translated string (Codex review on #2188).
	onMenu?: { label: string; onPress: () => void };
	back?: { label: string; onPress: () => void; testID?: string };
	/**
	 * The page's search field: beside the title on wide widths, taking the width up to a cap; on
	 * a phone, its own row under the bar, with no rule under it (owner, 2026-10-23), unless the
	 * control row holds nothing but icons (owner, 2026-10-28).
	 */
	search?: React.ReactNode;
};

const TOP = ['top'] as const;

export function PageBar({
	title,
	titleSlot,
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
	const phone = useIsPhone();
	const ground = useGround();
	const id = (part: string) => (testID ? `${testID}-${part}` : undefined);
	// A phone's search takes a row of its own only when the control row has a title, a scope
	// control, a crumb or the menu to share it with. A row of nothing but icons (the POS products
	// column, whose register bar above carries the place and the menu) keeps it in its middle,
	// so the search does not spend a second row (Paul, 2026-10-28).
	const searchRow =
		phone && (title !== undefined || titleSlot != null || back != null || onMenu != null);
	return (
		// The bar touches the top edge; inside a column that pads it already (the POS products
		// column), there is nothing left to pad.
		<EdgeSurface
			testID={testID}
			edges={TOP}
			className={cn('bg-background', className)}
			style={style}
			{...props}
		>
			{/* No rule under the bar: the content below sits on its own surface (a card), so the
			    bar and the ground are one colour and a line would only draw a box around nothing.
			    On wide widths the bar is the page's first row, not a box of its own height: its
			    controls sit the page gutter from the top and the sides, and the row under it
			    (the chip row, a page body) brings the gutter between them, so search, chips and card
			    share one rhythm (CODING_STANDARDS § Design, Gutters). The phone keeps the control
			    height: its search sits in the row or on a row of its own (`searchRow`). */}
			<HStack
				className={cn(
					'bg-background items-center',
					// The ground's gutter, so a pane's edge that faces another keeps none (`useGround`).
					phone ? 'h-ctl gap-2 pr-2 pl-4' : cn(ground.px, ground.pt, 'gap-4')
				)}
			>
				{(phone || onMenu) &&
					(phone && back ? (
						// Flush with the bar's edge like the menu button: the crumb's own hit area is
						// the inset (owner, 2026-10-13: "padding left of the back button").
						<Breadcrumb parents={[back]} testID={id('back')} className="-ml-2" />
					) : onMenu ? (
						<IconButton
							name="menu"
							onPress={onMenu.onPress}
							accessibilityLabel={onMenu.label}
							testID={id('menu')}
							className="h-ctl w-ctl -ml-2 items-center justify-center"
						/>
					) : null)}
				{title !== undefined ? (
					// The title stands in a control-height box: a bar with only a title is as tall as
					// one with a control beside it (60 on wide widths), its title sits where it would
					// next to one, and the row never takes the text's fractional height.
					<View className="min-h-ctl min-w-0 shrink justify-center">
						<Text
							testID={id('title')}
							className="text-foreground font-semibold"
							numberOfLines={1}
							ellipsizeMode="tail"
						>
							{title}
						</Text>
					</View>
				) : titleSlot != null ? (
					<View testID={id('title-slot')} className="min-w-0 shrink flex-row items-center">
						{titleSlot}
					</View>
				) : null}
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
					{!searchRow && search != null && (
						// The cap is for wide widths: a phone's row has no width to spare.
						<View testID={id('search')} className={cn('min-w-0 flex-1', !phone && 'max-w-160')}>
							{search}
						</View>
					)}
				</View>
				<HStack className="items-center gap-1">{children}</HStack>
			</HStack>
			{searchRow && search != null && (
				<View testID={id('search')} className="h-ctl justify-center px-2">
					{search}
				</View>
			)}
		</EdgeSurface>
	);
}
