import * as React from 'react';
import Button from '../../button';
import Box from '../../box';
import Icon from '../../icon';

export const ArrayItemTemplate = ({
	children,
	disabled,
	canMoveDown,
	canMoveUp,
	canRemove,
	index,
	onRemoveIndex = (idx: number) => {},
	onReorder = (curr: number, next: number) => {},
	readonly,
}) => {
	const hasToolbar = canMoveDown || canMoveUp || canRemove;

	/**
	 *
	 */
	const handleMoveUpPress = React.useCallback(() => {
		onReorder(index, index - 1);
	}, [index, onReorder]);

	/**
	 *
	 */
	const handleMoveDownPress = React.useCallback(() => {
		onReorder(index, index + 1);
	}, [index, onReorder]);

	/**
	 *
	 */
	const handleRemovePress = React.useCallback(() => {
		onRemoveIndex(index);
	}, [index, onRemoveIndex]);

	return (
		<Box horizontal space="medium">
			<Box fill>{children}</Box>
			{hasToolbar && (
				<Box>
					<Button.Group>
						{(canMoveUp || canMoveDown) && (
							<Button disabled={disabled || readonly || !canMoveUp} onPress={handleMoveUpPress}>
								<Icon size="small" name="arrowUp" />
							</Button>
						)}

						{(canMoveUp || canMoveDown) && (
							<Button disabled={disabled || readonly || !canMoveDown} onPress={handleMoveDownPress}>
								<Icon size="small" name="arrowDown" />
							</Button>
						)}
						{canRemove && (
							<Button type="warning" disabled={disabled || readonly} onPress={handleRemovePress}>
								<Icon size="small" name="xmark" />
							</Button>
						)}
					</Button.Group>
				</Box>
			)}
		</Box>
	);
};
