import * as React from 'react';
import { FallbackProps } from 'react-error-boundary';
import { useTheme } from 'styled-components/native';
import Box from '../box';
import Icon from '../icon';
import Text from '../text';

/**
 * @TODO - convert this to a general removable message component
 */
const Fallback = ({ error, resetErrorBoundary }: FallbackProps) => {
	const theme = useTheme();

	return (
		<Box
			horizontal
			space="small"
			padding="small"
			style={{ backgroundColor: theme.colors.critical }}
		>
			<Box>
				<Icon name="triangleExclamation" size="xLarge" type="inverse" />
			</Box>
			<Box fill style={{ flexShrink: 1 }}>
				<Text type="inverse" weight="bold">
					Something went wrong:
				</Text>
				<Text type="inverse">{error.message}</Text>
			</Box>
			<Box>
				<Icon onPress={resetErrorBoundary} name="xmark" type="inverse" />
			</Box>
		</Box>
	);
};

export default Fallback;
