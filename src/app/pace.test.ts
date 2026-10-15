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

describe('scramble pacing', () => {
  it('is quicker than playback at the same slider setting, within a floor and ceiling', async () => {
    const { scrambleMs } = await import('./pace');
    expect(scrambleMs(300)).toBeLessThan(300 / 1.4);
    expect(scrambleMs(300)).toBeGreaterThan(300 / 2.1);
    expect(scrambleMs(5)).toBe(60);
    expect(scrambleMs(700)).toBe(260);
  });
  it('random moves never repeat the same layer twice in a row', async () => {
    const { randomMoves } = await import('./pace');
    const ms = randomMoves(3, 200);
    expect(ms).toHaveLength(200);
    for (let i = 1; i < ms.length; i++) expect(ms[i].axis === ms[i - 1].axis && ms[i].layer === ms[i - 1].layer).toBe(false);
    expect(ms.every((m) => m.layer === 0 || m.layer === 2)).toBe(true);
  });
});
