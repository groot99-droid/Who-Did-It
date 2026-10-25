// Round 9 (9T, docs/round9/admin-studio.md 3): what the palette can place. Props come from the kinds the content
// already uses (with the footprint size their first use has); the rest are one starting record per kind.
import { scenes, type Scene } from '@wdi/content';
import type { Kind } from './sceneEdit';

export interface Template {
  /** The palette's label and the choice's key. */
  label: string;
  /** The record's fields besides id and tile; a footprint's x and y are set where it lands. */
  fields: object;
}

const all = Object.values(scenes) as Scene[];
const LIGHT_KINDS = ['lantern', 'torch', 'lamp', 'fire', 'window', 'moss', 'moon', 'shaft'] as const;

function propTemplates(): Template[] {
  const seen = new Map<string, Template>();
  for (const s of all) {
    for (const p of s.props) {
      if (seen.has(p.kind)) continue;
      const fp =
        p.footprint === undefined ? {} : { footprint: { x: 0, y: 0, w: p.footprint.w, h: p.footprint.h } };
      seen.set(p.kind, { label: p.kind, fields: { kind: p.kind, ...fp } });
    }
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
}

const variants = (kind: 'hide' | 'body'): string[] => [
  ...new Set(all.flatMap((s) => s.spots.filter((p) => p.kind === kind).map((p) => p.variant))),
];

/** The palette of a kind in the scene being edited (a portal starts as a door out of it, going nowhere yet). */
export function templatesFor(kind: Kind, sceneId: string): Template[] {
  switch (kind) {
    case 'props':
      return propTemplates();
    case 'lights':
      return LIGHT_KINDS.map((k) => ({ label: k, fields: { kind: k, radiusTiles: 2 } }));
    case 'spawns':
      return [{ label: 'spawn', fields: { z: 0, facing: 's' } }];
    case 'spots':
      return (['hide', 'body'] as const).flatMap((k) =>
        variants(k).map((v) => ({
          label: `${k} ${v}`,
          fields: { kind: k, variant: v, childOnly: false },
        })),
      );
    case 'portals':
      return [
        {
          label: 'door',
          fields: {
            from: sceneId,
            kind: 'door',
            to: null,
            toSpawn: null,
            oneWay: false,
            lock: null,
            window: null,
            noise: 'door',
            elevationDelta: 0,
            minProfile: 'small',
            ships: 'V1',
          },
        },
      ];
  }
}
