import * as React from 'react';
import type { LayoutChangeEvent } from 'react-native';

import { HStack } from '../hstack';
import { Icon } from '../icon';
import { IconButton } from '../icon-button';
import { Text } from '../text';
import { Tooltip, TooltipTrigger, TooltipContent } from '../tooltip';
import { VStack } from '../vstack';

import type { FallbackProps } from 'react-error-boundary';

/**
 * TODO - convert this to a general removable message component
 */
const Fallback = ({ error, resetErrorBoundary }: FallbackProps) => {
	const [containerWidth, setContainerWidth] = React.useState(0);

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
	if (containerWidth < 200 || error.message.length > 1000) {
		return (
			<HStack className="p-2 bg-error items-start justify-between" onLayout={handleLayout}>
				<Tooltip>
					<TooltipTrigger>
						<Icon name="triangleExclamation" size="4xl" className="text-error-foreground" />
					</TooltipTrigger>
					<TooltipContent>
						<VStack className="gap-1 flex-1 w-full">
							<Text className="font-bold">Something went wrong:</Text>
							<Text>{error.message}</Text>
						</VStack>
					</TooltipContent>
				</Tooltip>
				<IconButton name="xmark" size="sm" variant="destructive" onPress={resetErrorBoundary} />
			</HStack>
		);
	}

	/**
	 *
	 */
	return (
		<HStack className="p-2 bg-error w-full items-start" onLayout={handleLayout}>
			<Icon name="triangleExclamation" size="4xl" className="text-error-foreground" />
			<VStack className="gap-1 flex-1 w-full">
				<Text className="text-error-foreground font-bold">Something went wrong:</Text>
				<Text className="text-error-foreground">{error.message}</Text>
			</VStack>
			<IconButton
				name="xmark"
				size="sm"
				className="text-destructive-foreground"
				onPress={resetErrorBoundary}
			/>
		</HStack>
	);
};

export default Fallback;
