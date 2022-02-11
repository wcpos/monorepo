import * as React from 'react';
import { OnlineStatusContext } from './provider';

const useOnlineStatus = () => {
	return React.useContext(OnlineStatusContext);
};

export default useOnlineStatus;
