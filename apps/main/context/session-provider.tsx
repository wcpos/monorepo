import React from 'react';

import { useRouter } from 'expo-router';

import { Splash } from '../components/splash-screen';

interface SessionContextType {
	isLoading: boolean;
	session: any;
	signIn: () => void;
	signOut: () => void;
}

const SessionContext = React.createContext<SessionContextType | undefined>(undefined);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [isLoading, setIsLoading] = React.useState(true);
	const [session, setSession] = React.useState<any>(null);
	const router = useRouter();

	React.useEffect(() => {
		// Simulate a 5-second loading period
		const timer = setTimeout(() => {
			setIsLoading(false);
		}, 5000);
		return () => clearTimeout(timer);
	}, []);

	const signIn = () => {
		setSession({ user: 'dummy' });
		router.replace('/(app)/(drawer)/(pos)');
	};

	const signOut = () => {
		setSession(null);
		router.replace('/(auth)/connect');
	};

	return (
		<SessionContext.Provider value={{ isLoading, session, signIn, signOut }}>
			{children}
		</SessionContext.Provider>
	);
};

export const useSession = () => {
	const context = React.useContext(SessionContext);
	if (!context) {
		throw new Error('useSessionContext must be used within a SessionProvider');
	}
	return context;
};
