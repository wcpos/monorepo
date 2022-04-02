import * as React from 'react';
import Box from '../box';
import Text from '../text';
import Icon from '../icon';

interface CollapsibleHeaderProps {
	title: string | React.ReactNode;
	open: boolean;
}

export const CollapsibleHeader = ({ open, ...props }: CollapsibleHeaderProps) => {
	const icon = open ? 'caretUp' : 'caretDown';
	const title =
		typeof props.title === 'string' ? <Text size="large">{props.title}</Text> : props.title;

	return (
		<Box horizontal space="medium" align="center">
			<Box>{title}</Box>
			<Icon name={icon} />
		</Box>
	);
};
