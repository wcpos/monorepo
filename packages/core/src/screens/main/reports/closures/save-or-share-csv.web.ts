export async function saveOrShareCsv(body: string, filename: string): Promise<void> {
	const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
	const anchor = document.createElement('a');
	try {
		anchor.href = url;
		anchor.download = filename;
		anchor.style.display = 'none';
		document.body.appendChild(anchor);
		anchor.click();
	} finally {
		anchor.remove();
		URL.revokeObjectURL(url);
	}
}
