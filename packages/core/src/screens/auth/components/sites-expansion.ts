export function getNextExpandedSiteUuid(
	previousSiteUuids: string[],
	currentSiteUuids: string[],
	currentExpandedSiteUuid: string | undefined
) {
	const addedSiteUuid = currentSiteUuids.find((uuid) => !previousSiteUuids.includes(uuid));
	if (addedSiteUuid) {
		return addedSiteUuid;
	}

	if (currentExpandedSiteUuid && currentSiteUuids.includes(currentExpandedSiteUuid)) {
		return currentExpandedSiteUuid;
	}

	return currentSiteUuids[0] ?? '';
}
