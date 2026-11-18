// Loaded only from the preview artifact. All observations live in this page.
export function createMeter() {
  const groups = new Map();
  let previous = null;
  return {
    resetInterval() { previous = null; },
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

function mount() {
  const meter = createMeter();
  const completed = new Set();
  let latest;
  let lastSettledShot;
  let settlementUntil = 0;
  const app = document.querySelector('#app');
  const start = new Date().toISOString();
  const sizes = new Set();
  const button = document.createElement('button');
  button.textContent = '計測結果';
  button.style.cssText = 'position:fixed;top:max(4px,env(safe-area-inset-top));right:2px;z-index:100;font:12px system-ui;';
  const panel = document.createElement('dialog');
  const report = document.createElement('textarea');
  report.readOnly = true;
  report.rows = 15;
  report.style.maxWidth = '80vw';
  const close = document.createElement('button');
  close.textContent = '閉じる';
  close.onclick = () => panel.close();
  panel.append(report, close);
  document.body.append(button, panel);
  button.onclick = () => {
    meter.resetInterval();
    report.value = JSON.stringify({
      start, end: new Date().toISOString(), userAgent: navigator.userAgent,
      rules: app.dataset.rulesVersion, commit: document.querySelector('meta[name="preview-commit"]')?.content,
      viewports: [...sizes], completedGames: completed.size, scenes: meter.report(),
    }, null, 2);
    panel.showModal();
    report.select();
  };
  window.shatekkiMeasureFrame = frame => { latest = frame; };
  const screens = new MutationObserver(() => {
    if (app.dataset.screen === 'result' && latest && app.dataset.phase === 'ended') completed.add(latest.run);
    if (app.dataset.screen !== 'game') meter.resetInterval();
  });
  screens.observe(app, { attributes: true, attributeFilter: ['data-screen'] });
  document.addEventListener('visibilitychange', () => meter.resetInterval());
  function sample(time) {
    const frame = latest;
    let scene = null;
    if (frame && !document.hidden && !panel.open && app.dataset.screen === 'game' && !frame.paused && !app.dataset.pause) {
      sizes.add([innerWidth, innerHeight].join('×'));
      if (frame.stage === 'flight' && frame.corks > 0) {
        scene = '飛行 景品' + frame.prizes + ' マス' + frame.cells + ' コルク' + frame.corks;
      } else if (frame.chain >= 2) {
        const card = app.querySelector('[data-testid="reward-card"]:not([hidden])');
        if (card?.querySelector('.rwd-set-fresh') && card.querySelectorAll('.rwd-set, .rwd-item').length >= 2) {
          const shot = frame.run + '/' + frame.shot;
          if (shot !== lastSettledShot) {
            lastSettledShot = shot;
            settlementUntil = time + 900;
          }
          if (time <= settlementUntil) scene = '精算直後 多獲得・初発見・複数札';
        }
      }
    }
    meter.sample(time, scene, frame && frame.run + '/' + frame.shot);
    requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
}

if (typeof window !== 'undefined' && new URLSearchParams(location.search).get('measure') === '1') mount();
