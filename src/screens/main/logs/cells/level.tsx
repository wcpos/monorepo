import * as React from 'react';

import Pill from '@wcpos/components/src/pill';
import Text from '@wcpos/components/src/text';

const colorMap = {
	error: 'critical',
	warn: 'warning',
	info: 'secondary',
	debug: 'green',
};

export const Level = ({ item: log }) => {
	const color = colorMap[log.level];

	return (
		<Pill color={color}>
			<Text type="inverse">{log.level}</Text>
		</Pill>
	);
};
