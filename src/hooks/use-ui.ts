import { useState, useEffect } from 'react';
import { Q } from '@nozbe/watermelondb';
import database from '../store';

const uiCollection = database.collections.get('uis');

const initCustomerUI = async () => {
	const ui = uiCollection.prepareCreate((model: UI) => {
		model.section = 'customers';
		model.sortBy = 'last_name';
		model.sortDirection = 'asc';
	});
	const batch = [ui];

	const columns = [
		{
			key: 'avatar_url',
			disableSort: true,
		},
		{ key: 'first_name' },
		{
			key: 'last_name',
		},
		{ key: 'email' },
		{
			key: 'role',
		},
		{ key: 'username' },
		{ key: 'billing' },
		{ key: 'shipping' },
		{
			key: 'actions',
			disableSort: true,
		},
	];

	columns.map((column: any, index: number) => {
		batch.push(
			ui.columns.collection.prepareCreate((model: any) => {
				model.ui.set(ui);
				model.key = column.key;
				model.hide = column.hide;
				model.disableSort = column.disableSort;
				model.flexGrow = column.flexGrow;
				model.flexShrink = column.flexShrink;
				model.width = column.width;
				model.section = 'customers';
				model.order = index;
			})
		);
	});

	return await database.action(async () => await database.batch(...batch));
};

const initUI = (section: string) => {
	initCustomerUI();
};

export default function useUI(section: string) {
	const [ui, setUI] = useState(null);

	useEffect(() => {
		async function fetchUI() {
			const result = await uiCollection.query(Q.where('section', section)).fetch();
			if (result.length > 0) {
				setUI(result[0]);
			} else {
				initUI(section);
			}
		}
		fetchUI();
	}, [section]);

	return ui;
}
