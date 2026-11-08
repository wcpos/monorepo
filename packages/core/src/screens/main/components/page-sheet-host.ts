import { useIsPhone } from '@wcpos/components/lib/device';

/**
 * The host a drawer page's sheet renders into: on wide the drawer layout's `scene` host, beside
 * the rail and over the page bar, as the page bar's cashier sheet (#3061); a phone has no rail,
 * so the root. The POS passes its own `pos` host instead. A page never mounts a host of its own.
 */
export function usePageSheetHost(): string | undefined {
	return useIsPhone() ? undefined : 'scene';
}
