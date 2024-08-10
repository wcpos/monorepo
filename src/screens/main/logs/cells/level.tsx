import * as React from 'react';

import { ButtonPill, ButtonText } from '@wcpos/tailwind/src/button';

const colorMap = {
	error: 'critical',
	warn: 'warning',
	info: 'secondary',
	debug: 'green',
};

export const Level = ({ item: log }) => {
	const color = colorMap[log.level];

	return (
		<ButtonPill variant={color}>
			<ButtonText>{log.level}</ButtonText>
		</ButtonPill>
	);
};
