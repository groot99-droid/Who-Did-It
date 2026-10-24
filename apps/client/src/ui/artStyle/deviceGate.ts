// The device gate of the HD art style (docs/round8/art.md 3, GDD 3.13, DECISIONS A164). A style whose `style.json`
// entry carries `requires` is offered only where the device meets it: the screen at least `screenHeightPx` tall,
// `navigator.deviceMemory` (where the browser reports it; Safari and Firefox do not, and are not held back by it)
// at least `deviceMemoryGb`, and WebGL allowing `texturePx` textures (an HD page is twice the 8-bit cap). The pure
// check is `deviceAllows`; `probeDevice` reads the browser once. No Phaser import, so the lobby and tests use it.

export interface StyleRequires {
  screenHeightPx: number;
  deviceMemoryGb: number;
  texturePx: number;
}

export interface DeviceProbe {
  /** The screen's height in CSS px (`screen.height`). */
  screenHeightPx: number;
  /** `navigator.deviceMemory` in GB, or null where the browser does not say. */
  deviceMemoryGb: number | null;
  /** WebGL `MAX_TEXTURE_SIZE`, or null without WebGL. */
  maxTexturePx: number | null;
}

/** Why a device fails a requirement, or null when it passes: one id, so the switch can word it. */
export type GateVerdict = 'screen' | 'memory' | 'texture' | null;

/** The first requirement the device misses, or null when it meets them all (an unreported memory passes). */
export function gateVerdict(req: StyleRequires | undefined, device: DeviceProbe): GateVerdict {
  if (req === undefined) return null;
  if (device.screenHeightPx < req.screenHeightPx) return 'screen';
  if (device.deviceMemoryGb !== null && device.deviceMemoryGb < req.deviceMemoryGb) return 'memory';
  if (device.maxTexturePx === null || device.maxTexturePx < req.texturePx) return 'texture';
  return null;
}

export const deviceAllows = (req: StyleRequires | undefined, device: DeviceProbe): boolean =>
  gateVerdict(req, device) === null;

function webglMaxTexture(): number | null {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return null;
    const size = gl.getParameter(gl.MAX_TEXTURE_SIZE) as unknown;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return typeof size === 'number' ? size : null;
  } catch {
    return null;
  }
}

let probed: DeviceProbe | null = null;

/** The browser's answers, read once per page load. Outside a browser everything reads as missing. */
export function probeDevice(): DeviceProbe {
  if (probed !== null) return probed;
  if (typeof window === 'undefined') {
    probed = { screenHeightPx: 0, deviceMemoryGb: null, maxTexturePx: null };
    return probed;
  }
  const mem = (navigator as Navigator & { deviceMemory?: unknown }).deviceMemory;
  probed = {
    screenHeightPx: typeof screen !== 'undefined' && typeof screen.height === 'number' ? screen.height : 0,
    deviceMemoryGb: typeof mem === 'number' ? mem : null,
    maxTexturePx: webglMaxTexture(),
  };
  return probed;
}

/** Test seam: the next `probeDevice` answers with `device` (null reads the browser again). */
export function setDeviceForTests(device: DeviceProbe | null): void {
  probed = device;
}
