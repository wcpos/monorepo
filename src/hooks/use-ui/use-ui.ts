import React from 'react';
import { useTranslation } from 'react-i18next';
import initialUI from './initial.json';

type sectionType = Extract<keyof typeof initialUI, string>;

/**
 * initUI helper to set up the default UI for each section
 * @param section
 * @param t
 */
const initUI = (section: sectionType, t) => {
	const ui = initialUI[section];
	if (!ui) return;

	ui?.columns.map((column, index) => {
		column.label = t(section + '.column.label.' + column.key);
		column.order = index;
	});

	if (ui?.display) {
		ui.display.map((display, index) => {
			display.label = t(section + '.display.label.' + display.key);
		});
	}

	return ui;
};

/**
 *
 * @param section
 * @TODO process translations only once on start up
 * @TODO make sure changes only cause relevant components to re-render
 */
const useUi = (section: sectionType) => {
	const { t } = useTranslation();
	const [ui];

	return { ui, updateUI };
};

export default useUi;
