import type * as React from 'react';
import { View } from 'react-native';

import { ScopedVariables } from 'uniwind';

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
				return (
					<ScopedVariables key={id} variables={scaleVariables(step, pointer)}>
						<View
							testID={id}
							{...{ dataSet: { cellId: id, ...(story.isolated ? { isolated: 'true' } : {}) } }}
							className="bg-background p-4"
						>
							{story.render()}
						</View>
					</ScopedVariables>
				);
			})
		)
	);
}
