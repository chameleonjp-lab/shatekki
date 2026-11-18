import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { readRecordedRun } from '../helpers/read-recorded-run';

test.use({ baseURL: 'http://127.0.0.1:4178' });

async function stopOnPerfect(page: Page) {
  const button = page.getByTestId('btn-load');
  await expect(button).toBeVisible();
  // Read the displayed meter and press its button in that frame. Time alone
  // cannot reliably hit the sweet spot on a slow WebGL worker.
  await button.evaluate(el => new Promise<void>(resolve => {
    const marker = document.querySelector<HTMLElement>('.load-marker')!;
    function tryStop() {
      const bar = parseFloat(marker.style.left);
      if (bar >= 81 && bar <= 89) {
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true }));
        resolve();
      } else requestAnimationFrame(tryStop);
    }
    tryStop();
  }));
}

// Capture the actual mix sent to the audio device. Retain the short recording
// on the play test so it can be auditioned independently of headless Chromium.
async function recordOutput(page: Page) {
  await page.addInitScript(() => {
    const original = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
      const node = original.call(this);
      const connect = node.connect.bind(node);
      node.connect = ((destination: AudioNode) => {
        if (destination === this.destination) {
          const stream = this.createMediaStreamDestination();
          connect(stream);
          const recorder = new MediaRecorder(stream.stream);
          const chunks: Blob[] = [];
          recorder.ondataavailable = event => chunks.push(event.data);
          recorder.start();
          Object.assign(window, { finishRecording: () => new Promise<string>(resolve => {
            recorder.onstop = () => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result).split(',')[1]!);
              reader.readAsDataURL(new Blob(chunks, { type: recorder.mimeType }));
              stream.stream.getTracks().forEach(t => t.stop());
            };
            recorder.stop();
          }) });
        }
        return connect(destination);
      }) as GainNode['connect'];
      return node;
    };
  });
}

for (const reduce of [false, true]) {
  test(`first committed load, fire and settlement with reduced motion ${reduce}`, async ({page}, info) => {
    test.setTimeout(90000);
    await page.emulateMedia({ reducedMotion: reduce ? 'reduce' : 'no-preference' });
    if (!reduce) await recordOutput(page);
    await page.goto('/?e2e=1');
    await expect(page.locator('[data-rules-version]')).toHaveAttribute('data-rules-version', 'rules-v2-proposed-r006');
    if (reduce) {
      await page.getByTestId('home-settings').click();
      await page.locator('[role=dialog] input[type=range]').fill('0');
      await page.locator('[role=dialog] .btn.primary').click();
    }
    await page.getByTestId('home-start').click();
    await page.getByTestId('order-decline').click();
    await page.getByTestId('btn-confirm-position').click();
    const latchStyle = reduce ? null : page.locator('.rwd-motion-layer').evaluate(layer =>
      new Promise<string>(resolve => {
        const observer = new MutationObserver(() => {
          const latch = layer.querySelector('[data-motion=latch]');
          if (latch) {
            resolve(getComputedStyle(latch).pointerEvents);
            observer.disconnect();
          }
        });
        observer.observe(layer, { childList: true });
      }));
    await stopOnPerfect(page);
    await expect(page.getByTestId('load-label')).toHaveText(/会心/);
    const latch = page.locator('[data-motion=latch]');
    if (reduce) await expect(latch).toHaveCount(0);
    else expect(await latchStyle).toBe('none');
    const firing = page.getByTestId('controls').evaluate((el, skip) => new Promise<void>(resolve => {
      const observer = new MutationObserver(() => {
        if (el.dataset.mode !== 'resolving') return;
        observer.disconnect();
        if (skip) el.querySelector<HTMLButtonElement>('[data-testid=btn-skip]')!.click();
        resolve();
      });
      observer.observe(el, { attributes: true, attributeFilter: ['data-mode'] });
    }), reduce);
    const fire = page.getByTestId('btn-fire');
    await fire.dispatchEvent('pointerdown');
    await fire.dispatchEvent('pointerup');
    await firing;
    await expect.poll(async () => {
      if (await page.getByTestId('shopkeeper-question').isVisible()) await page.getByTestId('shopq-choice-A').click();
      return page.getByTestId('controls').getAttribute('data-mode');
    }, { timeout: 30000 }).toBe('position');
    await expect(latch).toHaveCount(0);
    if (!reduce) {
      const audio = await page.evaluate(() => (window as unknown as {finishRecording():Promise<string>}).finishRecording());
      const body = Buffer.from(audio, 'base64');
      expect(body.length).toBeGreaterThan(1000);
      const path = info.outputPath('first-load-and-shot.webm');
      await writeFile(path, body);
      await info.attach('first-load-and-shot.webm', { path, contentType: 'audio/webm' });
    } else await expect(page.locator('.rwd-motion')).toHaveCount(0);
  });
}

