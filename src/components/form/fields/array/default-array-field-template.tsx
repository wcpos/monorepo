import * as React from 'react';
import Button from '../../../button';
import Box from '../../../box';
import Text from '../../../text';
import Icon from '../../../icon';
import { ArrayFieldTemplateProps, ArrayFieldItemProps } from '../../types';

export const DefaultArrayItem = (props: ArrayFieldItemProps) => {
	return (
		<Box horizontal space="medium">
			<Box fill>{props.children}</Box>
			<Box>
				{props.hasToolbar && (
					<Button.Group>
						{(props.hasMoveUp || props.hasMoveDown) && (
							<Button
								disabled={props.disabled || props.readonly || !props.hasMoveUp}
								// onPress={props.onReorderClick(props.index, props.index - 1)}
							>
								<Icon name="arrowUp" />
							</Button>
						)}

						{(props.hasMoveUp || props.hasMoveDown) && (
							<Button
								disabled={props.disabled || props.readonly || !props.hasMoveDown}
								// onPress={props.onReorderClick(props.index, props.index + 1)}
							>
								<Icon name="arrowDown" />
							</Button>
						)}
						{props.hasRemove && (
							<Button
								type="warning"
								disabled={props.disabled || props.readonly}
								// onPress={props.onDropIndexClick(props.index)}
							>
								<Icon name="xmark" />
							</Button>
						)}
					</Button.Group>
				)}
			</Box>
		</Box>
	);
};

export const DefaultArrayFieldTemplate = (props: ArrayFieldTemplateProps) => {
	return (
		<Box space="xSmall">
			<Box>
				<Text>{props.uiSchema['ui:title'] || props.title}</Text>
				{(props.uiSchema['ui:description'] || props.schema.description) && (
					<Text>{props.uiSchema['ui:description'] || props.schema.description}</Text>
				)}
			</Box>
			<Box>{props.items && props.items.map(DefaultArrayItem)}</Box>

			{props.canAdd && (
				<Box horizontal>
					<Button onPress={props.onAddClick} disabled={props.disabled || props.readonly}>
						<Icon name="plus" />
					</Button>
				</Box>
			)}
		</Box>
	);
};
