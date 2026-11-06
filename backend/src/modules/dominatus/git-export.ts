import { buildDominatusBattlePayload, DominatusUploadPayload } from './export';
import { DominatusError } from './service';

type GitFile = { path: string; sha: string; htmlUrl: string };
type MissingGitFile = { path: null; sha: null; htmlUrl: null };
type GitRef = { object: { sha: string } };

const DEFAULT_REPOSITORY = 'dirtygay21-byte/warphub';
const DEFAULT_BRANCH = 'dominatus-battles';

function gitConfig() {
  return {
    api: (process.env.DOMINATUS_GIT_API_URL ?? 'https://api.github.com').replace(/\/$/, ''),
    token: process.env.DOMINATUS_GITHUB_TOKEN,
    repository: process.env.DOMINATUS_GITHUB_REPOSITORY ?? DEFAULT_REPOSITORY,
    branch: process.env.DOMINATUS_GIT_BRANCH ?? DEFAULT_BRANCH,
  };
}

export function dominatusGitPath(campaignId: number, gameKey: string) {
  if (!/^[\w:.-]{4,80}$/.test(gameKey)) throw new DominatusError('BAD_INPUT', 'Некорректный gameKey');
  return `dominatus/${campaignId}/${gameKey}.json`;
}

async function gitRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const config = gitConfig();
  if (!config.token) throw new DominatusError('NO_DATA', 'GitHub integration is not configured');
  const response = await fetch(`${config.api}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'warphub-api',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  if (response.status === 404 && init?.method !== 'POST') {
    throw new ExportHttpError(404, text || 'Not found');
  }
  if (!response.ok) throw new ExportHttpError(response.status, text.slice(0, 1000) || `GitHub HTTP ${response.status}`);
  return (text ? JSON.parse(text) : {}) as T;
}

class ExportHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function ensureGitBranch() {
  const config = gitConfig();
  const [owner, repo] = config.repository.split('/');
  try {
    await gitRequest<GitRef>(`/repos/${owner}/${repo}/git/ref/heads/${config.branch}`);
  } catch (error) {
    if (!(error instanceof ExportHttpError) || error.status !== 404) throw error;
    const main = await gitRequest<GitRef>(`/repos/${owner}/${repo}/git/ref/heads/main`);
    await gitRequest<GitRef>(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${config.branch}`, sha: main.object.sha }),
    });
  }
}

export async function getDominatusGitExport(userId: string, gameKey: string): Promise<GitFile | MissingGitFile> {
  const payload = await buildDominatusBattlePayload(userId, gameKey);
  const config = gitConfig();
  const [owner, repo] = config.repository.split('/');
  const path = dominatusGitPath(payload.campaign.id, gameKey);
  try {
    const file = await gitRequest<{ path: string; sha: string; html_url: string }>(`/repos/${owner}/${repo}/contents/${path}?ref=${config.branch}`);
    return { path: file.path, sha: file.sha, htmlUrl: file.html_url };
  } catch (error) {
    if (error instanceof ExportHttpError && error.status === 404) return { path: null, sha: null, htmlUrl: null };
    throw error;
  }
}

export async function saveDominatusBattleToGit(userId: string, gameKey: string): Promise<GitFile> {
  const payload = await buildDominatusBattlePayload(userId, gameKey);
  await ensureGitBranch();
  const config = gitConfig();
  const [owner, repo] = config.repository.split('/');
  const path = dominatusGitPath(payload.campaign.id, gameKey);
  const existing = await getDominatusGitExport(userId, gameKey);
  const response = await gitRequest<{ content: { path: string; sha: string; html_url: string } }>(`/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `Записать битву ${gameKey}`,
      content: Buffer.from(JSON.stringify(payload, null, 2) + '\n', 'utf8').toString('base64'),
      branch: config.branch,
      ...(existing ? { sha: existing.sha } : {}),
    }),
  });
  return { path: response.content.path, sha: response.content.sha, htmlUrl: response.content.html_url };
}
