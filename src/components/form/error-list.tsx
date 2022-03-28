import * as React from 'react';
import { useTheme } from 'styled-components/native';
import Box from '../box';
import Text from '../text';
import Icon from '../icon';

type AjvError = {
	message: string;
	name: string;
	params: any;
	property: string;
	stack: string;
};

export interface ErrorListProps {
	// errorSchema: FormValidation;
	errors: AjvError[];
	// formContext: any;
	// schema: JSONSchema7;
	// uiSchema: UiSchema;
}

export const ErrorList = ({ errors }: ErrorListProps) => {
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
				{errors.map((error, i) => (
					<Text key={i} type="inverse">
						{error.stack}
					</Text>
				))}
			</Box>
		</Box>
	);
};
