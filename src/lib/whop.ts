import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { useSyncExternalStore } from 'react';

import { api } from '@convex/_generated/api';
import { convex, HAS_BACKEND } from './backend';

/**
 * Sign in with Whop: OAuth 2.1 with PKCE, as a public client, so the phone can finish the exchange itself.
 * Whop receives nothing from the profile: only the sign-in itself. The account is kept in SecureStore.
 */

/** The Fit app on Whop. A client id is public by design. */
const CLIENT_ID = process.env.EXPO_PUBLIC_WHOP_CLIENT_ID ?? 'app_rj4GAiFKxG1sTm';
const API = 'https://api.whop.com';
const REDIRECT = 'fitscanner://auth';
/** Sign-in asks for profile plus reading and posting in Whop forums, so rooms run on Whop as the person themselves. */
export const SCOPES = 'openid profile forum:read forum:post:create';
const STORE_KEY = 'fit.whop';

/**
 * Together runs on the shared backend once its functions are deployed there (convex/members.ts, convex/together.ts).
 * Set EXPO_PUBLIC_TOGETHER_LIVE=1 after deploying; until then rooms run as a local preview.
 */
export const TOGETHER_LIVE = HAS_BACKEND && process.env.EXPO_PUBLIC_TOGETHER_LIVE === '1';

export type WhopAccount = {
  userId: string;
  username: string;
  name: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  /** Our backend's session for this account (live mode only). */
  session?: string;
  /** What this sign-in was allowed to do; older sign-ins without chat sign in again. */
  scopes?: string;
};

type State = { ready: boolean; account: WhopAccount | null };

let state: State = { ready: false, account: null };
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};

let loading: Promise<void> | null = null;
function load() {
  loading ??= SecureStore.getItemAsync(STORE_KEY)
    .then((raw) => {
      const saved = raw ? (JSON.parse(raw) as WhopAccount) : null;
      // In live mode an account needs our server's session; one saved before then signs in again.
      set({ ready: true, account: saved && saved.scopes === SCOPES && (!TOGETHER_LIVE || saved.session) ? saved : null });
    })
    .catch(() => set({ ready: true, account: null }));
  return loading;
}

function subscribe(l: () => void) {
  listeners.add(l);
  void load();
  return () => listeners.delete(l);
}

/** The signed-in account, outside React. */
export function currentAccount(): WhopAccount | null {
  return state.account;
}

/** The backend session of the signed-in account, for live calls. */
export function currentSession(): string | undefined {
  return state.account?.session;
}

export function useWhopAccount(): State {
  return useSyncExternalStore(subscribe, () => state);
}

const base64url = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function randomString(bytes = 32): string {
  const r = Crypto.getRandomBytes(bytes);
  let bin = '';
  for (const b of r) bin += String.fromCharCode(b);
  return base64url(btoa(bin));
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error_description?: string }).error_description ?? `Whop said ${res.status}`);
  return body as T;
}

export type SignInResult = { ok: true } | { ok: false; cancelled: boolean; message?: string };

export async function signInWithWhop(): Promise<SignInResult> {
  try {
    const verifier = randomString(48);
    const challenge = base64url(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 }));
    const st = randomString(16);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT,
      scope: SCOPES,
      state: st,
      nonce: randomString(16),
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    const result = await WebBrowser.openAuthSessionAsync(`${API}/oauth/authorize?${params}`, REDIRECT);
    if (result.type !== 'success') return { ok: false, cancelled: true };

    const back = { searchParams: new URLSearchParams(result.url.split('?')[1]?.split('#')[0] ?? '') };
    if (back.searchParams.get('state') !== st) return { ok: false, cancelled: false, message: 'Sign-in did not match. Try again.' };
    const error = back.searchParams.get('error_description') ?? back.searchParams.get('error');
    if (error) return { ok: false, cancelled: false, message: error };
    const code = back.searchParams.get('code');
    if (!code) return { ok: false, cancelled: false, message: 'Whop did not send a sign-in code.' };

    const token = await json<{ access_token: string; refresh_token?: string; expires_in?: number }>(
      await fetch(`${API}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: CLIENT_ID, code_verifier: verifier }),
      }),
    );
    const me = await json<{ sub: string; preferred_username?: string; name?: string; picture?: string }>(
      await fetch(`${API}/oauth/userinfo`, { headers: { Authorization: `Bearer ${token.access_token}` } }),
    );
    let session: string | undefined;
    if (TOGETHER_LIVE && convex) {
      // Our server asks Whop who this token belongs to, so nobody can post as someone else.
      const deviceId = (await SecureStore.getItemAsync('fit.deviceId').catch(() => null)) ?? 'unknown';
      session = (await convex.action(api.members.signIn, { deviceId, accessToken: token.access_token })).session;
      // Lead with the rooms your conditions match: signing in places you there (any room can be left).
      await convex.mutation(api.together.setAutoPlace, { session, on: true, skip: [] }).catch(() => {});
    }
    const account: WhopAccount = {
      userId: me.sub,
      username: me.preferred_username ?? me.sub,
      name: me.name || me.preferred_username || 'You',
      avatarUrl: me.picture || undefined,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
      session,
      scopes: SCOPES,
    };
    await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(account)).catch(() => {});
    set({ ready: true, account });
    return { ok: true };
  } catch (e) {
    return { ok: false, cancelled: false, message: e instanceof Error ? e.message : 'Could not reach Whop.' };
  }
}

let refreshing: Promise<string | null> | null = null;

/**
 * A current Whop access token for the signed-in person, refreshed when it is about to expire (refresh tokens rotate,
 * so the new one is saved each time). Null when signed out or when Whop no longer accepts the sign-in.
 */
export async function whopAccessToken(): Promise<string | null> {
  const account = state.account;
  if (!account) return null;
  if (account.expiresAt - 60_000 > Date.now()) return account.accessToken;
  if (!account.refreshToken) return null;
  refreshing ??= (async () => {
    try {
      const token = await json<{ access_token: string; refresh_token?: string; expires_in?: number }>(
        await fetch(`${API}/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: account.refreshToken, client_id: CLIENT_ID }),
        }),
      );
      const next: WhopAccount = {
        ...account,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? account.refreshToken,
        expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
      };
      await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(next)).catch(() => {});
      set({ account: next });
      return next.accessToken;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function signOutOfWhop() {
  const account = state.account;
  set({ account: null });
  await SecureStore.deleteItemAsync(STORE_KEY).catch(() => {});
  if (account?.session && TOGETHER_LIVE && convex) convex.mutation(api.members.signOut, { session: account.session }).catch(() => {});
  if (account?.refreshToken) {
    fetch(`${API}/oauth/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: account.refreshToken, client_id: CLIENT_ID }),
    }).catch(() => {});
  }
}
