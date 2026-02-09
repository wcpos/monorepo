import { useUniwind } from 'uniwind';

export function useColorScheme() {
	const { theme } = useUniwind();
	const colorScheme = (theme as 'light' | 'dark') ?? 'dark';
	return {
		colorScheme,
		isDarkColorScheme: colorScheme === 'dark',
	};
}
