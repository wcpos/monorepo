import * as React from 'react';

import { Button } from '../button';
import { HStack } from '../hstack';
import { Icon } from '../icon';
import { Text } from '../text';
import { VStack } from '../vstack';

import type { FallbackProps } from 'react-error-boundary';

/**
 * TODO - convert this to a general removable message component
 */
const Fallback = ({ error, resetErrorBoundary }: FallbackProps) => {
	return (
		<HStack className="p-2 bg-error">
			<Icon name="triangleExclamation" className="w-7 h-7 fill-error-foreground" />
			<VStack className="grow gap-1">
				<Text className="text-error-foreground font-bold">Something went wrong:</Text>
				<Text className="text-error-foreground">{error.message}</Text>
			</VStack>
			<Button variant="ghost" size="icon" className="rounded-full" onPress={resetErrorBoundary}>
				<Icon name="xmark" className="fill-error-foreground" />
			</Button>
		</HStack>
	);
};

export default Fallback;
