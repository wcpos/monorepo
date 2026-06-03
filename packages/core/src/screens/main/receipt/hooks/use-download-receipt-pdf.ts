import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../../contexts/translations';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import { PdfBytes, saveOrSharePdf } from '../utils/save-or-share-pdf';

const httpLogger = getLogger(['wcpos', 'http', 'rest']);

type DownloadReceiptPdfOptions = {
	orderId?: number;
	templateId?: number | string | null;
};

type PdfResponse = {
	data: PdfBytes;
};

/**
 * Download the server-rendered PDF receipt for the selected receipt template.
 */
export function useDownloadReceiptPdf() {
	const http = useRestHttpClient();
	const t = useT();
	const [isDownloading, setIsDownloading] = React.useState(false);

	const download = React.useCallback(
		async ({ orderId, templateId }: DownloadReceiptPdfOptions): Promise<void> => {
			if (!orderId || templateId == null || templateId === '') {
				return;
			}

			const normalizedTemplateId = String(templateId);
			const filename = `receipt-${orderId}.pdf`;

			try {
				setIsDownloading(true);
				const { data } = (await http.get(`/receipts/${orderId}/pdf`, {
					params: { template_id: normalizedTemplateId },
					responseType: 'arraybuffer',
				})) as PdfResponse;

				await saveOrSharePdf(data, filename);
				httpLogger.success(t('receipt.pdf_downloaded', 'PDF downloaded'), {
					showToast: true,
					saveToDb: true,
					context: {
						orderId,
						templateId: normalizedTemplateId,
					},
				});
			} catch (error) {
				httpLogger.error('Failed to download receipt PDF', {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.CONNECTION_REFUSED,
						orderId,
						templateId: normalizedTemplateId,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			} finally {
				setIsDownloading(false);
			}
		},
		[http, t]
	);

	return React.useMemo(
		() => ({
			download,
			isDownloading,
		}),
		[download, isDownloading]
	);
}
