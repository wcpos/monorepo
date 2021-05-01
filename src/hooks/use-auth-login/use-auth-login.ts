import * as React from 'react';
import { AuthLoginContext } from './auth-login-provider';

export const useAuthLogin = () => {
	return React.useContext(AuthLoginContext);
};
