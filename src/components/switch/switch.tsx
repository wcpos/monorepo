import * as React from 'react';
import { Switch as RNSwitch } from 'react-native';
import Platform from '@wcpos/common/src/lib/platform';
import { useUncontrolledState } from '@wcpos/common/src/hooks/use-uncontrolled-state';
import { useTheme } from 'styled-components/native';

export interface SwitchProps {
	/**
	 * Set to true if options is enabled.
	 */
	checked?: boolean;
	/**
	 * Called when `checked` property is changed. `checked` property should reflect change.
	 *
	 * If not set, component will be an uncontrolled component. @see https://reactjs.org/docs/uncontrolled-components.html
	 */
	onChecked?: (checked: boolean) => void;
}

/**
 * Used to toggle yes/no enabled/disabled options.
 *
 * >**Note:** The look of this component is very different depending if you are on Web, Android or iOS.
 */
export const Switch: React.FC<SwitchProps> = ({
	checked: checkedRaw = false,
	onChecked: onCheckedRaw,
}) => {
	const theme = useTheme();
	const [checked, onChecked] = useUncontrolledState(checkedRaw, onCheckedRaw);

	return (
		<RNSwitch
			trackColor={
				Platform.OS === 'ios'
					? {
							true: 'blue',
							false: 'green',
					  }
					: {
							true: 'black',
							false: 'red',
					  }
			}
			// @ts-ignore
			thumbColor={Platform.OS === 'ios' ? undefined : checked ? 'blue' : 'green'}
			onValueChange={onChecked}
			value={checked}
		/>
	);
};
