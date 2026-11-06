import { describe, expect, test } from 'bun:test';
import { dominatusGitPath } from '../src/modules/dominatus/git-export';

describe('dominatus GitHub export paths', () => {
  test('files are grouped by campaign and use the stable gameKey', () => {
    expect(dominatusGitPath(7, 'game-42')).toBe('dominatus/7/game-42.json');
    expect(dominatusGitPath(1, 'local:abc-123')).toBe('dominatus/1/local:abc-123.json');
  });

  test('invalid keys are rejected before any GitHub call', () => {
    expect(() => dominatusGitPath(1, 'bad')).toThrow();
    expect(() => dominatusGitPath(1, 'has spaces')).toThrow();
  });
});
