/**
 * Native navigator backgrounds stay transparent so className-driven Uniwind
 * shadow nodes can update without high-level navigator theme subscriptions.
 */
export function useNavigationBackground(): string {
	return 'transparent';
}
