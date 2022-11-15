import * as React from 'react';
import { Dimensions } from 'react-native';

import debounce from 'lodash/debounce';

export function useScreenSize() {
	const [screen, setScreen] = React.useState(Dimensions.get('window'));

	const onChange = React.useMemo(() => {
		return debounce(({ window }) => {
			setScreen(window);
		}, 250);
	}, []);

	/**
	 * Listen to screen dimension changes
	 */
	React.useEffect(() => {
		Dimensions.addEventListener('change', onChange);
		return () => {
			Dimensions.removeEventListener('change', onChange);
		};
	}, []);

	return screen;
}