test('enlarged choices scroll by touch before the final answer is tapped', async ({ page, context }) => {
  test.setTimeout(120000);
  const { shootShopkeeper } = await import('../helpers/shoot-shopkeeper');
  await page.setViewportSize({ width: 375, height: 600 });
  await page.goto('/?e2e=1');
  await page.getByTestId('home-start').click();
  await page.getByTestId('order-decline').click();
  await shootShopkeeper(page);
  await expect(page.getByTestId('shopkeeper-question')).toBeVisible({ timeout: 30000 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.setFontSizes', { fontSizes: { standard: 48 } });
  const choices = page.locator('.shopq-choices');
  await expect.poll(() => choices.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(30);
  const box = (await choices.boundingBox())!;
  const x = box.x + box.width / 2;
  const bottom = box.y + box.height - 6;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{x, y: bottom}] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{x, y: bottom - i * box.height / 10}] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => choices.evaluate(el => el.scrollTop)).toBeGreaterThan(10);
  await expect(page.getByTestId('shopkeeper-question')).toHaveAttribute('data-answered', '0');
  await page.getByTestId('shopq-choice-B').tap();
  await expect(page.getByTestId('shopkeeper-question')).toBeHidden();
  await cdp.detach();
});

async function startDeviceGame(page: Page, standX = -2.35) {
  // A slow renderer must not change how long the player aimed. Only the
  // game clock is stepped; all commands still go through the play controls.
  await page.clock.install({ time: new Date('2026-11-18T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-18T12:01:00Z'));
  await page.addInitScript(() => {
    const random = Crypto.prototype.getRandomValues;
    Crypto.prototype.getRandomValues = function (this: Crypto, values) {
      if (values instanceof Uint32Array && values.length === 1) {
        values[0] = 7919;
        return values;
      }
      return random.call(this, values);
    } as typeof random;
  });
  await page.goto('/?e2e=1');
  await expect(page.locator('[data-rules-version]')).toHaveAttribute('data-rules-version', 'rules-v2-proposed-r006');
  await page.getByTestId('home-start').click();
  await page.getByTestId('order-decline').click();
  await expect(page.getByTestId('reward-order')).toBeHidden();
  const stand = page.getByTestId('stand-slider');
  await stand.fill(String(standX));
  await page.clock.runFor(32); // render the camera at the requested stand
  await expect(stand).toHaveValue(String(standX));
}

async function swipeAim(page: Page, yawDelta: number, pitchDelta: number) {
  if (yawDelta === 0 && pitchDelta === 0) return;
  const pad = page.getByTestId('aim-pad');
  await expect(pad).toBeInViewport({ ratio: 1 });
  const box = (await pad.boundingBox())!;
  // The pad accepts 0.0022 radians per CSS pixel. Lift and swipe again for a
  // long adjustment so both ends of every touch stay inside the visible pad.
  const dx = yawDelta / 0.0022;
  const dy = -pitchDelta / 0.0022;
  const strokes = Math.ceil(Math.max(Math.abs(dx) / (box.width - 16), Math.abs(dy) / (box.height - 16)));
  const stepX = dx / strokes;
  const stepY = dy / strokes;
  const x = box.x + (box.width - stepX) / 2;
  const y = box.y + (box.height - stepY) / 2;
  const touch = await page.context().newCDPSession(page);
  try {
    for (let i = 0; i < strokes; i++) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + stepX, y: y + stepY }] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
  } finally {
    await touch.detach();
  }
}

async function deviceShot(page: Page, yawDelta: number, pitchDelta: number) {
  await page.getByTestId('btn-confirm-position').click();
  const controls = page.getByTestId('controls');
  await expect(controls).toHaveAttribute('data-mode', 'loading');
  const marker = page.locator('.load-marker');
  await page.clock.runFor(512); // approach the sweet spot on the rising meter
  await expect.poll(async () => {
    await page.clock.runFor(32);
    const percent = await marker.evaluate(el => parseFloat((el as HTMLElement).style.left));
    return percent >= 81 && percent <= 89;
  }, { timeout: 30000, intervals: [0] }).toBe(true);
  await page.getByTestId('btn-load').dispatchEvent('pointerdown', { isPrimary: true });
  await expect(controls).toHaveAttribute('data-mode', 'aiming');
  await swipeAim(page, yawDelta, pitchDelta);
  await page.getByTestId('btn-fire').tap();
  await expect(controls).toHaveAttribute('data-mode', 'resolving');
  await expect.poll(async () => {
    await page.clock.runFor(128);
    const question = page.getByTestId('shopkeeper-question');
    if (await question.isVisible()) await page.getByTestId('shopq-choice-A').click();
    return controls.getAttribute('data-mode');
  }, { timeout: 45000, intervals: [0] }).toBe('position');
  await page.clock.runFor(16); // render the just-adopted saved state
}

