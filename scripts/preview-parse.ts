import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseReport } from '../src/lib/parser/index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '../src/lib/parser/__fixtures__/dd713_bag_2026-06-12.txt');

const raw = readFileSync(fixturePath, 'utf-8');
const result = parseReport(raw);

console.log(JSON.stringify(result, null, 2));
