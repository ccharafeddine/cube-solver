/**
 * Skins: CSS variables in tokens.css plus the matching 3D scene parameters
 * here. A skin changes looks only, never behaviour.
 */
export type SkinId = 'matte' | 'aero' | 'neon' | 'brutal';
export const SKINS: SkinId[] = ['matte', 'aero', 'neon', 'brutal'];
export type Mode = 'light' | 'dark';
/** Which light/dark variants each skin has. Single-mode skins ignore the light/dark/system choice. */
export const SKIN_MODES: Record<SkinId, Mode[]> = { matte: ['light', 'dark'], aero: ['light', 'dark'], neon: ['dark'], brutal: ['light'] };
export const SKIN_LABELS: Record<SkinId, string> = { matte: 'Matte', aero: 'Frutiger Aero', neon: 'Neon', brutal: 'Neubrutalism' };
/** The look a fresh install gets: calm matte plastic on a paper-grain background. */
export const DEFAULT_SKIN: SkinId = 'matte';

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
  brutal: {
    // Flat: no gloss, strong even light so stickers read as solid poster colours on black plastic.
    light: { body: '#000000', bodyRoughness: 1, stickerRoughness: 1, stickerClearcoat: 0, stickerClearcoatRoughness: 1,
      ambient: 3.0, key: 0.45, sky: '#ffffff', skyIntensity: 0, rim: '#ffffff', rimIntensity: 0 },
    dark: { body: '#000000', bodyRoughness: 1, stickerRoughness: 1, stickerClearcoat: 0, stickerClearcoatRoughness: 1,
      ambient: 3.0, key: 0.45, sky: '#ffffff', skyIntensity: 0, rim: '#ffffff', rimIntensity: 0 },
  },
  matte: {
    light: { body: '#1c1b19', bodyRoughness: 0.9, stickerRoughness: 0.75, stickerClearcoat: 0, stickerClearcoatRoughness: 1,
      ambient: 2.2, key: 1.1, sky: '#fff5e6', skyIntensity: 0.3, rim: '#ffffff', rimIntensity: 0 },
    dark: { body: '#141311', bodyRoughness: 0.9, stickerRoughness: 0.75, stickerClearcoat: 0, stickerClearcoatRoughness: 1,
      ambient: 1.7, key: 1.0, sky: '#ffe2bf', skyIntensity: 0.35, rim: '#ffd9a8', rimIntensity: 0.35 },
  },
};

/** Skin from `?skin=` (for previewing), then the saved choice, then the default. */
export function pickSkin(search: string, saved: string | null): SkinId {
  const q = new URLSearchParams(search).get('skin');
  for (const c of [q, saved]) if (c && (SKINS as string[]).includes(c)) return c as SkinId;
  return DEFAULT_SKIN;
}

/** The explicit theme if chosen, else the OS preference. */
export const resolveTheme = (saved: string | null, prefersDark: boolean): Mode =>
  saved === 'light' || saved === 'dark' ? saved : prefersDark ? 'dark' : 'light';

/** The mode a skin actually shows: the chosen one if the skin has it, else its only mode. */
export const modeFor = (skin: SkinId, wanted: Mode): Mode =>
  SKIN_MODES[skin].includes(wanted) ? wanted : SKIN_MODES[skin][0];