test('wind chime marks and sounds only after a reflected cork', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const set = AudioParam.prototype.setValueAtTime;
    const frequencies: number[] = [];
    Object.assign(window, { chimeFrequencies: frequencies });
    AudioParam.prototype.setValueAtTime = function(value, time) {
      // The chime's upper partial distinguishes it from the other glass and metal sounds.
      if (value === 2351) frequencies.push(value);
      return set.call(this, value, time);
    };
  });
  await startDeviceGame(page);
  const mark = page.getByRole('img', { name: '跳ね返し風鈴', exact: true });
  await expect(mark).toHaveText('♪');
  await deviceShot(page, -0.255, 0.289);
  await expect(mark).toHaveText('♪');
  await expect(page.locator('[data-reward=A2]')).toHaveCount(0);
  const rings = () => page.evaluate(() => (window as unknown as {chimeFrequencies: number[]}).chimeFrequencies.length);
  expect(await rings()).toBe(0);
  await deviceShot(page, -0.135 - (-0.255), 0.224 - 0.289);
  await expect(page.getByRole('img', {name: '跳ね返し風鈴 · 使用済み'})).toHaveText('✓');
  await expect(page.locator('[data-reward=A2]')).toContainText('2');
  expect(await rings()).toBe(1);
  const { lastSummary } = await readRecordedRun(page);
  expect(lastSummary?.rewards).toContainEqual(expect.objectContaining({ id: 'A2', granted: 2 }));
});

test('piggy-bank marks two separate deposits and the real grant', async ({ page }) => {
  test.setTimeout(120000);
  await startDeviceGame(page);
  const mark = page.getByRole('img', {name: /コルク貯金箱/});
  await expect(mark).toHaveText('0/2');
  await deviceShot(page, -0.271, -0.070);
  await expect(mark).toHaveText('1/2');
  await expect(page.locator('[data-reward=A4]')).toHaveCount(0);
  await deviceShot(page, 0, 0);
  await expect(mark).toHaveAccessibleName('コルク貯金箱 · 2/2 · 使用済み');
  await expect(mark).toHaveText('2/2 ✓');
  await expect(page.locator('[data-reward=A4]')).toContainText('4');
});

test('the bag leaves with the original prize and pays the advertised two corks', async ({ page }) => {
  test.setTimeout(90000);
  await startDeviceGame(page, 0.21);
  const bag = page.getByRole('img', {name: 'おまけ袋 · おまけ+2'});
  await expect(bag).toBeVisible();
  const original = (await readRecordedRun(page)).state.expansion!.rewards!.bag!.instanceId;
  // P077 slides to the right during the first load and the cork flight.
  await deviceShot(page, 0.04, -0.201);
  await expect(bag).toHaveCount(0);
  await expect(page.locator('[data-reward=A1]')).toHaveText('おまけ袋: 弾+2');
  const { lastSummary } = await readRecordedRun(page);
  expect(lastSummary?.collected.map(prize => prize.instanceId)).toContain(original);
  expect(lastSummary?.rewards).toContainEqual(expect.objectContaining({ id: 'A1', granted: 2 }));
});

test('a prize falling into the seesaw tray marks the tray and grants two corks', async ({ page }) => {
  test.setTimeout(90000);
  await startDeviceGame(page, -1.47);
  await expect(page.getByRole('img', {name: 'コルクのシーソー', exact: true})).toBeVisible();
  await deviceShot(page, 0, -0.169);
  await expect(page.getByRole('img', {name: 'コルクのシーソー · 使用済み'})).toHaveText('✓');
  await expect(page.locator('[data-reward=A3]')).toHaveText('コルクのシーソー: 弾+2');
  await expect(page.getByTestId('reward-strip')).toContainText('袋 1個');
});

for (const [yaw, ring, grant] of [[0.17, '中心命中', 3], [0.24, '外周命中', 1]] as const) {
  test(`last-cork target shows the actual ring and refill (${ring})`, async ({ page }) => {
    test.setTimeout(240000);
    await startDeviceGame(page, 0);
    const label = page.getByRole('img', {name: '最後の一発の二重丸 · 中心+3／外+1'});
    await expect(label).toHaveCount(0);
    for (let i = 0; i < 9; i++) await deviceShot(page, 0, i === 0 ? 0.3 : 0);
    await expect(label).toBeVisible();
    await deviceShot(page, yaw, -0.17 - 0.3);
    await expect(page.locator('[data-reward=A5]')).toHaveText(`最後の一発の二重丸 · ${ring}: 弾+${grant}`);
    await expect(page.getByTestId('reward-card')).toContainText(`あと${grant}発！`);
    await expect(label).toHaveCount(0);
  });
}
