/**
 * Settings: sound on/off, volume, language. Changing the language only
 * changes displayed text (ids, scoring and the current run are untouched).
 */
import type { AudioSettings } from '../contracts';
import { LOCALES, LOCALE_NATIVE_NAMES, translate, type I18n, type Locale } from '../i18n';
import { el, replaceChildren, setText, type ScreenHandle } from './dom';
import { clampVolume } from './prefs';
import './screens.css';

export interface SettingsInput {
  audio: AudioSettings;
}

export interface SettingsViewModel {
  readonly title: string;
  readonly soundTitle: string;
  readonly soundOn: boolean;
  readonly soundLabel: string;
  readonly volumeLabel: string;
  readonly volumePercent: number;
  readonly languageLabel: string;
  readonly languages: ReadonlyArray<{ readonly id: Locale; readonly nativeName: string; readonly selected: boolean }>;
  readonly note: string;
  readonly closeLabel: string;
}

export function settingsViewModel(input: { audio: AudioSettings; locale: Locale }): SettingsViewModel {
  const { audio, locale } = input;
  return {
    title: translate(locale, 'settings.title'),
    soundTitle: translate(locale, 'settings.sound'),
    soundOn: audio.enabled,
    soundLabel: translate(locale, audio.enabled ? 'settings.soundOn' : 'settings.soundOff'),
    volumeLabel: translate(locale, 'settings.volume'),
    volumePercent: Math.round(clampVolume(audio.volume) * 100),
    languageLabel: translate(locale, 'settings.language'),
    languages: LOCALES.map((id) => ({ id, nativeName: LOCALE_NATIVE_NAMES[id], selected: id === locale })),
    note: translate(locale, 'settings.langNote'),
    closeLabel: translate(locale, 'settings.close'),
  };
}

export interface SettingsDeps {
  readonly i18n: I18n;
  readonly onAudioChange: (audio: AudioSettings) => void;
  readonly onClose: () => void;
}

export function mountSettings(root: HTMLElement, deps: SettingsDeps, initial: SettingsInput): ScreenHandle<SettingsInput> {
  let audio = initial.audio;
  const title = el('h2', { class: 'ov-title' });
  const soundTitle = el('div', { class: 'row-label' });
  const soundBtn = el('button', { class: 'btn toggle', attrs: { type: 'button' } });
  const volLabel = el('label', { class: 'row-label' });
  const vol = el('input', { class: 'range', attrs: { type: 'range', min: '0', max: '100', step: '5' } });
  const volOut = el('span', { class: 'range-out', attrs: { 'aria-hidden': 'true' } });
  const langLabel = el('label', { class: 'row-label' });
  const select = el('select', { class: 'select' });
  const note = el('p', { class: 'note' });
  const close = el('button', { class: 'btn primary', attrs: { type: 'button' } });
  const panel = el('div', { class: 'ov-panel', attrs: { role: 'dialog', 'aria-modal': 'true' } }, [
    title, soundTitle, soundBtn, volLabel, el('div', { class: 'range-row' }, [vol, volOut]), langLabel, select, note, close,
  ]);
  const wrap = el('div', { class: 'ov-back' }, [panel]);
  root.appendChild(wrap);

  const idSuffix = Math.random().toString(36).slice(2, 8);
  vol.id = `vol-${idSuffix}`;
  volLabel.htmlFor = vol.id;
  select.id = `lang-${idSuffix}`;
  langLabel.htmlFor = select.id;

  function refresh(): void {
    const vm = settingsViewModel({ audio, locale: deps.i18n.locale });
    setText(title, vm.title);
    setText(soundTitle, vm.soundTitle);
    setText(soundBtn, vm.soundLabel);
    soundBtn.setAttribute('aria-pressed', String(vm.soundOn));
    soundBtn.classList.toggle('on', vm.soundOn);
    setText(volLabel, vm.volumeLabel);
    vol.value = String(vm.volumePercent);
    setText(volOut, `${vm.volumePercent}%`);
    setText(langLabel, vm.languageLabel);
    replaceChildren(
      select,
      vm.languages.map((l) => {
        const o = el('option', { text: l.nativeName, attrs: { value: l.id } });
        o.selected = l.selected;
        return o;
      }),
    );
    setText(note, vm.note);
    setText(close, vm.closeLabel);
  }

  const emit = (): void => deps.onAudioChange(audio);
  soundBtn.addEventListener('click', () => {
    audio = { ...audio, enabled: !audio.enabled };
    refresh();
    emit();
  });
  vol.addEventListener('input', () => {
    audio = { ...audio, volume: clampVolume(Number(vol.value) / 100) };
    setText(volOut, `${vol.value}%`);
    emit();
  });
  select.addEventListener('change', () => {
    deps.i18n.setLocale(select.value as Locale);
  });
  close.addEventListener('click', () => deps.onClose());
  const unsub = deps.i18n.subscribe(refresh);
  refresh();

  return {
    update(patch) {
      if (patch.audio) audio = patch.audio;
      refresh();
    },
    dispose() {
      unsub();
      wrap.remove();
    },
  };
}
