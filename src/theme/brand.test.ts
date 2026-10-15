import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const style = readFileSync(new URL('../style.css', import.meta.url), 'utf-8');
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf-8');

describe('brand', () => {
  it('the title font is bundled, never fetched from a CDN, and loads after the token import', () => {
    const face = /@font-face\s*{[^}]*font-family:\s*'Bungee'[^}]*url\('([^']+)'\)/.exec(style);
    expect(face).not.toBeNull();
    expect(face![1]).not.toMatch(/^https?:|^\/\//);
    expect(existsSync(new URL(face![1], new URL('../style.css', import.meta.url)))).toBe(true);
    expect(style).not.toMatch(/fonts\.googleapis|fonts\.gstatic|cdn\./);
    // @import must stay first, or the browser drops the whole token sheet.
    expect(style.indexOf('@import')).toBeLessThan(style.indexOf('@font-face'));
  });
  it('the header title shows no version number', () => {
    const h1 = /<h1>([\s\S]*?)<\/h1>/.exec(html)![1];
    expect(h1).not.toMatch(/version|v\d/);
  });
  it('one gear opens Settings, which holds the theme, mode, update check and version', () => {
    const header = /<header>([\s\S]*?)<\/header>/.exec(html)![1];
    expect(header).toContain('id="settings"');
    expect(header).not.toMatch(/id="(theme|check-update)"/);
    const dlg = /<dialog id="settings-dialog"[\s\S]*?<\/dialog>/.exec(html)![0];
    for (const id of ['theme-skins', 'theme-modes', 'check-update', 'version', 'settings-close']) expect(dlg).toContain(`id="${id}"`);
  });
  it('every icon the manifest and page name exists, including the social card', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.webmanifest', import.meta.url), 'utf-8'));
    for (const i of manifest.icons) expect(existsSync(new URL(`../../public/${i.src}`, import.meta.url))).toBe(true);
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
    const og = /property="og:image" content="\.\/([^"]+)"/.exec(html);
    expect(og).not.toBeNull();
    expect(existsSync(new URL(`../../public/${og![1]}`, import.meta.url))).toBe(true);
  });
  it('the solver-mode code never touches the Light/Dark/System buttons (they share data-mode)', () => {
    const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf-8');
    expect(main).not.toMatch(/querySelectorAll<HTMLButtonElement>\('\[data-mode\]'\)/);
    expect(style).toMatch(/#theme-modes button\[aria-checked='true'\]/);
  });
});
