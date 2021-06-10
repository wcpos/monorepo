import * as React from 'react';
import LoginForm from './login-form';

// @ts-ignore
export const AuthLoginContext = React.createContext(() => {});
/**
 *
 */
export const AuthLoginProvider: React.FC = ({ children }) => {
	const [visible, setVisible] = React.useState(false);

	const show = () => {
		setVisible(true);
	};

	return (
		<AuthLoginContext.Provider value={show}>
			{children}
			{visible && <LoginForm onClose={() => setVisible(false)} />}
		</AuthLoginContext.Provider>
	);
};
