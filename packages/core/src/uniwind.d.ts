declare module 'uniwind' {
	export const Uniwind: {
		setTheme(theme: string): void;
	};

	export function useCSSVariable(name: string): string | undefined;
	export function useCSSVariable(names: string[]): (string | undefined)[];
	export function useUniwind(): {
		theme: string;
		hasAdaptiveThemes: boolean;
	};
	export function withUniwind<T>(component: T): T;
}
