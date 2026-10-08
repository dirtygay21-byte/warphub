import { describe, expect, test } from 'bun:test';
import path from 'node:path';

process.env.ROSTER_DATA_DIR = path.resolve(import.meta.dir, '../roster-data');
const { readRosterData } = await import('../src/modules/roster/data');

describe('roster data files', () => {
  test('40K: index, battlefield and faction files', () => {
    expect(readRosterData('index')).not.toBeNull();
    expect(readRosterData('battlefield')).not.toBeNull();
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
  });
  test('rejects paths outside the data folder', () => {
    for (const bad of ['../index', 'aos/index', '..', 'f/SM', 'index.json/..', '']) {
      expect(readRosterData(bad)).toBeNull();
      expect(readRosterData(bad, 'aos')).toBeNull();
    }
  });
});
