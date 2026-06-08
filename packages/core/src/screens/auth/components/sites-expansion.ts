export interface SitesAccordionState {
	siteUuids: string[];
	expandedSiteUuid: string | undefined;
}

function siteUuidsEqual(left: string[], right: string[]) {
	return left.length === right.length && left.every((uuid, index) => uuid === right[index]);
}

export function getNextExpandedSiteUuid(
	previousSiteUuids: string[],
	currentSiteUuids: string[],
	currentExpandedSiteUuid: string | undefined
) {
	const addedSiteUuid = currentSiteUuids.find((uuid) => !previousSiteUuids.includes(uuid));
	if (addedSiteUuid) {
		return addedSiteUuid;
	}

	if (currentExpandedSiteUuid === '') {
		return '';
	}

	if (currentExpandedSiteUuid && currentSiteUuids.includes(currentExpandedSiteUuid)) {
		return currentExpandedSiteUuid;
	}

	return currentSiteUuids[0] ?? '';
}

export function getNextAccordionState(
	previousState: SitesAccordionState,
	currentSiteUuids: string[]
): SitesAccordionState {
	if (siteUuidsEqual(previousState.siteUuids, currentSiteUuids)) {
		return previousState;
	}

	return {
		siteUuids: currentSiteUuids,
		expandedSiteUuid: getNextExpandedSiteUuid(
			previousState.siteUuids,
			currentSiteUuids,
			previousState.expandedSiteUuid
		),
	};
}
