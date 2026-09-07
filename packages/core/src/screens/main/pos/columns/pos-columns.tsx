import * as React from 'react';

import { Panel, PanelGroup, PanelResizeHandle } from '@wcpos/components/panels';
import { useDocField } from '@wcpos/query';

import '../register-panel-entries';
import { Slot } from '../../../../extensions/slots';
import { useUISettings } from '../../contexts/ui-settings';

import type { ReadonlyView, SlotContracts } from '../../../../extensions/slots';

const PRODUCTS_ENTRY_ID = 'products';

/** This slot grants no host methods: the panels are pure layout. */
const NO_API: SlotContracts['pos.columns.panel']['api'] = {};

/**
 * A panel's side is fixed for as long as it is mounted, so these views never notify.
 * They are module constants because `useSlotValue` needs a stable snapshot.
 */
const NEVER_CHANGES = () => () => {};
const PANEL_VIEWS: Record<
	'left' | 'right',
	ReadonlyView<SlotContracts['pos.columns.panel']['value']>
> = {
	left: { value: { side: 'left', isColumn: true }, subscribe: NEVER_CHANGES },
	right: { value: { side: 'right', isColumn: true }, subscribe: NEVER_CHANGES },
};

export function POSColumns() {
	const { uiSettings, patchUI } = useUISettings('pos-products');
	const position = useDocField(uiSettings, (value) => value.position);
	const productsOnRight = position === 'right';

	return (
		<Slot
			id="pos.columns.panel"
			api={NO_API}
			data={(_entry, index, total) =>
				PANEL_VIEWS[(productsOnRight ? total - 1 - index : index) === 0 ? 'left' : 'right']
			}
		>
			{(entries) => {
				const ordered = productsOnRight ? [...entries].reverse() : entries;
				const productsIndex = ordered.findIndex(
					({ descriptor }) => descriptor.id === PRODUCTS_ENTRY_ID
				);
				return (
					<PanelGroup
						onLayoutChanged={(layout, { isUserInteraction }) => {
							const productsWidth = layout[productsIndex];
							if (isUserInteraction && productsWidth !== undefined) {
								void patchUI({ width: productsWidth });
							}
						}}
						direction="horizontal"
					>
						{ordered.map(({ descriptor, element }, index) => (
							<React.Fragment key={descriptor.id}>
								{index > 0 ? <PanelResizeHandle testID="pos-resize-handle" /> : null}
								{/* BOTH panels stay sized: before the group's layout reaches each panel's
							    animated style, panels render with flexGrow = defaultSize ?? 1, so a sized
							    products panel next to an unsized cart renders 60:1 — a ~1.5% cart sliver.
							    On slow emulators (CI, software GPU) that pre-layout style can stick for
							    the whole session, which is how both Android nightlies lost the entire
							    cart column (run 33110203691). With both sides sized the fallback IS the
							    correct layout, so the race is harmless. */}
								<Panel
									testID={`pos-${descriptor.id}-panel`}
									defaultSize={
										descriptor.id === PRODUCTS_ENTRY_ID ? uiSettings.width : 100 - uiSettings.width
									}
									minSize={25}
									id={descriptor.id}
								>
									{element}
								</Panel>
							</React.Fragment>
						))}
					</PanelGroup>
				);
			}}
		</Slot>
	);
}
