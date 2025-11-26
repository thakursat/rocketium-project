export const CANVAS_PRESETS = [
  { id: "square-1080", label: "Square 1080", width: 1080, height: 1080 },
  { id: "hd-1920", label: "HD 1920×1080", width: 1920, height: 1080 },
  { id: "story-1080", label: "Story 1080×1920", width: 1080, height: 1920 },
  { id: "poster-1350", label: "Poster 1350×1080", width: 1350, height: 1080 },
] as const;

export const DEFAULT_CANVAS_PRESET = CANVAS_PRESETS[0];
