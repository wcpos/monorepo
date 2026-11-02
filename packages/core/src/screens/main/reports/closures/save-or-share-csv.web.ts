export async function saveOrShareCsv(body: string, filename: string): Promise<void> {
	const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
	const anchorElement = document.createElement('a');
	try {
		anchorElement.href = url;
		anchorElement.download = filename;
		anchorElement.style.display = 'none';
		document.body.appendChild(anchorElement);
		anchorElement.click();
	} finally {
		anchorElement.remove();
		URL.revokeObjectURL(url);
	}
}
