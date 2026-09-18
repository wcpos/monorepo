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

export type Story = { id: string; render: () => React.ReactNode };

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
						<View testID={id} {...{ dataSet: { cellId: id } }} className="bg-background p-4">
							{story.render()}
						</View>
					</ScopedVariables>
				);
			})
		)
	);
}
