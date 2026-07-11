import https from 'https';
import { URL } from 'url';

const BASE_URL = 'https://api.exaroton.com/v1';

function getHeaders() {
  const token = process.env.EXAROTON_API_TOKEN;
  if (!token) {
    throw new Error('EXAROTON_API_TOKEN is not configured');
  }

  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

function request<T>(path: string, init?: RequestInit): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = getHeaders() as Record<string, string>;

    const options: https.RequestOptions = {
      method: init?.method || 'GET',
      headers
    };

    const req = https.request(url, options, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(parsed?.error || `Exaroton API request failed with ${res.statusCode}`));
            return;
          }
          resolve(parsed as T);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);

    if (init?.body) {
      req.write(init.body);
    }

    req.end();
  });
}

export async function getServerInfo(serverId: string) {
  return request<{ success?: boolean; server?: any }>(`/servers/${serverId}`);
}

export async function startServer(serverId: string) {
  return request<{ success?: boolean; message?: string }>(`/servers/${serverId}/start`, { method: 'POST' });
}

export async function stopServer(serverId: string) {
  return request<{ success?: boolean; message?: string }>(`/servers/${serverId}/stop`, { method: 'POST' });
}

export async function restartServer(serverId: string) {
  return request<{ success?: boolean; message?: string }>(`/servers/${serverId}/restart`, { method: 'POST' });
}

export async function listServers() {
  return request<{ success?: boolean; servers?: any[] }>(`/servers`);
}
