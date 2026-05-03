import { Decoration, type DecorationSet, MatchDecorator, ViewPlugin } from '@codemirror/view';

/**
 * Mustache-tag overlay copied from the woocommerce-pos template-editor
 * package so syntax highlighting between the two stays consistent.
 */
const mustacheDecorator = new MatchDecorator({
	regexp: /\{\{\{?(?:[^}]|\}(?!\}\}?))*\}?\}\}/g,
	decoration: Decoration.mark({ class: 'cm-mustache' }),
});

export const mustacheOverlay = ViewPlugin.define(
	(view) => ({
		decorations: mustacheDecorator.createDeco(view),
		update(u) {
			this.decorations = mustacheDecorator.updateDeco(u, this.decorations);
		},
	}),
	{ decorations: (v) => v.decorations as DecorationSet }
);
