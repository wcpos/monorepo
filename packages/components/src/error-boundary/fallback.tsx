import * as React from 'react';
import type { LayoutChangeEvent } from 'react-native';

import { HStack } from '../hstack';
import { Icon } from '../icon';
import { IconButton } from '../icon-button';
import { Text } from '../text';
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip';
import { VStack } from '../vstack';

import type { FallbackProps } from 'react-error-boundary';

/**
 * TODO - convert this to a general removable message component
 */
// The fallback renders when the tree under it threw, translations included, so its words are
// English, as "Something went wrong" already is; the dismiss control still gets a name.
const DISMISS_LABEL = 'Dismiss';

export function Fallback({ error, resetErrorBoundary }: FallbackProps) {
	const [containerWidth, setContainerWidth] = React.useState(0);
	const errorMessage = error instanceof Error ? error.message : String(error);

	/**
	 *
	 */
	const handleLayout = (event: LayoutChangeEvent) => {
		const { width } = event.nativeEvent.layout;
		setContainerWidth(width);
	};

	/**
	 *
	 */
	if (containerWidth < 200 || errorMessage.length > 1000) {
		return (
			<HStack
				testID="error-boundary-fallback"
				className="bg-bad items-start justify-between p-2"
				onLayout={handleLayout}
			>
				<Tooltip>
					<TooltipTrigger>
						<Icon name="warning" size="4xl" className="text-destructive-foreground" />
					</TooltipTrigger>
					<TooltipContent>
						<VStack className="w-full flex-1 gap-1">
							<Text className="font-bold">Something went wrong:</Text>
							<Text>{errorMessage}</Text>
						</VStack>
					</TooltipContent>
				</Tooltip>
				<IconButton
					name="close"
					size="sm"
					variant="destructive"
					accessibilityLabel={DISMISS_LABEL}
					onPress={resetErrorBoundary}
				/>
			</HStack>
		);
	}

	/**
	 *
	 */
	return (
		<HStack
			testID="error-boundary-fallback"
			className="bg-bad w-full items-start p-2"
			onLayout={handleLayout}
		>
			<Icon name="warning" size="4xl" className="text-destructive-foreground" />
			<VStack className="w-full flex-1 gap-1">
				<Text className="text-destructive-foreground font-bold">Something went wrong:</Text>
				<Text className="text-destructive-foreground">{errorMessage}</Text>
			</VStack>
			<IconButton
				name="close"
				size="sm"
				iconClassName="text-destructive-foreground"
				accessibilityLabel={DISMISS_LABEL}
				onPress={resetErrorBoundary}
			/>
		</HStack>
	);
}
