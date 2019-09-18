import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { Context } from './';

export const useUI = section => {
	const { t } = useTranslation();
	const { state, dispatch } = useContext(Context);
	const ui = state && state[section];

	// add labels and order
	ui.columns.map((column, index) => {
		column.label = t(section + '.column.label.' + column.key);
		column.order = index;
	});

	if (ui.display) {
		ui.display.map((display, index) => {
			display.label = t(section + '.display.label.' + display.key);
		});
	}

	const updateUI = () => {
		dispatch();
	};

	return { ui, updateUI };
};
