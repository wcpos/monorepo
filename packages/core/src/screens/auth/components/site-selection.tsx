import * as React from 'react';

/** A site's explicit picks on the connect screen (null until the cashier picks). */
export interface SiteSelection {
	pickedUserUuid: string | null;
	selectedStoreId: string | null;
}

type Update = (current: SiteSelection) => SiteSelection;

const EMPTY: SiteSelection = { pickedUserUuid: null, selectedStoreId: null };

// `pick`, not `update`: the seam ratchet (seam.test.ts) reads a member named `update` as a
// record mutator, and this is React state, not a document.
const SiteSelectionContext = React.createContext<{
	selections: Record<string, SiteSelection>;
	pick: (siteUuid: string, next: Update) => void;
} | null>(null);

/**
 * Holds every site's picks above the accordion. A collapsed section is
 * unmounted (and a lone site swaps Site for AccordionSite when the page folds
 * it), so picks kept inside WPUsers would reset on every fold and expand.
 */
export function SiteSelectionProvider({ children }: React.PropsWithChildren) {
	const [selections, setSelections] = React.useState<Record<string, SiteSelection>>({});
	const pick = React.useCallback((siteUuid: string, next: Update) => {
		setSelections((current) => ({ ...current, [siteUuid]: next(current[siteUuid] ?? EMPTY) }));
	}, []);
	const value = React.useMemo(() => ({ selections, pick }), [selections, pick]);
	return <SiteSelectionContext.Provider value={value}>{children}</SiteSelectionContext.Provider>;
}

/** A site's picks; component-local when rendered outside a provider. */
export function useSiteSelection(siteUuid: string): [SiteSelection, (update: Update) => void] {
	const context = React.useContext(SiteSelectionContext);
	const [local, setLocal] = React.useState(EMPTY);
	const contextPick = context?.pick;
	const pick = React.useCallback(
		(next: Update) => (contextPick ? contextPick(siteUuid, next) : setLocal(next)),
		[contextPick, siteUuid]
	);
	return [context ? (context.selections[siteUuid] ?? EMPTY) : local, pick];
}
