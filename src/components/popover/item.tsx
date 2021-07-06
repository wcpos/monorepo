import * as React from 'react';
import { useTheme } from 'styled-components/native';
import Text from '../text';
import Icon from '../icon';
import { PopoverContext } from './context';
import * as Styled from './styles';

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
export const Item = ({
	label,
	icon,
	iconColor,
	onSelect: onSelectRaw = () => {},
	disabled = false,
}: ItemProps) => {
	const theme = useTheme();

	const { requestClose } = React.useContext(PopoverContext);

	// Make sure to close the Popover after calling onSelect
	const onSelect = React.useCallback(() => {
		onSelectRaw();
		requestClose();
	}, [requestClose, onSelectRaw]);

	const styles = React.useCallback(
		({ hovered, focused }) => {
			return hovered || focused
				? { backgroundColor: theme.MENU_ITEM_HOVER_BACKGROUND_COLOR }
				: undefined;
		},
		[theme.MENU_ITEM_HOVER_BACKGROUND_COLOR]
	);

	return (
		<Styled.PressableItem onPress={onSelect} disabled={disabled} style={styles}>
			{icon ? <Icon name={icon} color={iconColor} /> : null}
			<Text>{label}</Text>
		</Styled.PressableItem>
	);
};
