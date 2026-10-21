import type { SimulatedReading } from './truck.js';

export interface SendResult {
  status: number;
  accepted: number;
  rejected: number;
  error?: string;
}

interface IngestResponse {
  accepted?: number;
  rejected?: unknown[];
  error?: { code?: string; message?: string; details?: { rejected?: unknown[] } };
}

/** POSTs readings to the API; never throws for HTTP errors, only for network failures. */
export async function sendReadings(
  apiUrl: string,
  apiKey: string,
  readings: SimulatedReading[],
): Promise<SendResult> {
  const res = await fetch(`${apiUrl}/readings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(readings.length === 1 ? readings[0] : readings),
    signal: AbortSignal.timeout(10_000),
  });

  const body = (await res.json().catch(() => ({}))) as IngestResponse;
  return {
    status: res.status,
    accepted: body.accepted ?? 0,
    rejected: body.rejected?.length ?? body.error?.details?.rejected?.length ?? 0,
    error: body.error ? `${body.error.code ?? 'ERROR'}: ${body.error.message ?? ''}` : undefined,
  };
}
