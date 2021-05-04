import React from 'react';
import Text from '../text';
import Icon from '../icon';
import * as Styled from './styles';

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
	<Styled.Container>
		<Icon name="error" color="error" />
		<Text
		// variation="error"
		>
			{message}
		</Text>
	</Styled.Container>
);
