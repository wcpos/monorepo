import { useState, useEffect } from 'react';
import { Q } from '@nozbe/watermelondb';
import useDatabase from './use-database';

export default function useUI(section: string) {
	const [ui, setUI] = useState(null);
	const database = useDatabase();

	useEffect(() => {
		async function fetchUI() {
			const uiCollection = database.collections.get('uis');
			let result = await uiCollection.query(Q.where('section', section)).fetch();
			if (result.length === 0) {
				await uiCollection.modelClass.resetDefaults(section);
				result = await uiCollection.query(Q.where('section', section)).fetch();
			}
			setUI(result[0]);
		}
		fetchUI();
	}, [database.collections, section]);

	return ui;
}
