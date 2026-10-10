import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROTOCOL_DOC, renderProtocolDoc } from '../scripts/protocol-doc';

describe('docs/PROTOCOL.md', () => {
  it('matches the shared protocol (run `pnpm docs:protocol` to regenerate)', () => {
    expect(readFileSync(PROTOCOL_DOC, 'utf8')).toBe(renderProtocolDoc());
  });
});
