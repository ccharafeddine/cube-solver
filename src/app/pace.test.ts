import { describe, expect, it } from 'vitest';
import { playPaced } from './pace';

describe('paced sequence playback', () => {
  it('plays one move per animation and reads the speed live', async () => {
    const played: string[] = [];
    const gaps: number[] = [];
    let gap = 100;
    let pendingAnimations = 0;
    const ok = await playPaced(['R', 'U', "R'"], {
      play: (m) => { expect(pendingAnimations).toBe(0); pendingAnimations++; played.push(m); if (m === 'R') gap = 400; },
      idle: async () => { pendingAnimations = 0; },
      gapMs: () => gap,
      cancelled: () => false,
      sleep: async (ms) => { gaps.push(ms); },
    });
    expect(ok).toBe(true);
    expect(played).toEqual(['R', 'U', "R'"]);
    // The slider moved after the first turn: every later gap uses the new speed.
    expect(gaps).toEqual([400, 400, 400]);
  });
  it('stops when cancelled', async () => {
    const played: string[] = [];
    const ok = await playPaced(['R', 'U', 'F'], {
      play: (m) => { played.push(m); }, idle: async () => {}, gapMs: () => 0,
      cancelled: () => played.length >= 2, sleep: async () => {},
    });
    expect(ok).toBe(false);
    expect(played).toEqual(['R', 'U']);
  });
});
