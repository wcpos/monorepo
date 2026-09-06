import * as React from 'react';

import { isExpectedPreflightBlock } from '@wcpos/hooks/use-http-client/is-expected-preflight-block';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

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
				httpLogger.success(t('receipt.pdf_downloaded'), {
					showToast: true,
					context: {
						orderId,
						templateId: normalizedTemplateId,
					},
				});
			} catch (error) {
				const logLevel = isExpectedPreflightBlock(error) ? 'warn' : 'error';
				httpLogger[logLevel]('Failed to download receipt PDF', {
					showToast: true,
					code: ERROR_CODES.RECEIPT_DELIVERY_FAILED,
					context: {
						orderId,
						templateId: normalizedTemplateId,
						error: getErrorMessage(error),
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
