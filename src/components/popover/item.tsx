import * as React from 'react';
import Text from '@wcpos/common/src/components/text';
import Icon from '@wcpos/common/src/components/icon';
import { Box } from './box';
import { Touchable } from './touchable';
import { PopoverContext } from './context';
// import { useStyles } from '../../../../theme';

export interface ItemProps {
	/**
	 * Label of the Item.
	 */
	label: string;
	/**
	 * Optional Icon.
	 */
	icon?: any;
	/**
	 * Color of the Icon.
	 */
	iconColor?: any;
	/**
	 * Action to execute on click.
	 */
	onSelect?: () => void;
	/**
	 * Set to `true` to disable the option.
	 */
	disabled?: boolean;
}

/**
 * Action to display in a `Popover`.
 */
export const Item: React.FC<ItemProps> = ({
	label,
	icon,
	iconColor,
	onSelect: onSelectRaw = () => {},
	disabled = false,
}) => {
	// const styles = useStyles((theme) => ({
	// 	disabled: {
	// 		opacity: theme.opacity.disabled,
	// 	},
	// }));

	const { requestClose } = React.useContext(PopoverContext);

	// Make sure to close the Popover after calling onSelect
	const onSelect = React.useCallback(() => {
		onSelectRaw();
		requestClose();
	}, [requestClose, onSelectRaw]);

	return (
		// <Touchable onClick={onSelect} disabled={disabled} viewStyle={disabled && styles.disabled}>
		<Touchable onClick={onSelect} disabled={disabled}>
			<Box horizontal space="small" paddingX="medium" paddingY="small" align="center">
				{icon ? <Icon name={icon} color={iconColor} /> : null}
				<Text>{label}</Text>
			</Box>
		</Touchable>
	);
};
