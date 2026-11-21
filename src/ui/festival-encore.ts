import { FESTIVAL_POINTS } from '../contracts/festival';
import type { Locale } from '../i18n';
import { FESTIVAL_TEXT } from './festival-gimmick-text';

export function mountFestivalEncore(root: HTMLElement, choose: (accept: boolean) => boolean | Promise<boolean>) {
  const doc = root.ownerDocument;
  const dialog = doc.createElement('dialog');
  dialog.className = 'festival-encore-dialog';
  dialog.dataset.testid = 'festival-encore';
  dialog.setAttribute('aria-labelledby', 'festival-encore-heading');
  dialog.setAttribute('aria-describedby', 'festival-encore-description');
  const title = doc.createElement('h2');
  title.id = 'festival-encore-heading';
  const prompt = doc.createElement('p');
  prompt.id = 'festival-encore-description';
  const row = doc.createElement('div');
  const accept = doc.createElement('button'), decline = doc.createElement('button');
  accept.type = decline.type = 'button';
  accept.dataset.testid = 'festival-encore-accept';
  decline.dataset.testid = 'festival-encore-decline';
  row.append(accept, decline);
  dialog.append(title, prompt, row);
  root.append(dialog);
  let busy = false;
  let visible = false;
  let locale: Locale | undefined;
  const sync = () => {
    if (!visible || busy) {
      if (dialog.open) dialog.close();
    } else if (!dialog.open) dialog.showModal();
  };
  const submit = async (yes: boolean) => {
    if (busy || !visible) return;
    busy = true;
    sync();
    try {
      if (await choose(yes)) visible = false;
    } finally { busy = false; sync(); }
  };
  accept.onclick = () => { void submit(true); };
  decline.onclick = () => { void submit(false); };
  dialog.addEventListener('cancel', event => { event.preventDefault(); void submit(false); });
  return {
    show(open: boolean, language: Locale) {
      visible = open;
      if (locale !== language) {
        locale = language;
        const [, , , , , , , , name, description, yes, no] = FESTIVAL_TEXT[language];
        title.textContent = name;
        prompt.textContent = description.replace('{points}', new Intl.NumberFormat(language).format(FESTIVAL_POINTS.encore));
        accept.textContent = yes;
        decline.textContent = no;
      }
      sync();
    },
    close() { visible = false; sync(); },
    dispose() { visible = false; dialog.remove(); },
  };
}
