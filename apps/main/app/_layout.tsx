import { Slot } from 'expo-router';

import { SessionProvider } from '../context/session-provider';

import '../global.css';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: '(app)',
};

export default function RootLayout() {
	return (
		<SessionProvider>
			<Slot />
		</SessionProvider>
	);
}
