// Where Chrome lives, and a launcher configured for software rendering so the
// visual checks run on any machine. Forward slashes throughout: Node accepts
// them on Windows and they survive every layer of shell quoting.

import puppeteer from 'puppeteer';
import { existsSync } from 'node:fs';

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

export function chromePath() {
  for (const p of CANDIDATES) if (existsSync(p)) return p;
  throw new Error('no Chrome or Edge found');
}

export function launch(extraArgs = []) {
  return puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      // SwiftShader so this works with no usable GPU under headless
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--window-size=1600,900', '--hide-scrollbars', '--mute-audio',
      ...extraArgs,
    ],
  });
}
