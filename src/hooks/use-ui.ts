import { useState, useEffect } from 'react';
import { Q } from '@nozbe/watermelondb';
import database from '../store';

export default function useUI() {
	const [ui, setUI] = useState(null);

	async function fetchUI() {
		const result = await database.collections
			.get('uis')
			.query(Q.where('section', 'products'))
			.fetch();
		setUI(result[0]);
	}

	useEffect(() => {
		fetchUI();
	}, []);

	return ui;
}
