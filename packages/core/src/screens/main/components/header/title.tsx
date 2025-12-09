import * as React from 'react';

import { HeaderTitleProps } from '@react-navigation/elements';

import { Text } from '@wcpos/components/text';

/**
 * Header title uses sidebar-foreground color since the header background
 * matches the sidebar (dark in all themes).
 * 
 * TODO - text truncation doesn't trigger when screen size changes
 */
const HeaderTitle = ({ children }: HeaderTitleProps) => {
	return (
		<Text className="text-sidebar-foreground text-xl" numberOfLines={1} decodeHtml>
			{children}
		</Text>
	);
};

export default HeaderTitle;
