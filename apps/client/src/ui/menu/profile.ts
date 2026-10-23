import { MENU_COPY as C } from '../copy';
import { h } from '../dom';
import { copyText } from './clipboard';
import { openDialog, type MenuDialog } from './dialog';
import { messageLine, nameField, validateName } from './form';
import { makeProfileCode, readProfile, saveProfile, type Profile } from './profileModel';

export interface ProfilePanelOptions {
  root: HTMLElement;
  /** After Save, with the profile now on the device (the chip and the Start dialog follow it). */
  onSaved(profile: Profile): void;
  onClose?(): void;
}

/**
 * Create Profile and the chip (GDD 3.21): the name, the profile code shown large with a Copy button, and a line on
 * what the code is for. A new profile's code is made when the panel opens and kept only on Save.
 */
export function openProfilePanel(opts: ProfilePanelOptions): MenuDialog {
  const dialog = openDialog(opts.root, {
    id: 'profile-title',
    title: C['profile.title'],
    ...(opts.onClose ? { onClose: opts.onClose } : {}),
  });
  const existing = readProfile();
  const code = existing?.code ?? makeProfileCode();
  const name = nameField('profile-name', C['profile.name.label'], existing?.name ?? '');
  const msg = messageLine();

  const copy = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--ghost wdi-btn--sm' },
    C['profile.copy'],
  );
  copy.addEventListener('click', () => {
    void copyText(code).then((ok) => {
      copy.textContent = ok ? C['profile.copied'] : C['profile.copy.failed'];
      setTimeout(() => (copy.textContent = C['profile.copy']), 1500);
    });
  });
  const save = h('button', { type: 'button', class: 'wdi-btn wdi-btn--primary' }, C['profile.save']);
  const submit = () => {
    const trimmed = name.input.value.trim();
    const problem = validateName(trimmed);
    if (problem !== null) {
      msg.say(problem);
      name.input.focus();
      return;
    }
    const profile: Profile = { name: trimmed, code };
    saveProfile(profile);
    opts.onSaved(profile);
    dialog.close();
  };
  save.addEventListener('click', submit);
  name.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });

  dialog.body.append(
    name.el,
    h(
      'div',
      { class: 'wdi-field' },
      h('span', { class: 'wdi-label', id: 'profile-code-label' }, C['profile.code.label']),
      h(
        'div',
        { class: 'wdi-menu-code' },
        h(
          'output',
          {
            class: 'wdi-menu-code__value',
            'data-testid': 'profile-code',
            'aria-labelledby': 'profile-code-label',
          },
          code,
        ),
        copy,
      ),
      h('p', { class: 'wdi-field__msg' }, C['profile.code.hint']),
    ),
    msg.el,
    h('div', { class: 'wdi-dialog__actions' }, save),
  );
  name.input.focus();
  return dialog;
}
