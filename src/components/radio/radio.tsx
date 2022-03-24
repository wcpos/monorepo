import * as React from 'react';
import { TouchableWithoutFeedback } from 'react-native';
import useUncontrolledState from '@wcpos/common/src/hooks/use-uncontrolled-state';
import Box from '../box';
import Text from '../text';
import InlineError from '../inline-error';
import { BackgroundCircle, CheckMark } from './styles';

export interface RadioProps {
	/**
	 * True if selected.
	 */
	checked?: boolean;
	/**
	 * Label to display next to the Radio Button.
	 */
	label: React.ReactNode;
	/**
	 * Display an error state.
	 */
	error: boolean | string;
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
}

export const Radio = ({
	checked: checkedRaw = false,
	label,
	error,
	helpText,
	disabled = false,
	onChange: onChangeRaw,
}: RadioProps) => {
	const [checked, onChange] = useUncontrolledState(checkedRaw, onChangeRaw);

	const onClick = React.useCallback(() => {
		// Only check if selected, unchecking should be performed by selecting a different option.
		if (!checked) {
			onChange(true);
		}
	}, [checked, onChange]);

	return (
		<TouchableWithoutFeedback onPress={onClick} disabled={disabled}>
			<Box horizontal space="medium">
				<BackgroundCircle>
					<CheckMark checked={checked} />
				</BackgroundCircle>
				<Box>
					<Text>{label}</Text>

					{error ? (
						<Box>
							<InlineError message={typeof error === 'string' ? error : ''} />
						</Box>
					) : null}

					{helpText ? (
						<Box>
							<Text type="secondary" size="small">
								{helpText}
							</Text>
						</Box>
					) : null}
				</Box>
			</Box>
		</TouchableWithoutFeedback>
	);
};
