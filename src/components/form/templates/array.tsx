import * as React from 'react';
import Button from '../../button';
import Box from '../../box';
import Text from '../../text';
import Icon from '../../icon';
import { ArrayItemTemplate } from './array-item';

export const ArrayTemplate = ({ uiSchema, schema, items, canAdd, onAdd, disabled, readonly }) => {
	return (
		<Box space="xSmall">
			<Box>
				<Text size="large">{uiSchema['ui:title'] || schema.title}</Text>
				{(uiSchema['ui:description'] || schema.description) && (
					<Text>{uiSchema['ui:description'] || schema.description}</Text>
				)}
			</Box>
			<Box>
				{items &&
					items.map((arrayItemProps) => {
						return <ArrayItemTemplate {...arrayItemProps} />;
					})}
			</Box>

			{canAdd && (
				<Box horizontal>
					<Button onPress={onAdd} disabled={disabled || readonly}>
						<Icon name="plus" />
					</Button>
				</Box>
			)}
		</Box>
	);
};
