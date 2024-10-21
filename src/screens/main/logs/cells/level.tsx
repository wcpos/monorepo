import * as React from 'react';

import { CellContext } from '@tanstack/react-table';

import { ButtonPill, ButtonText } from '@wcpos/components/src/button';

type LogDocument = import('@wcpos/database').LogDocument;

const variantMap = {
	error: 'ghost-error',
	warn: 'ghost-warning',
	info: 'ghost-secondary',
	debug: 'ghost-success',
};

/**
 *
 * @param param0
 * @returns
 */
export const Level = ({ row }: CellContext<{ document: LogDocument }, 'level'>) => {
	const log = row.original.document;

	return (
		<ButtonPill variant={variantMap[log.level]} size="xs">
			<ButtonText>{log.level}</ButtonText>
		</ButtonPill>
	);
};
