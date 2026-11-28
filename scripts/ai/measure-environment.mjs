import os from 'node:os';
import { writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
let reportPath;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--report' && args[i + 1] && !args[i + 1].startsWith('--')) {
    reportPath = args[++i];
  } else {
    console.error('Usage: node scripts/ai/measure-environment.mjs [--report <path>]');
    process.exit(2);
  }
}

const report = {
  os: `${os.type()} ${os.release()}`,
  architecture: os.arch(),
  cpuModel: os.cpus()[0]?.model ?? 'unknown',
  logicalCores: os.cpus().length,
  totalMemoryBytes: os.totalmem(),
  nodeVersion: process.version,
};

const json = `${JSON.stringify(report, null, 2)}\n`;
if (reportPath) {
  await writeFile(reportPath, json, { encoding: 'utf8', flag: 'w' });
} else {
  process.stdout.write(json);
}
