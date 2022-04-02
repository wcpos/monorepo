import * as React from 'react';
import get from 'lodash/get';
import Button from '../../button';
import Box from '../../box';
import Text from '../../text';
import Icon from '../../icon';
import Collapsible from '../../collapsible';
import { ArrayItemTemplate } from './array-item';

export const ArrayTemplate = ({ uiSchema, schema, items, canAdd, onAdd, disabled, readonly }) => {
	const collapsible = get(uiSchema, 'ui:collapsible', false);
	if (collapsible) {
		return (
			<Box space="small" paddingBottom="small">
				<Collapsible
					title={<Text size="large">{uiSchema['ui:title'] || schema.title}</Text>}
					initExpand={collapsible === 'open'}
				>
					{(uiSchema['ui:description'] || schema.description) && (
						<Text>{uiSchema['ui:description'] || schema.description}</Text>
					)}
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
				</Collapsible>
			</Box>
		);
	}

	return (
		<Box space="small" paddingBottom="small">
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
