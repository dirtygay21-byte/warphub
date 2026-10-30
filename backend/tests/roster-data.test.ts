import { describe, expect, test } from 'bun:test';
import path from 'node:path';

process.env.ROSTER_DATA_DIR = path.resolve(import.meta.dir, '../roster-data');
const { readRosterData } = await import('../src/modules/roster/data');

describe('roster data files', () => {
  test('40K: index, battlefield, missions and faction files', () => {
    expect(readRosterData('index')).not.toBeNull();
    expect(readRosterData('battlefield')).not.toBeNull();
    const missions = readRosterData('missions');
    expect(missions).not.toBeNull();
    expect(JSON.parse(new TextDecoder().decode(Bun.gunzipSync(missions!.body))).cards.length).toBe(43);
    expect(readRosterData('SM')).not.toBeNull();
  });
  test('AoS: index and faction files from roster-data/aos', () => {
    const idx = readRosterData('index', 'aos');
    expect(idx).not.toBeNull();
    const json = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(idx!.body)));
    expect(json.system).toBe('aos');
    expect(readRosterData('SE', 'aos')).not.toBeNull();
    // 40K faction file is not reachable through the AoS route and vice versa
    expect(readRosterData('SM', 'aos')).toBeNull();
    expect(readRosterData('battlefield', 'aos')).toBeNull();
    expect(readRosterData('missions', 'aos')).toBeNull();
    // General's Handbook (батлпланы, тактики) — рядом с index.json
    const bp = readRosterData('battlepack', 'aos');
    expect(bp).not.toBeNull();
    expect(JSON.parse(new TextDecoder().decode(Bun.gunzipSync(bp!.body))).battleplans.length).toBe(12);
    expect(readRosterData('battlepack')).toBeNull();
  });
  test('Kill Team: index and team files from roster-data/kt', () => {
    const idx = readRosterData('index', 'kt');
    expect(idx).not.toBeNull();
    const json = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(idx!.body)));
    expect(json.system).toBe('kt');
    expect(json.teams.length).toBeGreaterThan(40);
    const t = readRosterData('AEL-BOK', 'kt');
    expect(t).not.toBeNull();
    expect(JSON.parse(new TextDecoder().decode(Bun.gunzipSync(t!.body))).operatives.length).toBeGreaterThan(0);
    for (const bad of ['../index', 'SE', 'battlepack', 'AEL-BOK/..', 't/AEL-BOK', '']) expect(readRosterData(bad, 'kt')).toBeNull();
  });
  test('Warcry: index and faction files from roster-data/warcry', () => {
    const idx = readRosterData('index', 'warcry');
    expect(idx).not.toBeNull();
    const json = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(idx!.body)));
    expect(json.system).toBe('warcry');
    expect(json.factions.length).toBeGreaterThan(60);
    const f = readRosterData('blades-of-khorne-bloodbound', 'warcry');
    expect(f).not.toBeNull();
    expect(JSON.parse(new TextDecoder().decode(Bun.gunzipSync(f!.body))).fighters.length).toBeGreaterThan(0);
    for (const bad of ['../index', 'AEL-BOK', 'f/chaos', 'chaos/..', '.hidden', '']) expect(readRosterData(bad, 'warcry')).toBeNull();
  });
  test('Warcry: faction names for the booking form (no grand-alliance files)', async () => {
    const { warcryFactionNames } = await import('../src/modules/roster/data');
    const names = warcryFactionNames();
    expect(names.length).toBeGreaterThan(60);
    expect(names).toContain('Skaven');
    expect(names).not.toContain('chaos');
  });
  test('rejects paths outside the data folder', () => {
    for (const bad of ['../index', 'aos/index', '..', 'f/SM', 'index.json/..', '']) {
      expect(readRosterData(bad)).toBeNull();
      expect(readRosterData(bad, 'aos')).toBeNull();
    }
  });
});
