import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { MORE_POSTERS } from '../lib/commerce/more-posters.js';

const migration = readFileSync(
  new URL('../supabase/migrations/20261010163704_add_more_poster_catalog.sql', import.meta.url),
  'utf8',
);

test('all 50 supplied posters have unique storefront and checkout IDs', () => {
  assert.equal(MORE_POSTERS.length, 50);
  assert.deepEqual(MORE_POSTERS.map(({ id }) => id), Array.from({ length: 50 }, (_, i) => i + 11));
  assert.equal(new Set(MORE_POSTERS.map(({ slug }) => slug)).size, 50);
});

test('every poster image exists and is registered in the Supabase catalog migration', () => {
  for (const poster of MORE_POSTERS) {
    assert.ok(existsSync(new URL(`../public${poster.image}`, import.meta.url)), `${poster.image} exists`);
    assert.match(migration, new RegExp(`\\('${poster.slug}'`), `${poster.slug} is seeded`);
    assert.match(migration, new RegExp(`'${poster.slug}', '${poster.image}'`), `${poster.slug} uses the same image`);
  }
});

test('catalog entries carry consistent price and category metadata', () => {
  for (const poster of MORE_POSTERS) {
    assert.equal(poster.priceCents, poster.price * 100, `${poster.slug} price matches cents`);
    assert.ok(poster.department && poster.category && poster.subcategory, `${poster.slug} is categorized`);
  }
});
