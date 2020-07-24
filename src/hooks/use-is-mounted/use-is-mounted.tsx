import React from 'react';

const useIsMounted = (): React.MutableRefObject<boolean> => {
	const isMounted = React.useRef(false);

	React.useEffect(() => {
		isMounted.current = true;
		return () => {
			isMounted.current = false;
		};
	}, []);

	return isMounted;
};

export default useIsMounted;
