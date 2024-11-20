import * as React from 'react';

import log from '@wcpos/utils/src/logger';

function useWhyDidYouUpdate(name: string, props: any) {
	// Get a mutable ref object where we can store props ...
	// ... for comparison next time this hook runs.
	const previousProps = React.useRef();
	React.useEffect(() => {
		if (previousProps.current) {
			// Get all keys from previous and current props
			// @ts-ignore
			const allKeys = Object.keys({ ...previousProps.current, ...props });
			// Use this object to keep track of changed props
			const changesObj = {};
			// Iterate through keys
			allKeys.forEach((key) => {
				// If previous is different from current
				// @ts-ignore
				if (previousProps.current[key] !== props[key]) {
					// Add to changesObj
					// @ts-ignore
					changesObj[key] = {
						// @ts-ignore
						from: previousProps.current[key],
						to: props[key],
					};
				}
			});
			// If changesObj not empty then output to console
			if (Object.keys(changesObj).length) {
				log.debug('[why-did-you-update]', name, changesObj);
			}
		}
		// Finally update previousProps with current props for next hook call
		previousProps.current = props;
	});
}

export default useWhyDidYouUpdate;
