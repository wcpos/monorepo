import * as React from 'react';
import { type LayoutChangeEvent, View } from 'react-native';

import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';

interface HeaderTitleProps {
	children: string;
	centered?: boolean;
	/**
	 * The parent flips this once its centering measurements are in; until then
	 * the text is rendered transparent (still laid out, so it can be measured)
	 * so the first visible paint is already in its final position.
	 */
	visible?: boolean;
	onIntrinsicWidth?: (width: number) => void;
}

/**
 * Header title uses sidebar-foreground color since the header background
 * matches the sidebar (dark in all themes).
 *
 * Parent container must have min-w-0 for text truncation to work in flex layout.
 *
 * Uses a hidden measurement element to report intrinsic (unconstrained) text width,
 * which is used by the parent to determine if centering should be applied.
 */
export function HeaderTitle({
	children,
	centered = false,
	visible = true,
	onIntrinsicWidth,
}: HeaderTitleProps) {
	const handleMeasureLayout = React.useCallback(
		(event: LayoutChangeEvent) => {
			onIntrinsicWidth?.(event.nativeEvent.layout.width);
		},
		[onIntrinsicWidth]
	);

	return (
		<View className="min-w-0">
			{/* Hidden text for measuring intrinsic width (no truncation) */}
			<View
				testID="header-title-measure"
				style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
				onLayout={handleMeasureLayout}
			>
				<Text className="text-sidebar-foreground text-xl" decodeHtml>
					{children}
				</Text>
			</View>

			{/* Visible text with truncation */}
			<Text
				testID="header-title-text"
				className={cn('text-sidebar-foreground text-xl', centered && 'text-center')}
				style={visible ? undefined : { opacity: 0 }}
				numberOfLines={1}
				ellipsizeMode="tail"
				decodeHtml
			>
				{children}
			</Text>
		</View>
	);
}
