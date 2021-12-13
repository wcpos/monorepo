import React from 'react';
import Text from '../text';
import Icon from '../icon';
import Box from '../box';

export interface InlineErrorProps {
	/**
	 * Error message.
	 */
	message: string;
}

/**
 * Brief, in-context messages telling the user that something went wrong
 * with a single or group of inputs in a form.
 *
 * Use to let users know why a form input is invalid and how to fix it.
 *
 * > Used in `TextField` component to display error message.
 */
export const InlineError = ({ message }: InlineErrorProps) => (
	<Box horizontal space="xSmall" align="center">
		<Icon name="triangleExclamation" type="critical" size="small" />
		<Text type="critical" size="small">
			{message}
		</Text>
	</Box>
);
