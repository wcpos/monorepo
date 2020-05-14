import React from 'react';
import { useTranslation } from 'react-i18next';
import { Context } from './provider';

/**
 *
 * @param section
 * @TODO process translations only once on start up
 * @TODO make sure changes only cause relevant components to re-render
 */
const useUi = (section) => {
	const { t } = useTranslation();
	const { state, dispatch } = React.useContext(Context);
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

	const updateUI = (action) => {
		dispatch(action);
	};

	return { ui, updateUI };
};

export default useUi;
