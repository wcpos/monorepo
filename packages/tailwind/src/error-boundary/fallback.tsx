import * as React from 'react';

import { HStack } from '../hstack';
import { Icon } from '../icon';
import { IconButton } from '../icon-button';
import { Text } from '../text';
import { VStack } from '../vstack';

import type { FallbackProps } from 'react-error-boundary';

/**
 * TODO - convert this to a general removable message component
 */
const Fallback = ({ error, resetErrorBoundary }: FallbackProps) => {
	return (
		<HStack className="p-2 bg-error w-full items-start">
			<Icon name="triangleExclamation" className="w-7 h-7 fill-error-foreground" />
			<VStack className="gap-1 flex-1 w-full">
				<Text className="text-error-foreground font-bold">Something went wrong:</Text>
				<Text className="text-error-foreground">{error.message}</Text>
			</VStack>
			<IconButton
				name="xmark"
				size="sm"
				iconClassName="fill-destructive-foreground"
				onPress={resetErrorBoundary}
			/>
		</HStack>
	);
};

export default Fallback;
