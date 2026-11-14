declare module 'uniwind' {
	export const Uniwind: {
		setTheme(theme: string): void;
	};

	/** Scopes CSS custom properties to a subtree; see contexts/scale. */
	export const ScopedVariables: (props: {
		variables: Record<string, string | number>;
		children?: import('react').ReactNode;
	}) => import('react').ReactElement | null;

	export function useCSSVariable(name: string): string | undefined;
	export function useCSSVariable(names: string[]): (string | undefined)[];
	export function useUniwind(): {
		theme: string;
		hasAdaptiveThemes: boolean;
	};
	export function withUniwind<T>(component: T): T;
}
