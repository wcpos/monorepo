import * as React from 'react';
import Button from '../../button';
import Box from '../../box';
import Icon from '../../icon';

export const ArrayItemTemplate = ({
	children,
	hasToolbar,
	hasMoveUp,
	hasMoveDown,
	hasRemove,
	index,
	onReorderClick,
	onDropIndexClick,
	disabled,
	readonly,
}) => {
	return (
		<Box horizontal space="medium">
			<Box fill>{children}</Box>
			<Box>
				{hasToolbar && (
					<Button.Group>
						{(hasMoveUp || hasMoveDown) && (
							<Button
								disabled={disabled || readonly || !hasMoveUp}
								onPress={onReorderClick(index, index - 1)}
							>
								<Icon name="arrowUp" />
							</Button>
						)}

						{(hasMoveUp || hasMoveDown) && (
							<Button
								disabled={disabled || readonly || !hasMoveDown}
								onPress={onReorderClick(index, index + 1)}
							>
								<Icon name="arrowDown" />
							</Button>
						)}
						{hasRemove && (
							<Button
								type="warning"
								disabled={disabled || readonly}
								onPress={onDropIndexClick(index)}
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
