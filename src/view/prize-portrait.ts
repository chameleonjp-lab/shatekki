/** P001–P100 occupy the 10×10 atlas in catalog order. The sheet is baked from the shelf meshes. */
export function prizePortrait(doc: Document, typeId: string): HTMLElement {
  const portrait = doc.createElement('span');
  portrait.className = 'rwd-portrait';
  portrait.dataset.prize = typeId;
  portrait.setAttribute('aria-hidden', 'true');
  const index = Number(typeId.slice(1)) - 1;
  portrait.style.backgroundPosition = `${(index % 10) * 100 / 9}% ${Math.floor(index / 10) * 100 / 9}%`;
  return portrait;
}
