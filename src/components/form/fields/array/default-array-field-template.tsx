import * as React from 'react';
import Button from '../../../button';
import Box from '../../../box';
import Text from '../../../text';
import { ArrayFieldTemplateProps, ArrayFieldItemProps } from '../../types';

export const DefaultArrayItem = (props: ArrayFieldItemProps) => {
	<Box>
		{props.children}
		{props.hasToolbar && (
			<Box>
				{(props.hasMoveUp || props.hasMoveDown) && (
					<Button
						title="arrow-up"
						disabled={props.disabled || props.readonly || !props.hasMoveUp}
						// onPress={props.onReorderClick(props.index, props.index - 1)}
					/>
				)}

				{(props.hasMoveUp || props.hasMoveDown) && (
					<Button
						title="arrow-down"
						disabled={props.disabled || props.readonly || !props.hasMoveDown}
						// onPress={props.onReorderClick(props.index, props.index + 1)}
					/>
				)}
				{props.hasRemove && (
					<Button
						type="warning"
						title="remove"
						disabled={props.disabled || props.readonly}
						// onPress={props.onDropIndexClick(props.index)}
					/>
				)}
			</Box>
		)}
	</Box>;
};

export const DefaultArrayFieldTemplate = (props: ArrayFieldTemplateProps) => {
	return (
		<Box>
			<Text>{props.uiSchema['ui:title'] || props.title}</Text>
			{(props.uiSchema['ui:description'] || props.schema.description) && (
				<Text>{props.uiSchema['ui:description'] || props.schema.description}</Text>
			)}
			{props.items && props.items.map(DefaultArrayItem)}
			{props.canAdd && (
				<Button
					title="add"
					onPress={props.onAddClick}
					disabled={props.disabled || props.readonly}
				/>
			)}
		</Box>
	);
};
