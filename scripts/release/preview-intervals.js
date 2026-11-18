// Sample two consecutive displayed frames of the same scene and shot.
export function createMeter() {
  const groups = new Map();
  let previous = null;
  return {
    resetInterval() { previous = null; },
    seconds(group) { return (groups.get(group)?.duration ?? 0) / 1000; },
    sample(at, group, identity) {
      if (group && previous?.group === group && previous.identity === identity && at > previous.at) {
        const bucket = groups.get(group) ?? { intervals: [], duration: 0 };
        const dt = at - previous.at;
        bucket.intervals.push(dt);
        bucket.duration += dt;
        groups.set(group, bucket);
      }
      previous = group ? { at, group, identity } : null;
    },
    report() {
      return Object.fromEntries([...groups].map(([name, { intervals, duration }]) => {
        const ordered = [...intervals].sort((a, b) => a - b);
        return [name, {
          frames: ordered.length, seconds: duration / 1000, fps: 1000 * ordered.length / duration,
          p95Ms: ordered[Math.ceil(ordered.length * .95) - 1], worstMs: ordered.at(-1),
          intervalsOver33ms: ordered.filter(dt => dt > 1000 / 30).length,
        }];
      }));
    },
  };
}

export function viewportSize() {
  return [window.visualViewport?.width ?? innerWidth, window.visualViewport?.height ?? innerHeight]
    .map(Math.round).join('×');
}

export function watchPageBreaks(reset, doc = document, win = window) {
  for (const event of ['visibilitychange', 'freeze', 'resume']) doc.addEventListener(event, reset);
  for (const event of ['pagehide', 'pageshow', 'resize']) win.addEventListener(event, reset);
  win.visualViewport?.addEventListener('resize', reset);
}

export const settlementMs = 900;

export function visibleHeavyCard(root) {
  const card = root.querySelector('[data-testid="reward-card"]:not([hidden])');
  if (!card || !card.getClientRects().length || !card.querySelector('.rwd-set-fresh')) return null;
  return card.querySelectorAll('.rwd-set, .rwd-item').length >= 2 ? card : null;
}
