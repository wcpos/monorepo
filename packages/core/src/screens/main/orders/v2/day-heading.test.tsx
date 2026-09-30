/** @jest-environment jsdom */
import * as React from 'react';

import { screen } from '@testing-library/react';

import * as VirtualizedList from '@wcpos/components/virtualized-list';

import { renderTable, reset } from '../../components/data-table/v2/test-fixture';
import { DataTableRow } from '../../components/data-table/v2/rows';
import { DayHeading, groupOrders, isDay, type OrderHit, type OrderListItem } from './day-heading';

import type { Row } from '../../../../table-types';
import type { DataTableFeatures } from '../../components/data-table/v2';

beforeEach(reset);
it('renders actual day headings alongside stable order rows without counting headings as hits', () => {
	const hits = [
		{
			id: 'hit-1',
			record: { uuid: 'uuid-1', payload: { date_created_gmt: '2026-09-17T01:00:00' } },
		},
	] as OrderHit[];
	const data = groupOrders(hits, 'date_created_gmt', 'America/New_York', () => 'Today');
	renderTable({
		tableConfig: { data },
		renderItem: ({ item }: { item: Row<OrderListItem, DataTableFeatures> }) => (
			<VirtualizedList.Item>
				{isDay(item.original) ? <DayHeading {...item.original} /> : <DataTableRow item={item} />}
			</VirtualizedList.Item>
		),
	});
	expect(screen.getByTestId('orders-day-heading-2026-09-16').textContent).toBe('Today');
	expect(screen.getByTestId('data-table-row-uuid-1')).toBeTruthy();
	expect(screen.getByTestId('data-table-loaded-count').textContent).toBe('1');
});

jest.mock('../../../../contexts/app-state', () => ({}));
