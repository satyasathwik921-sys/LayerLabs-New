export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

export type AdminSession = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_at?: number;
  user: { id: string; email?: string };
};

export class SupabaseError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "SupabaseError";
    this.status = status;
    this.code = code;
  }
}

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function storedAdminSession(): AdminSession | null {
  try {
    const value = sessionStorage.getItem("layerlabs_supabase_admin_session_v1");
    if (!value) return null;
    const session = JSON.parse(value) as AdminSession;
    if (!session.access_token || (session.expires_at && session.expires_at * 1000 <= Date.now())) return null;
    return session;
  } catch {
    return null;
  }
}

export function getAdminSession(): AdminSession | null {
  return storedAdminSession();
}

export function setAdminSession(session: AdminSession | null): void {
  try {
    if (session) sessionStorage.setItem("layerlabs_supabase_admin_session_v1", JSON.stringify(session));
    else sessionStorage.removeItem("layerlabs_supabase_admin_session_v1");
  } catch {
    // Private browsing can disable storage; the current page can still use its in-memory session.
  }
}

export async function supabaseRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string | null;
    prefer?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  if (!isSupabaseConfigured()) {
    throw new SupabaseError("The shared order system is not configured for this deployment.", 503, "SUPABASE_NOT_CONFIGURED");
  }

  const headers: Record<string, string> = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${options.token || SUPABASE_KEY}`,
    Accept: "application/json",
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.prefer) headers.Prefer = options.prefer;

  const response = await fetch(`${SUPABASE_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (!response.ok) {
    let message = `The shared service returned HTTP ${response.status}.`;
    let code: string | undefined;
    try {
      const payload = await response.json() as { message?: string; details?: string; hint?: string; code?: string };
      message = payload.message || message;
      code = payload.code;
    } catch {
      // Do not include arbitrary HTML/proxy error bodies in a customer-facing exception.
    }
    throw new SupabaseError(message, response.status, code);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

export async function loginAdmin(email: string, password: string): Promise<AdminSession> {
  const session = await supabaseRequest<AdminSession>("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email: email.trim().toLowerCase(), password },
  });

  if (!session?.access_token) throw new SupabaseError("Sign-in failed. Check your email and password.", 401, "AUTH_FAILED");

  let allowed = false;
  try {
    allowed = Boolean(await supabaseRequest<boolean>("/rest/v1/rpc/is_layerlabs_admin", {
      method: "POST",
      body: {},
      token: session.access_token,
    }));
  } catch {
    allowed = false;
  }

  if (!allowed) {
    try {
      await supabaseRequest("/auth/v1/logout", { method: "POST", token: session.access_token });
    } catch {
      // Expiring the token locally is still sufficient for this browser session.
    }
    throw new SupabaseError("This account is not on the LayerLabs administrator allowlist.", 403, "NOT_ADMIN");
  }

  setAdminSession(session);
  return session;
}

export async function logoutAdmin(): Promise<void> {
  const session = getAdminSession();
  setAdminSession(null);
  if (session?.access_token && isSupabaseConfigured()) {
    try {
      await supabaseRequest("/auth/v1/logout", { method: "POST", token: session.access_token });
    } catch {
      // The local session has already been cleared.
    }
  }
}
