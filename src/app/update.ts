/** Update check against the latest GitHub release. */
export const REPO = 'ccharafeddine/cube-solver';
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

/** Compare dotted versions ("v1.2.0" or "1.10.1"); positive when a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export type UpdateResult =
  | { kind: 'available'; latest: string; url: string }
  | { kind: 'current'; latest: string }
  | { kind: 'error'; message: string };

export async function checkForUpdate(current: string, fetcher: typeof fetch = fetch): Promise<UpdateResult> {
  try {
    const r = await fetcher(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (r.status === 404) return { kind: 'current', latest: current };
    if (!r.ok) return { kind: 'error', message: `GitHub answered ${r.status}` };
    const j = (await r.json()) as { tag_name?: string; html_url?: string };
    const latest = j.tag_name ?? '';
    return compareVersions(latest, current) > 0
      ? { kind: 'available', latest, url: j.html_url ?? RELEASES_URL }
      : { kind: 'current', latest };
  } catch (e) {
    return { kind: 'error', message: (e as Error).message || 'offline' };
  }
}
