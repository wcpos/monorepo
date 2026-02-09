import * as React from 'react';

import { CellContext } from '@tanstack/react-table';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import type { Query } from '@wcpos/query';

type LogDocument = import('@wcpos/database').LogDocument;

const variantMap: Record<string, string> = {
	error: 'ghost-error',
	warn: 'ghost-warning',
	info: 'ghost-secondary',
	debug: 'ghost-muted',
	success: 'ghost-success',
	audit: 'ghost-info',
};

/**
 *
 */
export const Level = ({ row, table }: CellContext<{ document: LogDocument }, 'level'>) => {
	const log = row.original.document;
	const query = (table.options.meta as Record<string, unknown> | undefined)?.query as
		| Query<any>
		| undefined;

	const handlePress = React.useCallback(() => {
		if (query) {
			query.where('level').in([log.level]).exec();
		}
	}, [query, log.level]);

	return (
		<ButtonPill
			variant={
				(log.level ? variantMap[log.level] : undefined) as React.ComponentProps<
					typeof ButtonPill
				>['variant']
			}
			size="xs"
			onPress={handlePress}
		>
			<ButtonText>{log.level}</ButtonText>
		</ButtonPill>
	);
};
