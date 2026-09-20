export const ROLES = [
  "owner",
  "manager",
  "reception",
  "housekeeping",
  "restaurant",
  "maintenance",
  "read_only"
] as const;

export type AppRole = (typeof ROLES)[number];
export type Capability =
  | "dashboard:view"
  | "staff:manage"
  | "settings:manage"
  | "operations:write"
  | "audit:view";

const permissions: Record<AppRole, ReadonlySet<Capability>> = {
  owner: new Set(["dashboard:view", "staff:manage", "settings:manage", "operations:write", "audit:view"]),
  manager: new Set(["dashboard:view", "operations:write", "audit:view"]),
  reception: new Set(["dashboard:view", "operations:write"]),
  housekeeping: new Set(["dashboard:view"]),
  restaurant: new Set(["dashboard:view"]),
  maintenance: new Set(["dashboard:view"]),
  read_only: new Set(["dashboard:view"])
};

export function can(role: AppRole, capability: Capability) {
  return permissions[role].has(capability);
}
