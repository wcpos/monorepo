import * as React from 'react';
import { CurrentUserContext } from './current-user-provider';

const useAppState = () => {
	return React.useContext(CurrentUserContext);
};

export default useAppState;
