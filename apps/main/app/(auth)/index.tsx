import { Redirect } from 'expo-router';

/**
 * `/` inside the auth group. expo-router 58 retired `initialRouteName` (its `anchor` only
 * seeds a stack entered through a deep link), so without an index the root URL rendered
 * the not-found screen; the connect screen is what every entry to `/` means here.
 */
export default function AuthIndex() {
	return <Redirect href="/connect" />;
}
