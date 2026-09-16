import { describe, it, expect } from "vitest";
import { can, canViewAmounts, canEditDepartment, assertCan, PermissionError, type Actor } from "@/lib/permissions";

const owner: Actor = { id: "u-owner", role: "OWNER", department: null };
const office: Actor = { id: "u-office", role: "OFFICE", department: null };
const schedCleaning: Actor = { id: "u-sched-c", role: "SCHEDULER", department: "CLEANING" };
const schedAll: Actor = { id: "u-sched-all", role: "SCHEDULER", department: null };
const staff: Actor = { id: "u-staff", role: "STAFF", department: "CLEANING" };

describe("permissions: amounts", () => {
  it("only OWNER/OFFICE can view amounts", () => {
    expect(canViewAmounts(owner)).toBe(true);
    expect(canViewAmounts(office)).toBe(true);
    expect(canViewAmounts(schedCleaning)).toBe(false);
    expect(canViewAmounts(staff)).toBe(false);
    expect(can(schedCleaning, "amount.view")).toBe(false);
  });
});

describe("permissions: department scope", () => {
  it("SCHEDULER edits only own department", () => {
    expect(canEditDepartment(schedCleaning, "CLEANING")).toBe(true);
    expect(canEditDepartment(schedCleaning, "CONSTRUCTION")).toBe(false);
    expect(canEditDepartment(schedAll, "CONSTRUCTION")).toBe(true);
    expect(can(schedCleaning, "occurrence.move", { department: "CONSTRUCTION" })).toBe(false);
    expect(can(schedCleaning, "occurrence.move", { department: "CLEANING" })).toBe(true);
  });
  it("OFFICE/OWNER edit any department", () => {
    expect(can(office, "occurrence.move", { department: "CONSTRUCTION" })).toBe(true);
    expect(can(owner, "job.manage", { department: "CLEANING" })).toBe(true);
  });
});

describe("permissions: staff", () => {
  it("STAFF can view but not edit", () => {
    expect(can(staff, "occurrence.view")).toBe(true);
    expect(can(staff, "occurrence.create", { department: "CLEANING" })).toBe(false);
    expect(can(staff, "customer.manage")).toBe(false);
  });
  it("STAFF can mark own occurrence DONE only", () => {
    expect(can(staff, "occurrence.status", { department: "CLEANING", assigneeIds: ["u-staff"], nextStatus: "DONE" })).toBe(true);
    expect(can(staff, "occurrence.status", { department: "CLEANING", assigneeIds: ["u-staff"], nextStatus: "CONFIRMED" })).toBe(false);
    expect(can(staff, "occurrence.status", { department: "CLEANING", assigneeIds: ["other"], nextStatus: "DONE" })).toBe(false);
  });
});

describe("permissions: management", () => {
  it("import/worker/partner/vehicle/settings are OWNER/OFFICE only", () => {
    for (const action of ["customer.import", "worker.manage", "partner.manage", "vehicle.manage", "settings.manage"] as const) {
      expect(can(owner, action)).toBe(true);
      expect(can(office, action)).toBe(true);
      expect(can(schedAll, action)).toBe(false);
      expect(can(staff, action)).toBe(false);
    }
  });
  it("assertCan throws PermissionError", () => {
    expect(() => assertCan(staff, "worker.manage")).toThrow(PermissionError);
    expect(() => assertCan(owner, "worker.manage")).not.toThrow();
  });
});
