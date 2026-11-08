import "server-only";
import { cookies } from "next/headers";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "./auth";

/** ログインの Cookie を発行する（ログイン時と、自分のパスワードを変えたときにこの端末だけログインを続けるため） */
export async function issueSessionCookie(user: { id: string; role: string; name: string; sessionVersion: number }): Promise<void> {
  const token = await signSession({ sub: user.id, role: user.role, name: user.name, ver: user.sessionVersion });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}
