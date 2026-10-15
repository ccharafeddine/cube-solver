import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SKINS, SCENE_SKINS, pickSkin, resolveTheme, DEFAULT_SKIN, modeFor } from './skins';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf-8');
const style = readFileSync(new URL('../style.css', import.meta.url), 'utf-8');

/** Variables declared in the first rule whose selector contains `sel`. */
function block(sel: string): Set<string> {
  const i = css.indexOf(sel);
  expect(i, sel).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', i), close = css.indexOf('\n}', open);
  return new Set([...css.slice(open, close).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
}
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lum = (h: string) => { const c = hex(h).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe('design tokens', () => {
  const aero = block(":root, :root[data-skin='matte'] {");
  it('every skin defines every token the default skin defines', () => {
    expect(aero.size).toBeGreaterThan(40);
    for (const sel of [":root[data-skin='neon'] {", ":root[data-skin='aero'] {", ":root[data-skin='brutal'] {"]) {
      const b = block(sel);
      const missing = [...aero].filter((v) => !b.has(v));
      expect(missing, sel).toEqual([]);
    }
  });
  it('the dark variant only overrides tokens that exist', () => {
    for (const sel of [":root[data-skin='aero'][data-theme='dark']", ":root[data-skin='matte'][data-theme='dark']", ":root[data-skin='neon'][data-theme='light']", ":root[data-skin='brutal'][data-theme='dark']"]) {
      const dark = block(sel);
      expect([...dark].filter((v) => !aero.has(v))).toEqual([]);
      expect(dark.size).toBeGreaterThan(25);
    }
  });
  it('components use only declared tokens', () => {
    const used = new Set([...style.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
    const declared = new Set([...aero, '--n', '--s']);
    expect([...used].filter((v) => !declared.has(v))).toEqual([]);
  });
  it('respects reduced transparency and reduced motion', () => {
    expect(css).toMatch(/prefers-reduced-transparency: reduce/);
    expect(style).toMatch(/prefers-reduced-motion: reduce/);
  });
  it('keeps text contrast accessible (WCAG AA) in Aero light and dark', () => {
    expect(contrast('#0d2a3f', '#f3fbff')).toBeGreaterThan(7); // text on light glass
    expect(contrast('#45657c', '#f3fbff')).toBeGreaterThan(4.5); // muted text
    expect(contrast('#ffffff', '#0a5fa6')).toBeGreaterThan(4.5); // primary button, lower half
    expect(contrast('#ffffff', '#1f7a2c')).toBeGreaterThan(4.5); // green button
    expect(contrast('#e6f5ff', '#0d3050')).toBeGreaterThan(7); // dark text on dark glass
    expect(contrast('#9cc2db', '#0d3050')).toBeGreaterThan(4.5);
    expect(contrast('#ffffff', '#0d66aa')).toBeGreaterThan(4.5); // dark primary button
  });
  it('keeps text contrast accessible in neon and neubrutalism', () => {
    expect(contrast('#e9e6ff', '#12102a')).toBeGreaterThan(7);
    expect(contrast('#9d97c7', '#12102a')).toBeGreaterThan(4.5);
    expect(contrast('#07060d', '#22b8e0')).toBeGreaterThan(4.5);
    expect(contrast('#000000', '#ff5ca8')).toBeGreaterThan(4.5);
    expect(contrast('#000000', '#3ddc84')).toBeGreaterThan(4.5);
    expect(contrast('#3d3d3d', '#ffffff')).toBeGreaterThan(7);
    expect(contrast('#000000', '#ffd23f')).toBeGreaterThan(7);
  });
  it('keeps text contrast accessible in neon light and neubrutalism dark', () => {
    expect(contrast('#14112b', '#ffffff')).toBeGreaterThan(7);
    expect(contrast('#4a4670', '#ffffff')).toBeGreaterThan(4.5);
    expect(contrast('#ffffff', '#077a98')).toBeGreaterThan(4.5);
    expect(contrast('#ffffff', '#0c7a48')).toBeGreaterThan(4.5);
    expect(contrast('#6a2fd6', '#ffffff')).toBeGreaterThan(4.5);
    expect(contrast('#fafafa', '#222222')).toBeGreaterThan(7);
    expect(contrast('#c8c8c8', '#222222')).toBeGreaterThan(4.5);
    expect(contrast('#000000', '#ff5ca8')).toBeGreaterThan(4.5);
    expect(contrast('#ffd23f', '#222222')).toBeGreaterThan(4.5);
  });
  it('keeps text contrast accessible in matte light and dark', () => {
    expect(contrast('#22201c', '#f7f4ee')).toBeGreaterThan(7);
    expect(contrast('#6b665c', '#f7f4ee')).toBeGreaterThan(4.5);
    expect(contrast('#ffffff', '#8a4b14')).toBeGreaterThan(4.5); // pressed primary
    expect(contrast('#ece6da', '#24221f')).toBeGreaterThan(7);
    expect(contrast('#b0a898', '#24221f')).toBeGreaterThan(4.5);
    expect(contrast('#1a1712', '#d98a3d')).toBeGreaterThan(4.5); // dark primary button
    expect(contrast('#1a1712', '#8fb35f')).toBeGreaterThan(4.5); // dark green button
  });
});

describe('skins', () => {
  it('every skin has scene parameters for light and dark', () => {
    for (const s of SKINS) for (const m of ['light', 'dark'] as const) {
      const p = SCENE_SKINS[s][m];
      expect(p.stickerClearcoat).toBeGreaterThanOrEqual(0);
      expect(p.stickerClearcoat).toBeLessThanOrEqual(1);
      expect(p.body).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(SCENE_SKINS.aero.light.stickerClearcoat).toBe(1); // glossy
    expect(SCENE_SKINS.matte.light.stickerClearcoat).toBe(0); // matte
  });
  it('picks a skin from the URL, then the saved choice, then matte', () => {
    expect(pickSkin('', null)).toBe(DEFAULT_SKIN);
    expect(DEFAULT_SKIN).toBe('matte');
    expect(pickSkin('?skin=neon', 'aero')).toBe('neon');
    expect(pickSkin('', 'aero')).toBe('aero');
    expect(pickSkin('?skin=bogus', 'nope')).toBe('matte');
  });
  it('every skin offers light and dark', () => {
    for (const s of SKINS) expect(modeFor(s, 'light')).toBe('light');
    for (const s of SKINS) expect(modeFor(s, 'dark')).toBe('dark');
  });
  it('resolves the theme from the saved choice or the OS', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });
});
