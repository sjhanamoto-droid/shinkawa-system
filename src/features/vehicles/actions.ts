"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertCan, PermissionError } from "@/lib/permissions";
import { DEPARTMENT_OPTIONS, DEFAULT_AVATAR_COLOR } from "@/lib/constants";

export type VehicleFormState = { error?: string };

function nz(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}
function forbidden(e: unknown): VehicleFormState | null {
  return e instanceof PermissionError ? { error: e.message } : null;
}

const schema = z.object({
  name: z.string().trim().min(1, "車両名を入力してください").max(50),
  plateNumber: z.string().trim().max(50).nullable(),
  vehicleType: z.string().trim().max(50).nullable(),
  department: z.enum(DEPARTMENT_OPTIONS).nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "色の形式が正しくありません"),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  memo: z.string().trim().max(2000).nullable(),
});

function parse(formData: FormData) {
  const dept = nz(formData.get("department"));
  return schema.safeParse({
    name: formData.get("name") ?? "",
    plateNumber: nz(formData.get("plateNumber")),
    vehicleType: nz(formData.get("vehicleType")),
    department: dept === "CLEANING" || dept === "CONSTRUCTION" ? dept : null,
    color: nz(formData.get("color")) ?? DEFAULT_AVATAR_COLOR,
    sortOrder: nz(formData.get("sortOrder")) ?? 0,
    memo: nz(formData.get("memo")),
  });
}

function revalidate(id?: string) {
  revalidatePath("/vehicles");
  revalidatePath("/schedule");
  revalidatePath("/jobs");
  if (id) revalidatePath(`/vehicles/${id}/edit`);
}

export async function createVehicle(_prev: VehicleFormState, formData: FormData): Promise<VehicleFormState> {
  const me = await requireUser();
  try {
    assertCan(me, "vehicle.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラー" };
  }
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };
  await db.vehicle.create({ data: parsed.data, select: { id: true } });
  revalidate();
  redirect(`/vehicles?toast=${encodeURIComponent("保存しました")}`);
}

export async function updateVehicle(_prev: VehicleFormState, formData: FormData): Promise<VehicleFormState> {
  const me = await requireUser();
  try {
    assertCan(me, "vehicle.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラー" };
  }
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "車両が見つかりません" };
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };
  await db.vehicle.update({ where: { id }, data: parsed.data });
  revalidate(id);
  redirect(`/vehicles?toast=${encodeURIComponent("保存しました")}`);
}

export async function toggleVehicleActive(id: string): Promise<VehicleFormState> {
  const me = await requireUser();
  try {
    assertCan(me, "vehicle.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラー" };
  }
  const v = await db.vehicle.findUnique({ where: { id }, select: { active: true } });
  if (!v) return { error: "車両が見つかりません" };
  await db.vehicle.update({ where: { id }, data: { active: !v.active } });
  revalidate(id);
  return {};
}

export async function deleteVehicle(id: string): Promise<VehicleFormState | void> {
  const me = await requireUser();
  try {
    assertCan(me, "vehicle.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラー" };
  }
  const [used, jobs] = await Promise.all([
    db.occurrenceVehicle.count({ where: { vehicleId: id } }),
    db.job.count({ where: { vehicleId: id } }),
  ]);
  if (used > 0 || jobs > 0) {
    return { error: `予定 ${used} 件・案件 ${jobs} 件で使われているため削除できません。使わなくなった車両は「無効化」してください` };
  }
  await db.vehicle.delete({ where: { id } });
  revalidate();
  redirect(`/vehicles?toast=${encodeURIComponent("削除しました")}`);
}
