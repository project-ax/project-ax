/**
 * OAuth PKCE flow for Claude Max authentication.
 *
 * Uses node:http for the callback server, node:crypto for PKCE,
 * and global fetch for token exchange. Zero new dependencies.
 */

import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';

// OAuth endpoints and client config
const AUTH_URL = 'https://claude.ai/oauth/authorize';
const TOKEN_ENDPOINT = 'https://console.anthropic.com/v1/oauth/token';
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const REDIRECT_URI = 'http://localhost:1455/callback';
const SCOPES = 'org:create_api_key user:profile user:inference';

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

// ── PKCE Helpers ──

export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function generateState(): string {
  return randomBytes(16).toString('hex');
}

// ── Callback Server ──

/**
 * Start a local HTTP server on 127.0.0.1:1455 to receive the OAuth callback.
 * Validates the state parameter and returns the authorization code.
 */
export function startCallbackServer(expectedState: string, port = 1455): Promise<{ code: string; server: Server }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Authorization failed</h2><p>You can close this tab.</p></body></html>');
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Invalid state parameter</h2></body></html>');
        server.close();
        reject(new Error('OAuth state mismatch — possible CSRF'));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Missing authorization code</h2></body></html>');
        server.close();
        reject(new Error('No authorization code in callback'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h2>Authorization successful!</h2><p>You can close this tab and return to the terminal.</p></body></html>');
      resolve({ code, server });
    });

    server.listen(port, '127.0.0.1', () => {
      // Server is ready
    });

    server.on('error', (err) => {
      reject(new Error(`Failed to start callback server: ${err.message}`));
    });
  });
}

// ── Token Exchange ──

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCodeForTokens(code: string, codeVerifier: string, state: string): Promise<OAuthTokens> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      state,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json() as Record<string, unknown>;
  const expiresIn = (data.expires_in as number) || 3600;

  return {
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
  };
}

/**
 * Refresh an expired OAuth token.
 */
export async function refreshOAuthTokens(refreshToken: string): Promise<OAuthTokens> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json() as Record<string, unknown>;
  const expiresIn = (data.expires_in as number) || 3600;

  return {
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
  };
}

// ── Full Interactive Flow ──

/**
 * Run the full OAuth PKCE flow:
 * 1. Generate PKCE verifier/challenge + state
 * 2. Start local callback server
 * 3. Open browser to authorization URL
 * 4. Wait for callback with auth code
 * 5. Exchange code for tokens
 */
export async function runOAuthFlow(): Promise<OAuthTokens> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  const authUrl = new URL(AUTH_URL);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  // Start the callback server before opening the browser
  const callbackPromise = startCallbackServer(state);

  console.log('\n  Opening browser for Claude Max authorization...');
  console.log(`  If the browser doesn't open, visit:\n  ${authUrl.toString()}\n`);

  // Open browser (platform-specific)
  const { exec } = await import('node:child_process');
  const openCmd = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'start'
      : 'xdg-open';

  exec(`${openCmd} "${authUrl.toString()}"`);

  // Wait for the callback
  const { code, server } = await callbackPromise;

  // Close the callback server
  server.close();

  // Exchange the code for tokens
  const tokens = await exchangeCodeForTokens(code, codeVerifier, state);

  console.log('  Authorization successful!\n');
  return tokens;
}
