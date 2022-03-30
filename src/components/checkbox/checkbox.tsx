import * as React from 'react';
import { ViewStyle } from 'react-native';
import useUncontrolledState from '@wcpos/common/src/hooks/use-uncontrolled-state';
import Label from './label';
import Icon from './icon';
import * as Styled from './styles';

export interface CheckboxProps {
	/**
	 * True if selected.
	 */
	value?: boolean;
	/**
	 * Label to display next to the Checkbox.
	 */
	label: React.ReactNode;
	/**
	 * Additional text to aid in use.
	 */
	helpText?: React.ReactNode;
	/**
	 * Disables the input.
	 */
	disabled?: boolean;
	/**
	 * Called when selection state changes. Should propagate change to `checked` prop.
	 *
	 * If not set, component will be an uncontrolled component. @see https://reactjs.org/docs/uncontrolled-components.html
	 */
	onChange?: (checked: boolean) => void;

	// helpText?: React.ReactNode;
	style?: ViewStyle;
}

/**
 * @TODO - hover, focus states
 */
export const Checkbox = ({
	label,
	disabled,
	helpText,
	value: checkedRaw = false,
	onChange: onChangeRaw,
	style,
}: CheckboxProps) => {
	const [checked, onChange] = useUncontrolledState(checkedRaw, onChangeRaw);
	const onPress = React.useCallback(() => onChange?.(!checked), [checked, onChange]);

	// const onPress = () => {
	// 	if (disabled) {
	// 		return;
	// 	}
	// 	const _checked = !checked;
	// 	setChecked(_checked);
	// 	if (typeof onChange === 'function') {
	// 		onChange(_checked, { target: { name, checked: _checked } });
	// 	}
	// };

	return (
		<Styled.PressableContainer disabled={disabled} onPress={onPress} style={style}>
			<Icon checked={checked} disabled={disabled} />
			<Label label={label} checked={checked} info={helpText} />
		</Styled.PressableContainer>
	);
};
