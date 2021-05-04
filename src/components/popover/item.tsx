import * as React from 'react';
import Text from '../text';
import Icon from '../icon';
import Pressable from '../pressable';
import { PopoverContext } from './context';

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
		<Pressable onPress={onSelect} disabled={disabled} style={{ padding: 5, flexDirection: 'row' }}>
			{icon ? <Icon name={icon} color={iconColor} /> : null}
			<Text>{label}</Text>
		</Pressable>
	);
};
