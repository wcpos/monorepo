import * as React from 'react';
import { RestApiContext } from './rest-api-provider';

const useAppState = () => {
	return React.useContext(RestApiContext);
};

export default useAppState;
