import '../../../src/app.css';
import '../../../src/ui/expanded.css';
import { getGameplayBundle } from '../../../src/catalog/gameplay-config';
import { rewardDevicesFor } from '../../../src/core/rewards';
import { isLandscape } from '../../../src/environment';
import { translate } from '../../../src/i18n';
import { prizeName } from '../../../src/i18n/content';
import { createExpansionTranslator } from '../../../src/i18n/expansion-text';
import { createShotWorld } from '../../../src/sim/world';
import { mountBoothMap } from '../../../src/ui/booth-map';
import { createThreeRenderer } from '../../../src/view/renderer';
import { seriesOutlineTargets } from '../../../src/view/series-outline';
import { createMeter, viewportSize, watchPageBreaks } from '../preview-intervals.js';
import { flightFixture } from './flight';
import { settlementFixture } from './settlement';

async function mount() {
  const bundle = getGameplayBundle('expanded-next');
  const { catalog, tuning, layout, expansion, behavior } = bundle;
  const illustratedRewards = behavior.presentation === 'confirmed-motions';
  const t = createExpansionTranslator(() => 'ja', (key, params) => translate('ja', key, params));
  const name = id => prizeName('ja', id);
  const canvas = document.querySelector('canvas');
  const renderer = createThreeRenderer(canvas, {
    layout, corkRadius: tuning.cork.radius, translate: t, resolvePrize: id => catalog.prizes.get(id),
    expanded: { catalog, expansion, illustratedRewards, translate: t, prizeName: name },
  });
  const ui = document.querySelector('.ui-layer');
  const map = mountBoothMap(ui, { layout, t });
  let lastMap = -Infinity;
  function updateMap(time, frame, view) {
    if (time - lastMap < 150 && view.phase === 'resolving') return;
    lastMap = time;
    const series = view.expansion.outlineSeries && expansion.series.get(view.expansion.outlineSeries);
    map.update({
      standX: view.standX, aspect: canvas.clientWidth / canvas.clientHeight, prizes: frame.prizes, cells: view.expansion.cells,
      ...(series ? { outlined: new Set(seriesOutlineTargets(frame.prizes, series)), outlineColor: series.color } : {}),
    });
  }
  const makeWorld = () => createShotWorld(layout, catalog, tuning, {
    transformPolicy: behavior.transformPolicy, rewardDevices: rewardDevicesFor(expansion.profile.rewards),
    reportPrizeContacts: illustratedRewards,
  });
  const create = new URLSearchParams(location.search).get('scene') === 'settlement' ? settlementFixture : flightFixture;
  const fixture = await create({ bundle, renderer, makeWorld, updateMap, ui, t, prizeName: name });
  document.title = document.querySelector('#controls strong').textContent = fixture.title;
  document.querySelector('#controls p').textContent = fixture.explanation + ' 試験中は無音です。通常の記録には入りません。';
  const meter = createMeter();
  const toggle = document.querySelector('#toggle');
  const status = document.querySelector('#status');
  const report = document.querySelector('#report');
  const ready = () => !document.hidden && !isLandscape(innerWidth, innerHeight);
  const group = () => fixture.scene + ' (' + viewportSize() + ')';
  let start = null, trial = 0, previous = null, scheduled = 0, lastUi = -Infinity;
  let running = false, preparing = false, inTrial = false;

  function resetInterval() {
    previous = null;
    meter.resetInterval();
  }
  function schedule() {
    if (running && ready() && !scheduled && !preparing) scheduled = requestAnimationFrame(frame);
  }
  function stop(message) {
    running = false;
    cancelAnimationFrame(scheduled);
    scheduled = 0;
    resetInterval();
    status.textContent = message;
    toggle.textContent = '計測を続ける';
    report.value = JSON.stringify({
      mode: fixture.mode, rules: catalog.rulesVersion, commit: __PREVIEW_COMMIT__, workingTreeModified: __PREVIEW_MODIFIED__, seed: fixture.seed,
      start, end: new Date().toISOString(), url: location.href, userAgent: navigator.userAgent,
      pixelRatio: window.devicePixelRatio, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      repetitions: trial, observed: fixture.observation(), scenes: meter.report(),
    }, null, 2);
    report.hidden = false;
    report.select();
  }
  async function frame(time) {
    scheduled = 0;
    if (!running || !ready()) return;
    try {
      if (!inTrial) {
        preparing = true;
        try { await fixture.begin(++trial); inTrial = true; } finally { preparing = false; }
        // Creation, the previous trial and time in the background never count.
        resetInterval();
      } else {
        const dt = previous === null ? 0 : (time - previous) / 1000;
        previous = time;
        if (fixture.draw(dt, time)) {
          const scene = group();
          meter.sample(time, scene, trial);
          const seconds = meter.seconds(scene);
          if (time - lastUi >= 150) {
            status.textContent = '計測中　' + (Math.floor(seconds * 10) / 10).toFixed(1) + ' / 60 秒';
            lastUi = time;
          }
          if (seconds >= 60) { stop('この寸法で対象の場面を60秒計測しました。'); return; }
        } else {
          fixture.end();
          inTrial = false;
          resetInterval();
        }
      }
      schedule();
    } catch (error) {
      stop('計測を中断しました。' + error.message);
      toggle.disabled = true;
    }
  }
  function resize() {
    renderer.resize(canvas.clientWidth, canvas.clientHeight);
    resetInterval();
    if (running && !ready()) status.textContent = '休止中です。縦向きでこの画面に戻ると計測を続けます。';
    schedule();
  }
  watchPageBreaks(resize);
  resize();
  status.textContent = '縦向きで計測できます。';
  toggle.disabled = false;
  toggle.onclick = () => {
    if (running) { stop('計測を停止しました。'); return; }
    start ??= new Date().toISOString();
    running = true;
    report.hidden = true;
    toggle.textContent = '停止して結果を見る';
    resize();
  };
}

mount().catch(error => { document.querySelector('#status').textContent = '準備できませんでした。' + error.message; });
