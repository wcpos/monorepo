import { useState, useEffect } from 'react';
import { Q } from '@nozbe/watermelondb';
import database from '../store';

const uiCollection = database.collections.get('uis');

export default function useUI(section: string) {
	const [ui, setUI] = useState(null);

	useEffect(() => {
		async function fetchUI() {
			let result = await uiCollection.query(Q.where('section', section)).fetch();
			if (result.length === 0) {
				await uiCollection.modelClass.resetDefaults(section);
				result = await uiCollection.query(Q.where('section', section)).fetch();
			}
			setUI(result[0]);
		}
		fetchUI();
	}, [section]);

	return ui;
}
