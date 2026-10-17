import type { BrowserWindow } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Captures the production renderer itself, without sample projects or a second UI. */
export async function verifyShell(window: BrowserWindow, output: string): Promise<void> {
  await mkdir(output, { recursive: true });
  const report: unknown[] = [];
  window.setMinimumSize(0, 0);
  window.setContentSize(1586, 992);

  async function visit(route: string): Promise<void> {
    await window.webContents.executeJavaScript(`(async () => {
      const route = ${JSON.stringify(route)};
      if (document.querySelector('[data-route="' + route + '"]')) {
        document.querySelector('[data-route="' + route + '"]').click();
      } else location.hash = '/' + route;
      await new Promise((resolve, reject) => {
        const check = () => {
          if (document.querySelector('[data-shell-route="' + route + '"]')) {
            observer.disconnect(); clearTimeout(timer); resolve();
          }
        };
        const observer = new MutationObserver(check);
        const timer = setTimeout(() => { observer.disconnect(); reject(new Error('Route did not mount: ' + route)); }, 6000);
        observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
        check();
      });
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    })()`);
  }

  async function capture(name: string): Promise<void> {
    const measurements: unknown = await window.webContents.executeJavaScript(`(() => {
      const width = innerWidth;
      if (document.documentElement.scrollWidth > width + 1) throw new Error('Horizontal page overflow at ' + width);
      const broken = [...document.querySelectorAll('canvas')].filter(canvas => !canvas.width || !canvas.height);
      if (broken.length) throw new Error('Decorative canvas did not initialize');
      return { route: location.hash, width, height: innerHeight, font: getComputedStyle(document.body).fontFamily,
        reducedMotion: document.documentElement.dataset.reducedMotion,
        cards: [...document.querySelectorAll('.nexus-card')].map(card => { const r=card.getBoundingClientRect(); return {title:card.querySelector('h2,h3')?.textContent,x:r.x,y:r.y,width:r.width,height:r.height}; }),
        canvases: document.querySelectorAll('canvas').length };
    })()`);
    await writeFile(path.join(output, `${name}.png`), (await window.webContents.capturePage()).toPNG());
    report.push({ name, measurements });
  }

  for (const route of ['overview', 'pulse', 'session']) {
    await visit(route);
    await capture(route);
  }

  await window.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', {key:'k',ctrlKey:true,bubbles:true}))`);
  await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const check = () => {
      const dialog = document.querySelector('dialog[open]');
      if (dialog) { observer.disconnect(); clearTimeout(timer);
        if (document.activeElement?.tagName !== 'INPUT') reject(new Error('Navigation search was not focused'));
        else { dialog.querySelector('button[aria-label="Close navigation"]').click(); resolve(); }
      }
    };
    const observer = new MutationObserver(check);
    const timer=setTimeout(() => {observer.disconnect();reject(new Error('Keyboard navigation did not open'));},3000);
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true}); check();
  })`);

  await visit('settings');
  const preference: unknown = await window.webContents.executeJavaScript(`localStorage.getItem('nexus.reduce-motion')`);
  try {
    await window.webContents.executeJavaScript(`(() => {const checkbox = document.querySelector('input[type="checkbox"]');if(!checkbox)throw new Error('Motion preference missing');if(!checkbox.checked)checkbox.click();})()`);
    await visit('overview');
    const reduced: unknown = await window.webContents.executeJavaScript(`document.documentElement.dataset.reducedMotion`);
    if (reduced !== 'true') throw new Error('Reduced-motion preference was not applied.');
    await capture('overview-reduced');
    window.setContentSize(960, 800);
    await visit('session');
    await capture('session-960');
  } finally {
    await window.webContents.executeJavaScript(`(() => {
      const previous = ${JSON.stringify(preference)};
      if (previous === null) localStorage.removeItem('nexus.reduce-motion');
      else if(typeof previous === 'string') localStorage.setItem('nexus.reduce-motion',previous);
    })()`);
  }
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Shell verification passed: 3 reference layouts, keyboard navigation, reduced motion and 960px layout. Captures: ${output}`);
}
