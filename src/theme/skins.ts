/**
 * Skins: CSS variables in tokens.css plus the matching 3D scene parameters
 * here. A skin changes looks only, never behaviour.
 */
export type SkinId = 'aero' | 'neon' | 'matte';
export const SKINS: SkinId[] = ['aero', 'neon', 'matte'];
/** The look that ships. The others are wired up but not offered in the UI yet. */
export const DEFAULT_SKIN: SkinId = 'aero';

export interface SceneSkin {
  /** Plastic between stickers. */
  body: string;
  bodyRoughness: number;
  stickerRoughness: number;
  /** Clear-coat gloss on stickers (0 = none, 1 = lacquered). */
  stickerClearcoat: number;
  stickerClearcoatRoughness: number;
  ambient: number;
  key: number;
  /** Soft sky-coloured light from above, for the Aero sheen. */
  sky: string;
  skyIntensity: number;
  /** Rim light colour and strength. */
  rim: string;
  rimIntensity: number;
}

export const SCENE_SKINS: Record<SkinId, { light: SceneSkin; dark: SceneSkin }> = {
  aero: {
    light: { body: '#0f1418', bodyRoughness: 0.35, stickerRoughness: 0.32, stickerClearcoat: 1, stickerClearcoatRoughness: 0.3,
      ambient: 1.45, key: 0.8, sky: '#e4f4ff', skyIntensity: 0.2, rim: '#9ee7ff', rimIntensity: 0.7 },
    dark: { body: '#0a0e12', bodyRoughness: 0.35, stickerRoughness: 0.32, stickerClearcoat: 1, stickerClearcoatRoughness: 0.3,
      ambient: 1.4, key: 0.8, sky: '#a8dbff', skyIntensity: 0.2, rim: '#3fb5f5', rimIntensity: 1.1 },
  },
  neon: {
    light: { body: '#08070f', bodyRoughness: 0.5, stickerRoughness: 0.3, stickerClearcoat: 0.6, stickerClearcoatRoughness: 0.2,
      ambient: 1.2, key: 1.1, sky: '#a46bff', skyIntensity: 0.6, rim: '#38e1ff', rimIntensity: 1.6 },
    dark: { body: '#08070f', bodyRoughness: 0.5, stickerRoughness: 0.3, stickerClearcoat: 0.6, stickerClearcoatRoughness: 0.2,
      ambient: 1.2, key: 1.1, sky: '#a46bff', skyIntensity: 0.6, rim: '#38e1ff', rimIntensity: 1.6 },
  },
  matte: {
    light: { body: '#1c1b19', bodyRoughness: 0.9, stickerRoughness: 0.75, stickerClearcoat: 0, stickerClearcoatRoughness: 1,
      ambient: 2.2, key: 1.1, sky: '#fff5e6', skyIntensity: 0.3, rim: '#ffffff', rimIntensity: 0 },
    dark: { body: '#1c1b19', bodyRoughness: 0.9, stickerRoughness: 0.75, stickerClearcoat: 0, stickerClearcoatRoughness: 1,
      ambient: 1.8, key: 1.1, sky: '#fff5e6', skyIntensity: 0.3, rim: '#ffffff', rimIntensity: 0 },
  },
};

/** Skin from `?skin=` (for previewing), then the saved choice, then the default. */
export function pickSkin(search: string, saved: string | null): SkinId {
  const q = new URLSearchParams(search).get('skin');
  for (const c of [q, saved]) if (c && (SKINS as string[]).includes(c)) return c as SkinId;
  return DEFAULT_SKIN;
}

/** The explicit theme if chosen, else the OS preference. */
export const resolveTheme = (saved: string | null, prefersDark: boolean): 'light' | 'dark' =>
  saved === 'light' || saved === 'dark' ? saved : prefersDark ? 'dark' : 'light';
