import * as React from 'react';
import { type LayoutChangeEvent, View } from 'react-native';

import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';

interface HeaderTitleProps {
	children: string;
	centered?: boolean;
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
const HeaderTitle = ({ children, centered = false, onIntrinsicWidth }: HeaderTitleProps) => {
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
				style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
				onLayout={handleMeasureLayout}
			>
				<Text className="text-sidebar-foreground text-xl" decodeHtml>
					{children}
				</Text>
			</View>

			{/* Visible text with truncation */}
			<Text
				className={cn('text-sidebar-foreground text-xl', centered && 'text-center')}
				numberOfLines={1}
				ellipsizeMode="tail"
				decodeHtml
			>
				{children}
			</Text>
		</View>
	);
};

export default HeaderTitle;
