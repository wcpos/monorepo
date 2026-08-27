import React from 'react';

import { PanelGroupContext } from '../PanelGroupContext';

export function usePanelGroupContext() {
	const context = React.useContext(PanelGroupContext);

	return {
		direction: context?.direction,
		groupId: context?.groupId,
	};
}
