import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { SESSION_COOKIE, verifySession } from "./auth";
import { can, type Action, type Actor, type Resource } from "./permissions";

export type CurrentUser = Actor & {
  name: string;
  email: string | null;
  kind: string;
  avatarColor: string;
  avatarUrl: string | null; // 画像があれば /api/avatars/{id}?v=... （base64 は返さない）
};

export function avatarUrlFor(user: { id: string; updatedAt: Date; avatarImage?: string | null }): string | null {
  if (!user.avatarImage) return null;
  return `/api/avatars/${user.id}?v=${user.updatedAt.getTime()}`;
}

// リクエスト単位でキャッシュ（同一レンダリング中の重複クエリを防ぐ）
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySession(token);
  if (!payload) return null;

  const user = await db.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      kind: true,
      department: true,
      avatarColor: true,
      avatarImage: true,
      active: true,
      canLogin: true,
      updatedAt: true,
    },
  });
  if (!user || !user.active || !user.canLogin) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    kind: user.kind,
    department: user.department,
    avatarColor: user.avatarColor,
    avatarUrl: avatarUrlFor(user),
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** 権限が無ければホームへ戻す（ページ用） */
export async function requireCan(action: Action, resource?: Resource): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, action, resource)) redirect("/");
  return user;
}

export async function requireRole(...roles: string[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/");
  return user;
}
