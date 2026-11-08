import { SignJWT, jwtVerify } from "jose";

// セッショントークン（JWT）の署名・検証。
// jose は Edge ランタイム対応のため middleware からも利用できる。

export const SESSION_COOKIE = "shinkawa_session";
const ALG = "HS256";
const MAX_AGE = 60 * 60 * 24 * 30; // 30日

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET が未設定です（.env を確認してください）");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  sub: string; // userId
  role: string;
  name: string;
  /** ログインの世代（User.sessionVersion）。この値の入っていない以前のログインは 0 として扱う */
  ver: number;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT({ role: payload.role, name: payload.name, ver: payload.ver })
    .setProtectedHeader({ alg: ALG })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub) return null;
    return {
      sub: payload.sub as string,
      role: (payload.role as string) ?? "STAFF",
      name: (payload.name as string) ?? "",
      ver: typeof payload.ver === "number" ? payload.ver : 0,
    };
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = MAX_AGE;
