// Only the opt-in candidate build reports delivered game frames and live commits.
import { createMeter, settlementMs, viewportSize, visibleHeavyCard, watchPageBreaks } from './preview-intervals.js';

export function createSettlementWindow() {
  let confirmed = null;
  return {
    start(time, run, shot, collected) {
      confirmed = collected >= 2 ? { time, run, shot } : null;
    },
    includes(time, frame) {
      return confirmed !== null && frame.run === confirmed.run && frame.shot === confirmed.shot &&
        time >= confirmed.time && time <= confirmed.time + settlementMs;
    },
  };
}

export function createGameHistory() {
  const runs = [];
  function observe(run, shot) {
    let entry = runs.at(-1);
    if (entry?.run !== run) {
      entry = { run, firstObservedShot: shot, lastObservedShot: shot, ended: false };
      runs.push(entry);
    }
    entry.lastObservedShot = shot;
    return entry;
  }
  return {
    observe,
    finish(run, shot) { observe(run, shot).ended = true; },
    report() {
      let streak = 0, longest = 0;
      for (const entry of runs) {
        streak = entry.ended && entry.firstObservedShot === 0 ? streak + 1 : 0;
        longest = Math.max(longest, streak);
      }
      return { completedGames: runs.filter(entry => entry.ended).length, longestConsecutiveFullGames: longest, runs };
    },
  };
}

function mount() {
  const meter = createMeter();
  const settlement = createSettlementWindow();
  const games = createGameHistory();
  const app = document.querySelector('#app');
  const start = new Date().toISOString();
  const sizes = new Set();
  const button = document.createElement('button');
  button.textContent = '計測結果';
  button.style.cssText = 'position:fixed;top:max(4px,env(safe-area-inset-top));right:2px;z-index:100;font:14px system-ui;min-height:44px;';
  const panel = document.createElement('dialog');
  const heading = document.createElement('h2');
  heading.textContent = '通常プレイの計測結果';
  const report = document.createElement('textarea');
  report.readOnly = true;
  report.rows = 12;
  report.setAttribute('aria-label', '通常プレイの計測記録');
  report.style.cssText = 'display:block;max-width:80vw;max-height:50dvh;';
  const stress = document.createElement('a');
  stress.href = './stress/';
  stress.target = '_blank';
  stress.rel = 'noopener';
  stress.textContent = 'コルク8個の負荷試験を別タブで開く';
  const replay = stress.cloneNode();
  replay.href = './stress/?scene=settlement';
  replay.textContent = '精算直後の再現試験を別タブで開く';
  const close = document.createElement('button');
  close.textContent = '閉じる';
  close.onclick = () => panel.close();
  panel.append(heading, report, stress, document.createElement('br'), replay, document.createElement('br'), close);
  document.body.append(button, panel);
  button.onclick = () => {
    meter.resetInterval();
    report.value = JSON.stringify({
      mode: '通常プレイ', start, end: new Date().toISOString(), url: location.href, userAgent: navigator.userAgent,
      rules: app.dataset.rulesVersion, commit: document.querySelector('meta[name="preview-commit"]')?.content,
      workingTreeModified: document.querySelector('meta[name="preview-modified"]')?.content === 'true',
      viewports: [...sizes], ...games.report(), scenes: meter.report(),
    }, null, 2);
    panel.showModal();
    report.select();
  };
  panel.addEventListener('close', meter.resetInterval);
  watchPageBreaks(meter.resetInterval);
  // A save/rotation can start and finish between two animation callbacks.
  new MutationObserver(meter.resetInterval).observe(app, {
    attributes: true, attributeFilter: ['data-screen', 'data-pause', 'data-saving'],
  });
  window.shatekkiMeasureSettlement = (time, run, shot, collected, ended) => {
    settlement.start(time, run, shot, collected);
    if (ended) games.finish(run, shot);
  };
  window.shatekkiMeasureFrame = (time, frame) => {
    let scene = null;
    if (frame) games.observe(frame.run, frame.shot);
    if (frame && !document.hidden && !panel.open && app.dataset.screen === 'game' && !app.dataset.pause && !app.dataset.saving) {
      const size = viewportSize();
      sizes.add(size);
      if (frame.corks > 0) {
        scene = '飛行 景品' + frame.prizes + ' マス' + frame.cells + ' コルク' + frame.corks;
      } else if (settlement.includes(time, frame) && visibleHeavyCard(app)) {
        scene = '精算直後 多獲得・初発見・複数札';
      }
      if (scene) scene += ' (' + size + ')';
    }
    meter.sample(time, scene, frame && frame.run + '/' + frame.shot);
  };
}

if (typeof window !== 'undefined' && new URLSearchParams(location.search).get('measure') === '1') mount();
