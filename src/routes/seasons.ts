import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataFile = path.join(__dirname, '..', '..', 'data', 'seasons.json');

function readSeasons() {
  if (!fs.existsSync(dataFile)) {
    return { seasons: [] };
  }
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function writeSeasons(data: any) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

router.get('/seasons', (_req, res) => {
  res.json(readSeasons());
});

router.post('/seasons', (req, res) => {
  const payload = req.body;
  writeSeasons(payload);
  res.json({ success: true });
});

export default router;
