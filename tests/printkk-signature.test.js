import test from 'node:test';
import assert from 'node:assert/strict';

import { getPrintKKCanonicalString, signPrintKKRequest } from '../lib/printkk/signature.js';

test('PrintKK canonical string follows the supplied Java-style query/body signing format', () => {
  const canonical = getPrintKKCanonicalString('post', '/api/v1/order', {
    queryParams: { region: 'North America', ignored: '' },
    bodyParams: {
      shippingType: ['economy', 'standard', 'express'],
      timestamp: '1750234675765',
      shippingAddress: { fullName: 'Ada Lovelace', city: 'London' },
      signature: 'ignored',
      remark: '',
      recvWindow: '5000',
    },
  });

  assert.equal(
    canonical,
    'POST\n/api/v1/order\nregion=North%20America\nrecvWindow=5000&shippingAddress={fullName=Ada Lovelace, city=London}&shippingType=[economy, standard, express]&timestamp=1750234675765',
  );
});

test('GET query values are encoded like Python urllib.parse.quote', () => {
  assert.equal(
    getPrintKKCanonicalString('get', '/api/v1/general/ping', {
      queryParams: { z: "x/y !'()*", a: 'hello world' },
    }),
    'GET\n/api/v1/general/ping\na=hello%20world&z=x/y%20%21%27%28%29%2A',
  );
});

test('POST body signing omits an empty query line by default', () => {
  assert.equal(
    getPrintKKCanonicalString('post', '/api/v1/pay/wallet', {
      bodyParams: { orderId: '123', timestamp: '456', recvWindow: '5000' },
    }),
    'POST\n/api/v1/pay/wallet\norderId=123&recvWindow=5000&timestamp=456',
  );
});

test('PrintKK signatures are stable SHA-256 HMAC hex strings', () => {
  const first = signPrintKKRequest('unit-test-secret', 'GET', '/api/v1/general/ping', {
    queryParams: { timestamp: '1750233945814', recvWindow: '5000' },
  });

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, signPrintKKRequest('unit-test-secret', 'GET', '/api/v1/general/ping', {
    queryParams: { timestamp: '1750233945814', recvWindow: '5000' },
  }));
  assert.notEqual(first, signPrintKKRequest('different-secret', 'GET', '/api/v1/general/ping', {
    queryParams: { timestamp: '1750233945814', recvWindow: '5000' },
  }));
});
