import type * as React from 'react';
import { View } from 'react-native';

import { ScopedVariables } from 'uniwind';

export type Story = { id: string; render: () => React.ReactNode };
// Scale-and-density step table; moves into the library with the token pass.
const steps = {
	compact: [3.5, 13, 40, 36, 56, 6, 34],
	regular: [4, 14, 44, 44, 64, 8, 40],
	spacious: [5, 16, 52, 52, 80, 10, 48],
};
const floors = { coarse: 44, fine: 24 };

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
		Object.entries(steps).flatMap(([step, values]) =>
			Object.entries(floors).map(([floor, minimum]) => {
				const id = `${component}--${story.id}--${step}-${floor}`;
				if (cell && cell !== id) return null;
				const [spacing, base, ctl, row, tile, radius, amt] = values;
				return (
					<ScopedVariables
						key={id}
						variables={{
							'--spacing': spacing,
							'--text-base': base,
							'--spacing-ctl': Math.max(ctl, minimum),
							'--spacing-row': Math.max(row, minimum),
							'--spacing-tile': tile,
							'--radius': radius,
							'--text-amt': amt,
						}}
					>
						<View testID={id} {...{ dataSet: { cellId: id } }} className="bg-background p-4">
							{story.render()}
						</View>
					</ScopedVariables>
				);
			})
		)
	);
}
