import { useCSSVariable } from 'uniwind';

/**
 * React Navigation needs a concrete JS background color on web/Electron.
 * Relying only on a parent `bg-background` wrapper can expose the browser or
 * Electron white base layer behind transparent screen containers.
 */
export function useNavigationBackground(): string {
	return useCSSVariable('--color-background') as string;
}
