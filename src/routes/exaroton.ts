import { Router } from 'express';
import { getServerInfo, startServer, stopServer, restartServer, listServers } from '../services/exaroton.js';

const router = Router();

router.get('/server', async (_req, res) => {
  try {
    const serverId = process.env.EXAROTON_SERVER_ID;
    if (!serverId) {
      return res.status(500).json({ error: 'EXAROTON_SERVER_ID is not configured' });
    }

    const data = await getServerInfo(serverId);
    res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(502).json({ error: message });
  }
});

router.post('/server/start', async (_req, res) => {
  try {
    const serverId = process.env.EXAROTON_SERVER_ID;
    if (!serverId) {
      return res.status(500).json({ error: 'EXAROTON_SERVER_ID is not configured' });
    }

    const data = await startServer(serverId);
    res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(502).json({ error: message });
  }
});

router.post('/server/stop', async (_req, res) => {
  try {
    const serverId = process.env.EXAROTON_SERVER_ID;
    if (!serverId) {
      return res.status(500).json({ error: 'EXAROTON_SERVER_ID is not configured' });
    }

    const data = await stopServer(serverId);
    res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(502).json({ error: message });
  }
});

router.post('/server/restart', async (_req, res) => {
  try {
    const serverId = process.env.EXAROTON_SERVER_ID;
    if (!serverId) {
      return res.status(500).json({ error: 'EXAROTON_SERVER_ID is not configured' });
    }

    const data = await restartServer(serverId);
    res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(502).json({ error: message });
  }
});

router.get('/servers', async (_req, res) => {
  try {
    const data = await listServers();
    res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(502).json({ error: message });
  }
});

export default router;
