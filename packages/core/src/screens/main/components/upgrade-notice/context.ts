import * as React from 'react';

export const UpgradeNoticeContext = React.createContext({
	showUpgrade: false,
	setShowUpgrade: (_show: boolean) => {},
});
