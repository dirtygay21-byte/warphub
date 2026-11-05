import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../../..');

test('Profile renders two independent swipe lanes with compact unlimited lazy cards and external links', () => {
  const source = readFileSync(join(root, 'client/src/components/pages/Profile/PartnerSection.tsx'), 'utf8');
  assert.equal((source.match(/<PartnerLane /g) ?? []).length, 2);
  for (const token of ['snap-x', 'snap-mandatory', 'overflow-x-auto', 'loading="lazy"', 'openLink', 'getPartners', 'w-[39%]', 'min-w-[105px]', 'max-w-[135px]', 'sm:w-[120px]']) assert.ok(source.includes(token), token);
});

test('Admin → Content exposes settings, CRUD, reordering, hide/show and Open Graph review', () => {
  const source = readFileSync(join(root, 'client/src/components/pages/Admin/Content/AdminPartners.tsx'), 'utf8');
  for (const token of ['updatePartnerSettings', 'createPartnerCard', 'updatePartnerCard', 'deletePartnerCard', 'fetchPartnerMetadata', 'isActive', 'sortOrder', 'Заполнить по ссылке']) assert.ok(source.includes(token), token);
  const tabs = readFileSync(join(root, 'client/src/components/pages/Admin/ContentManagment.tsx'), 'utf8');
  assert.ok(tabs.includes('partners: AdminPartners'));
});

test('migration creates settings and unlimited cards without a row cap', () => {
  const migration = readFileSync(join(root, 'backend/drizzle/0023_partner_showcase.sql'), 'utf8');
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS "partner_settings"'));
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS "partner_cards"'));
  assert.ok(!/limit\s+\d+/i.test(migration));
});
