import { describe, expect, it } from 'vitest';
import { NAME_MAX, NAME_MIN } from '../../net/protocol';
import { MENU_COPY, fill } from '../copy';
import { validateName } from './form';

describe('menu name rule', () => {
  it('accepts the length of the join options and trims first', () => {
    expect(validateName('Hana')).toBeNull();
    expect(validateName('  Hana  ')).toBeNull();
    expect(validateName('x'.repeat(NAME_MIN))).toBeNull();
    expect(validateName('x'.repeat(NAME_MAX))).toBeNull();
  });

  it('refuses a name that is too short or too long, with the range in the line', () => {
    const line = fill(MENU_COPY['start.name.error'], { min: NAME_MIN, max: NAME_MAX });
    expect(validateName('A')).toBe(line);
    expect(validateName('   ')).toBe(line);
    expect(validateName('x'.repeat(NAME_MAX + 1))).toBe(line);
    expect(line).toContain(`${NAME_MIN} to ${NAME_MAX}`);
  });
});

describe('menu copy', () => {
  it('keeps the labels the e2e fixture drives', () => {
    expect(MENU_COPY['menu.start']).toBe('Start Game');
    expect(MENU_COPY['menu.join']).toBe('Join Game');
    expect(MENU_COPY['start.create']).toBe('Create Party');
    expect(MENU_COPY['code.join']).toBe('Join Party');
    expect(MENU_COPY['code.label']).toBe('Party code');
    expect(MENU_COPY['start.name.label']).toBe('Your name');
    expect(MENU_COPY['code.name.label']).toBe('Your name');
  });

  it('fills the footer with the build', () => {
    expect(fill(MENU_COPY['menu.footer'], { build: 'abc123' })).toBe('vabc123');
  });
});
