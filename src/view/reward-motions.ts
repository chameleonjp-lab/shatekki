import type { UiCue } from '../contracts';
import type { ConfirmedPresentation } from '../contracts/persistence';
import { momentCue, shotMoment, type ShotMomentInput } from '../ui/reward-panel';
import { effectCueFor } from '../audio/sounds';
import { prizePortrait } from './prize-portrait';

type ConfirmedShot = Extract<ConfirmedPresentation, { kind: 'shot' }>;
interface RewardMotionDeps {
  cue(cue: UiCue['cue'], extra?: { count: number }): void;
  card(input: ShotMomentInput, shot: ConfirmedShot): void;
  /**
   * r007: any set completed in the shot (first or again) is the one big moment, ahead of
   * "continue from the last cork" and "several at once"; one main sound only.
   */
  readonly setsFirst?: boolean;
}

/** One presenter per game. No clock, input callbacks, storage or score dependencies. */
export function mountRewardMotions(root: HTMLElement, deps: RewardMotionDeps) {
  const seen = new Set<string>();
  const doc = root.ownerDocument;
  const decoration = doc.createElement('div');
  decoration.className = 'rwd-motion-layer';
  decoration.setAttribute('aria-hidden', 'true');
  root.appendChild(decoration);
  const clear = () => decoration.replaceChildren();
  function draw(kind: string, tokens: readonly string[] = []) {
    const scene = doc.createElement('div');
    scene.className = 'rwd-motion';
    scene.dataset.motion = kind;
    const destination = doc.createElement('span');
    destination.className = 'rwd-destination';
    scene.appendChild(destination);
    tokens.forEach((type, index) => {
      const cork = type === 'cork';
      const token = cork ? doc.createElement('i') : prizePortrait(doc, type);
      token.dataset.token = cork ? 'cork' : 'ticket';
      // Even a full shelf fits in the same short, input-independent presentation.
      token.style.setProperty('--stagger', `${Math.round(230 * index / tokens.length)}ms`);
      token.style.setProperty('--spread', `${(index % 5) * 7}px`);
      scene.appendChild(token);
    });
    scene.addEventListener('animationend', (event) => {
      if (event.target === scene) scene.remove();
    });
    decoration.replaceChildren(scene);
  }
  return {
    presentRewardMotion(input: ConfirmedPresentation): void {
      const key = JSON.stringify([input.kind, input.runId, input.kind === 'shot' ? input.shotId : input.operationId]);
      if (seen.has(key)) return;
      seen.add(key);
      clear();
      if (input.kind === 'perfectLoad') {
        if (input.replayed || input.load.tier !== 'perfect') return;
        if (!input.reducedMotion) draw('latch');
        deps.cue('critLatch');
        return;
      }
      const s = input.summary;
      const card = {
        collected: s.chainCount, completedSets: s.newlyCompletedSets, freshSets: input.freshSets,
        firedWithLastCork: input.ammoBeforeShot === 1, ammoAfter: s.ammoAfter, runEnded: s.runEnded, rewards: s.rewards ?? [],
      };
      deps.card(card, input);
      if (input.replayed) return;
      const anySet = deps.setsFirst === true && card.completedSets.length > 0;
      const moment = anySet ? { ...shotMoment(card), big: 'setFirst' as const } : shotMoment(card);
      const sound: { readonly cue: UiCue['cue']; readonly count?: number } | null = anySet ? { cue: card.freshSets.length > 0 ? 'setDiscovered' : 'setComplete' } : momentCue(moment, card.collected);
      if (sound?.count !== undefined) deps.cue(sound.cue, { count: sound.count });
      else if (sound) deps.cue(sound.cue);
      else if (card.rewards.some(r => r.id === 'A2')) deps.cue('windChime');
      else {
        const effect = effectCueFor(s.effects);
        if (effect) deps.cue(effect);
        else if (s.ledger?.nominalPenalty > 0) deps.cue('penalty');
      }
      if (input.reducedMotion) return;
      if (moment.big === 'setFirst') draw('discovery');
      else if (moment.big === 'continue') draw('refill', Array<string>(s.bonusAmmoGranted).fill('cork'));
      else if (card.collected > 0) draw('bag', s.collected.map(p => p.typeId));
    },
    clear,
    destroy(): void {
      seen.clear();
      decoration.remove();
    },
  };
}
