import * as React from 'react';
import { View, TextInputProps, TextInput as RNTextInput } from 'react-native';
import noop from 'lodash/noop';
import useUncontrolledState from '@wcpos/common/src/hooks/use-uncontrolled-state';
import * as Styled from './styles';
import Button from '../button';
import Text from '../text';
import Icon from '../icon';
import Portal from '../portal';
import useMeasure from '../../hooks/use-measure';

export interface ITextInputProps {
	/**
	 * Label to display above the input.
	 */
	label?: string;
	/**
	 * Text value in the input.
	 */
	value?: string;
	/**
	 * Type of the TextField.
	 *
	 * Will define a logical `autoCapitalize` value if not set.
	 *
	 * Also defines the type of keyboard displayed and the value for autocomplete/autofill properties.
	 */
	type?: 'text' | 'email' | 'password' | 'new-password' | 'first-name' | 'last-name' | 'integer';
	/**
	 * Placeholder text when input is empty.
	 */
	placeholder?: string;
	/**
	 * Help text shown to help the user with usage of this input.
	 */
	helpText?: string;
	/**
	 * Set to `true` to disable.
	 */
	disabled?: boolean;
	/**
	 * Set to `true` to expand width to fit text.
	 */
	autosize?: boolean;
	/**
	 * Set to `true` to add icon for clearing textfield.
	 */
	clearable?: boolean;
	/**
	 * Error text to display _(shown in a `InlineError` component)_.
	 *
	 * User can also pass `true` boolean value to display the `InlineError` without any message.
	 */
	error?: string | boolean;
	/**
	 * Type of the return key for the software keyboard.
	 */
	returnKeyType?: 'done' | 'go' | 'next' | 'search' | 'send';
	/**
	 * Set to `true` to focus the field and to `false` to blur it.
	 *
	 * To initially focus this field when arriving on this screen, simply use
	 *
	 * ```tsx
	 * <TextField focused />
	 * ```
	 */
	focused?: boolean;
	/**
	 * Set to `true` to select all text when focused.
	 */
	selectTextOnFocus?: boolean;
	/**
	 * Automatically handled by `type` property. Use this to override or when using `type="text"`.
	 *
	 * @see https://reactnative.dev/docs/textinput#autocapitalize
	 */
	autoCapitalize?: TextInputProps['autoCapitalize'];
	/**
	 * Called when the input value changes. `value` property should be changed to reflect this new value.
	 *
	 * If not set, component will be an uncontrolled component. @see https://reactjs.org/docs/uncontrolled-components.html
	 */
	onChange?: (value: string) => void;
	/**
	 * Called when focused.
	 */
	onFocus?: () => void;
	/**
	 * Called when blurred.
	 */
	onBlur?: () => void;
	/**
	 * Called when the keyboard submit to this field.
	 */
	onSubmit?: () => void;
	// action?: string;
	// clearable?: boolean;
	// invalid?: boolean;
	// onAction?: (value: string) => void;
	// onClear?: () => void;
	/**
	 * Display a prefix label on the input.
	 */
	prefix?: string;
	/**
	 * Called when a key is pressed.
	 */
	onKeyPress?: TextInputProps['onKeyPress'];
}

/**
 * Input field that users can type into.
 */
export const TextInput = React.forwardRef<RNTextInput, ITextInputProps>(
	(
		{
			placeholder,
			value: valueRaw = '',
			onChange: onChangeRaw,
			type = 'text',
			focused = false,
			disabled = false,
			error = false,
			returnKeyType = 'next',
			onSubmit,
			selectTextOnFocus = false,
			autoCapitalize,
			prefix,
			onKeyPress,
			onFocus: onFocusProp,
			onBlur: onBlurProp,
		},
		ref
	) => {
		// @ts-ignore
		const [value, onChange] = useUncontrolledState(valueRaw, onChangeRaw);

		// Register the form field in the Form
		const inputRef = React.useRef<RNTextInput>(null);
		React.useImperativeHandle(ref, () => inputRef.current as RNTextInput);

		const [hasFocus, setHasFocus] = React.useState(focused);
		const onFocus = React.useCallback(() => {
			onFocusProp?.();
			setHasFocus(true);
		}, [onFocusProp]);
		const onBlur = React.useCallback(() => {
			onBlurProp?.();
			setHasFocus(false);
		}, [onBlurProp]);
		const onLabelClick = React.useCallback(() => {
			const input = inputRef.current;

			if (input) {
				input.focus();
			}
		}, []);
		// const handleChangeText = (val: string) => {
		// 	setText(val);
		// 	// onChangeText(val);
		// };

		// const handleClear = () => {
		// 	setText('');
		// };

		const handleOnAction = () => {
			// onAction(text);
		};

		/**
		 * Handle focus changes
		 */
		React.useEffect(() => {
			const input = inputRef.current;

			if (!input) {
				return;
			}

			if (focused) {
				input.focus();
			} else {
				input.blur();
			}
		}, [focused]);

		/**
		 *
		 */
		const inputType = React.useMemo<
			Pick<TextInputProps, 'keyboardType' | 'textContentType' | 'autoCapitalize'>
		>(() => {
			switch (type) {
				case 'text':
					return { textContentType: 'none', autoCapitalize };
				case 'email':
					return {
						keyboardType: 'email-address',
						textContentType: 'emailAddress',
						autoCompleteType: 'email',
						autoCapitalize: 'none',
					};
				case 'password':
					return {
						textContentType: 'password',
						autoCompleteType: 'password',
						autoCapitalize: 'none',
					};
				case 'new-password':
					return {
						textContentType: 'newPassword',
						autoCompleteType: 'password',
						autoCapitalize: 'none',
					};
				case 'first-name':
					return { textContentType: 'name', autoCapitalize: 'words' };
				case 'last-name':
					return { textContentType: 'familyName', autoCapitalize: 'words' };
				case 'integer':
					return { textContentType: 'none', keyboardType: 'number-pad' };
				default:
					return {};
			}
		}, [type]);

		return (
			<Styled.Box>
				{prefix ? (
					<View>
						<Text>{prefix}</Text>
					</View>
				) : null}
				<Styled.TextInput
					ref={inputRef}
					{...inputType}
					placeholder={placeholder}
					editable={!disabled}
					value={value}
					onChangeText={onChange}
					returnKeyType={returnKeyType}
					blurOnSubmit={returnKeyType !== 'next'} // Prevent keyboard flicker when going from one field to another
					onFocus={onFocus}
					onBlur={onBlur}
					onSubmitEditing={onSubmit}
					selectTextOnFocus={selectTextOnFocus}
					onKeyPress={onKeyPress}
				/>
				{/* {clearable && text !== '' && <Icon name="clear" onPress={handleClear} />} */}
				{/* {action && (
				<Button
					title={action}
					onPress={handleOnAction}
					style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
				/>
			)} */}
			</Styled.Box>
		);
	}
);
