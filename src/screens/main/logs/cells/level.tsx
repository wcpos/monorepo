import * as React from 'react';

import { CellContext } from '@tanstack/react-table';

import { ButtonPill, ButtonText } from '@wcpos/tailwind/src/button';

type LogDocument = import('@wcpos/database').LogDocument;

const colorMap = {
	error: 'critical',
	warn: 'warning',
	info: 'secondary',
	debug: 'success',
};

/**
 *
 * @param param0
 * @returns
 */
export const Level = ({ row }: CellContext<LogDocument, 'level'>) => {
	const log = row.original;
	const color = colorMap[log.level];

	return (
		<ButtonPill variant={color}>
			<ButtonText>{log.level}</ButtonText>
		</ButtonPill>
	);
};
