import * as React from 'react';
import { TouchableWithoutFeedback } from 'react-native';
import Label from './label';
import Icon from './icon';
import { Wrapper } from './styles';
// import { Hoverable } from '../Hoverable';

type Props = {
	label?: React.ReactNode;
	hasError?: boolean;
	disabled?: boolean;
	checked?: boolean;
	info?: React.ReactNode;
	onChange?: (checked: boolean, event: { target: {} }) => void;
	children?: React.ReactNode;
	name?: string;
};

// @TODO - hover, focus states
// type State = {
//   focusDisplayed: boolean;
//   hovered: boolean;
//   pressed: boolean;
// };

const Checkbox: React.FC<Props> = ({
	label,
	hasError,
	disabled,
	info,
	onChange,
	children,
	name,
	...props
}) => {
	const [checked, setChecked] = React.useState(!!props.checked);

	const onPress = () => {
		if (disabled) {
			return;
		}
		const _checked = !checked;
		setChecked(_checked);
		if (typeof onChange === 'function') {
			onChange(_checked, { target: { name, checked: _checked } });
		}
	};

	return (
		<TouchableWithoutFeedback
			accessibilityRole="button"
			onPress={onPress}
			// onPressIn={this.handleOnPressIn}
			// onPressOut={this.handleOnPressOut}
			// onFocus={this.handleOnFocus}
			// onBlur={this.handleOnBlur}
			disabled={disabled}
		>
			<Wrapper disabled={disabled}>
				<Icon
					checked={checked}
					hasError={hasError}
					disabled={disabled}
					// focused={focusDisplayed}
					// hovered={hovered}
					// pressed={pressed}
				/>
				{children || <Label label={label} checked={checked} info={info} />}
			</Wrapper>
		</TouchableWithoutFeedback>
	);
};

export default Checkbox;
