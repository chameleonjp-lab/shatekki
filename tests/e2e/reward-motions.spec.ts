import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

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
