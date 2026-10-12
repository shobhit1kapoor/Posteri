import 'server-only';

import { signPrintKKRequest, serializePrintKKValue } from './signature';

const API_BASE_URL = (process.env.PRINTKK_API_BASE_URL || 'https://api.printkk.com').replace(/\/$/, '');
const DEFAULT_RECV_WINDOW = 5000;

export class PrintKKApiError extends Error {
  constructor(status, providerCode) {
    super(`PrintKK API request failed (${status}${providerCode ? `, code ${providerCode}` : ''}).`);
    this.name = 'PrintKKApiError';
    this.status = status;
    this.providerCode = providerCode ?? null;
  }
}

export function isPrintKKConfigured() {
  return Boolean(process.env.PRINTKK_API_KEY && process.env.PRINTKK_SECRET_KEY);
}

function addQueryParams(searchParams, params) {
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      value.forEach((item) => searchParams.append(key, serializePrintKKValue(item)));
    } else {
      searchParams.append(key, serializePrintKKValue(value));
    }
  }
}

export async function printKKRequest(path, { method = 'GET', params = {}, signal } = {}) {
  const apiKey = process.env.PRINTKK_API_KEY;
  const secretKey = process.env.PRINTKK_SECRET_KEY;
  if (!apiKey || !secretKey) throw new Error('PrintKK API credentials are not configured.');
  if (!path.startsWith('/api/v1/')) throw new Error('PrintKK API path must start with /api/v1/.');

  const httpMethod = method.toUpperCase();
  const requestParams = {
    ...params,
    timestamp: String(Date.now()),
    recvWindow: String(DEFAULT_RECV_WINDOW),
  };
  const queryParams = httpMethod === 'GET' ? requestParams : {};
  const bodyParams = httpMethod === 'GET' ? {} : requestParams;
  const signature = signPrintKKRequest(secretKey, httpMethod, path, { queryParams, bodyParams });
  const headers = { 'Api-Key': apiKey };
  let url = `${API_BASE_URL}${path}`;
  let body;

  if (httpMethod === 'GET') {
    const query = new URLSearchParams();
    addQueryParams(query, requestParams);
    query.set('signature', signature);
    url = `${url}?${query.toString()}`;
  } else if (['POST', 'PUT', 'DELETE'].includes(httpMethod)) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify({ ...requestParams, signature });
  } else {
    throw new Error(`Unsupported PrintKK method: ${httpMethod}`);
  }

  const response = await fetch(url, {
    method: httpMethod,
    headers,
    ...(body ? { body } : {}),
    cache: 'no-store',
    signal: signal || AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success === false) {
    // Do not surface provider messages verbatim: some auth errors echo secrets.
    throw new PrintKKApiError(response.status, result?.code);
  }

  return result;
}

export function pingPrintKK() {
  return printKKRequest('/api/v1/general/ping');
}

export function getPrintKKProduct(productCode = process.env.PRINTKK_POSTER_PRODUCT_CODE || 'A72TS0') {
  return printKKRequest(`/api/v1/product/${encodeURIComponent(productCode)}`);
}

export function createPrintKKOrder(order) {
  return printKKRequest('/api/v1/order', { method: 'POST', params: order });
}

export function payPrintKKOrder(orderId) {
  return printKKRequest('/api/v1/pay/wallet', {
    method: 'POST',
    params: { orderId: String(orderId) },
  });
}

export function getPrintKKOrder(orderId) {
  return printKKRequest(`/api/v1/order/${encodeURIComponent(String(orderId))}`);
}

export function getPrintKKShipments(orderId) {
  return printKKRequest('/api/v1/order/shipments', { params: { orderIds: [Number(orderId)] } });
}
