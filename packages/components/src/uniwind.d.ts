declare module 'uniwind' {
	export function useCSSVariable(name: string): string | undefined;
	export function useCSSVariable(names: string[]): (string | undefined)[];
	export function withUniwind<T>(component: T): T;
}
