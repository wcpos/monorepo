import type * as React from 'react';
import { View } from 'react-native';

import { Link } from 'expo-router';
import { ScopedVariables } from 'uniwind';

import { Text } from '@wcpos/components/text';
import {
	type Pointer,
	POINTER_FLOORS,
	SCALE_STEPS,
	type ScaleStep,
	scaleVariables,
} from '@wcpos/components/lib/scale';

/**
 * `isolated`: the shoot renders this story's cells one per page (`?cell=`). An open
 * Radix popover, select or dialog owns the document's focus, so six of them on one
 * page close or hide each other; the anchored overlays' open stories ask for it.
 */
export type Story = { id: string; render: () => React.ReactNode; isolated?: boolean };

export function GalleryCells({
	component,
	stories,
	cell,
}: {
	component: string;
	stories: Story[];
	cell?: string;
}) {
	return stories.flatMap((story) =>
		(Object.keys(SCALE_STEPS) as ScaleStep[]).flatMap((step) =>
			(Object.keys(POINTER_FLOORS) as Pointer[]).map((pointer) => {
				const id = `${component}--${story.id}--${step}-${pointer}`;
				if (cell && cell !== id) return null;
				const dataSet = { cellId: id, ...(story.isolated ? { isolated: 'true' } : {}) };
				// On the full page an isolated story is a link to its own cell, not a mounted
				// overlay: six open ones would close or cover each other. The cell keeps its id
				// and flag so the shoot still discovers it here and navigates to `?cell=`.
				if (story.isolated && !cell) {
					return (
						<View key={id} testID={id} {...{ dataSet }} className="bg-background p-4">
							<Link href={{ pathname: '/gallery/[component]', params: { component, cell: id } }}>
								<Text className="text-primary web:underline">{id}</Text>
							</Link>
						</View>
					);
				}
				return (
					<ScopedVariables key={id} variables={scaleVariables(step, pointer)}>
						<View testID={id} {...{ dataSet }} className="bg-background p-4">
							{story.render()}
						</View>
					</ScopedVariables>
				);
			})
		)
	);
}
