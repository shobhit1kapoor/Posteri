import { createHmac } from 'node:crypto';

function serializeValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map(serializeValue).join(', ')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => `${key}=${serializeValue(item)}`);
    return `{${entries.join(', ')}}`;
  }

  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  return String(value);
}

function includedEntries(params) {
  return Object.entries(params)
    .filter(([key, value]) => (
      key !== 'signature'
      && key !== 'file'
      && value !== null
      && value !== undefined
      && value !== ''
    ))
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
}

// Match urllib.parse.quote(value) used by PrintKK's supplied Python client:
// preserve RFC-unreserved characters plus '/', and percent-encode everything else.
function quoteQueryValue(value) {
  return encodeURIComponent(serializeValue(value))
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%2F/gi, '/');
}

export function getPrintKKCanonicalString(method, path, { queryParams = {}, bodyParams = {}, includeEmptyQueryLineWhenBody = false } = {}) {
  const queryString = includedEntries(queryParams)
    .map(([key, value]) => `${key}=${quoteQueryValue(value)}`)
    .join('&');
  const bodyString = includedEntries(bodyParams)
    .map(([key, value]) => `${key}=${serializeValue(value)}`)
    .join('&');

  const segments = [method.toUpperCase(), path];
  if (queryString) segments.push(queryString);
  else if (includeEmptyQueryLineWhenBody) segments.push('');
  if (bodyString) segments.push(bodyString);

  return segments.join('\n');
}

export function signPrintKKRequest(secretKey, method, path, params = {}) {
  if (!secretKey) throw new Error('PrintKK secret key is not configured.');

  return createHmac('sha256', secretKey)
    .update(getPrintKKCanonicalString(method, path, params), 'utf8')
    .digest('hex');
}

export function serializePrintKKValue(value) {
  return serializeValue(value);
}

export function quotePrintKKQueryValue(value) {
  return quoteQueryValue(value);
}
