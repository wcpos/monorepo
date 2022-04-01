import * as React from 'react';
import Button from '../../button';
import Box from '../../box';
import Icon from '../../icon';

export const ArrayItemTemplate = ({
	children,
	disabled,
	hasMoveDown,
	hasMoveUp,
	hasRemove,
	hasToolbar,
	index,
	onRemoveIndex = (idx: number) => {},
	onReorder = (curr: number, next: number) => {},
	readonly,
}) => {
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
						{(hasMoveUp || hasMoveDown) && (
							<Button disabled={disabled || readonly || !hasMoveUp} onPress={handleMoveUpPress}>
								<Icon name="arrowUp" />
							</Button>
						)}

						{(hasMoveUp || hasMoveDown) && (
							<Button disabled={disabled || readonly || !hasMoveDown} onPress={handleMoveDownPress}>
								<Icon name="arrowDown" />
							</Button>
						)}
						{hasRemove && (
							<Button type="warning" disabled={disabled || readonly} onPress={handleRemovePress}>
								<Icon name="xmark" />
							</Button>
						)}
					</Button.Group>
				</Box>
			)}
		</Box>
	);
};
