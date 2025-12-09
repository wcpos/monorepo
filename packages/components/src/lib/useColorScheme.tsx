import { useUniwind } from 'uniwind';

export function useColorScheme() {
	const { colorScheme, setColorScheme, toggleColorScheme } = useUniwind();
	return {
		colorScheme: colorScheme ?? 'dark',
		isDarkColorScheme: colorScheme === 'dark',
		setColorScheme,
		toggleColorScheme,
	};
}
