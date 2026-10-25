type MetaRow = { id?: number; key?: string; value?: unknown };

/**
 * The draft's meta rows as the record should hold them. A just-added blank row (no id, no key) is
 * not an edit. A draft row with no id takes the id the record holds for the same key: the form
 * keeps the draft it opened with, so a row the store has numbered since (the outbox pushed it and
 * the answer or a pull landed) would otherwise be appended again. A numbered record row that THIS
 * FORM wrote earlier and the draft no longer has (removed, or its key was still being typed when
 * the debounce fired) goes out as a tombstone (`value: null`), or the store keeps it: WooCommerce
 * updates meta by id and never deletes a row that is merely absent. A row that arrived from the
 * store on its own was never this form's to delete, so `written` (the keys this form has sent)
 * bounds the tombstones, and a key the draft still holds is never one: a second row under that
 * key (another device's) is not a removal by this form.
 */
export function metaForWrite(
	rows: MetaRow[],
	stored: readonly MetaRow[],
	written: Set<string>
): MetaRow[] {
	const draft = rows.filter((row) => row?.id != null || String(row?.key ?? '') !== '');
	const claimed = new Set<number>();
	for (const row of draft) if (row.id != null) claimed.add(row.id);
	const reconciled = draft.map((row) => {
		if (row.id != null) return row;
		const id = stored.find(
			(entry) => entry.id != null && entry.key === row.key && !claimed.has(entry.id)
		)?.id;
		if (id == null) return row;
		claimed.add(id);
		return { ...row, id };
	});
	const draftKeys = new Set(draft.map((row) => String(row.key ?? '')));
	for (const entry of stored) {
		if (entry.id == null || claimed.has(entry.id)) continue;
		const key = String(entry.key ?? '');
		if (!written.has(key) || draftKeys.has(key)) continue;
		reconciled.push({ id: entry.id, key: entry.key, value: null });
	}
	for (const row of reconciled) {
		if (row.value !== null) written.add(String(row.key ?? ''));
	}
	return reconciled;
}
