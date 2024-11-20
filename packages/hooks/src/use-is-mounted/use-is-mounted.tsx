import * as React from 'react';

/**
 * Example use:
 * 
function App() {
	const isMounted = useIsMounted();
	const [data, setData] = useState('Is fetching data.');

	useEffect(() => {
			(async function () {
					const resultData = await someAsyncService();
					if (isMounted.current) {
						setData(resultData);
					}
			})()
	}, [isMounted]);

	return (
		...
	);
}
 */

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
