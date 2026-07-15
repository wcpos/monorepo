import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';

import type { CellContext } from '@tanstack/react-table';
import type { QueryStateActions } from '../../../../query';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export function ProductCategories({
	table,
	row,
}: CellContext<{ document: ProductDocument }, 'categories'>) {
	const product = row.original.document;
	const categories = useObservableEagerState(product.categories$!) || [];

	const meta = table.options.meta as unknown as {
		actions?: Pick<QueryStateActions<'products'>, 'setFilter'>;
		query?: {
			removeWhere(field: string): {
				and(selector: Record<string, unknown>[]): { exec(): void };
			};
		};
	};

	if (categories.length === 0) {
		return null;
	}

	/**
	 * @NOTE - Don't use a unique key here, index is sufficient
	 */
	return (
		<HStack className="w-full flex-wrap gap-1">
			{(categories || []).map((cat, index) => (
				<ButtonPill
					variant="ghost-primary"
					size="xs"
					key={index}
					onPress={() => {
						if (cat.id === undefined) return;
						if (meta.actions) {
							meta.actions.setFilter('categories', [cat.id]);
						} else {
							meta.query
								?.removeWhere('categories')
								.and([{ $or: [{ categories: { $elemMatch: { id: cat.id } } }] }])
								.exec();
						}
					}}
				>
					<ButtonText numberOfLines={1} decodeHtml>
						{cat.name}
					</ButtonText>
				</ButtonPill>
			))}
		</HStack>
	);
}
