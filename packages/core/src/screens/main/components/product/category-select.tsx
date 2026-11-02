import * as React from 'react';

import { Suspense } from '@wcpos/components/suspense';
import type { HierarchicalOption } from '@wcpos/components/tree-combobox';
import type { EngineRecord } from '@wcpos/query';

import { useAllCategoriesHandle, useQuerySnapshot } from '../../../../query';

import type { QueryHandle } from '../../../../query';

/**
 * Loads all resident categories and passes them as HierarchicalOption[] to a callback.
 * Intended to be rendered inside TreeComboboxContent so it only mounts when the popover opens.
 *
 * @param onOptionsLoaded Must be a stable reference (e.g. setState) — an unstable
 *   callback will cause infinite re-renders via the useEffect dependency.
 */
function CategoryTreeLoaderInner({
	onOptionsLoaded,
	handle,
}: {
	onOptionsLoaded: (options: HierarchicalOption[]) => void;
	handle: QueryHandle;
}) {
	const result = useQuerySnapshot(handle, []) as unknown as {
		hits: { id: string; record: EngineRecord<'categories'> }[];
	};

	const options = React.useMemo<HierarchicalOption[]>(
		() =>
			result.hits
				.filter(({ record }) => record.payload.id != null)
				.map(({ record }) => ({
					value: String(record.payload.id),
					label: record.payload.name ?? '',
					parentId:
						record.payload.parent && record.payload.parent > 0
							? String(record.payload.parent)
							: undefined,
				})),
		[result.hits]
	);

	React.useEffect(() => {
		onOptionsLoaded(options);
	}, [options, onOptionsLoaded]);

	return null;
}

export function CategoryTreeLoader(props: {
	onOptionsLoaded: (options: HierarchicalOption[]) => void;
}) {
	// The handle's owner is HERE, above the boundary, and only the reader is inside it. The
	// owner's retain is an effect, and it is what starts the read: an owner inside the boundary
	// its reader suspends is discarded with the aborted render and never commits, so the read
	// never starts and the reader waits forever (#1707). Above it, this component commits
	// alongside the fallback, the read starts, and the retry reads the same handle's answer.
	const handle = useAllCategoriesHandle();

	return (
		<Suspense>
			<CategoryTreeLoaderInner {...props} handle={handle} />
		</Suspense>
	);
}
