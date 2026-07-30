export const ADMIN_USERNAME = "admin";
export const ADMIN_DEFAULT_PASSWORD = "ADMIN123";
export const DELIVERY_DEFAULT_PASSWORD = "delivery123";

export function yardUsername(yardId) {
  return yardId;
}

export function deliveryUsername(branchId) {
  return branchId;
}

export function defaultPasswordForRole(role, yardCode) {
  if (role === "admin") return ADMIN_DEFAULT_PASSWORD;
  if (role === "delivery_incharge") return DELIVERY_DEFAULT_PASSWORD;
  return yardCode || "";
}

export function buildDefaultCredentials(yards = [], branches = []) {
  const rows = [
    {
      username: ADMIN_USERNAME,
      password: ADMIN_DEFAULT_PASSWORD,
      role: "admin",
      yardId: null,
      branchId: null,
      yardName: "System Administrator",
      yardCode: null,
      isDefault: true,
    },
    ...yards.map((y) => ({
      username: yardUsername(y.id),
      password: defaultPasswordForRole("yard", y.code),
      role: "yard",
      yardId: y.id,
      branchId: null,
      yardName: y.name,
      yardCode: y.code,
      isDefault: true,
    })),
    ...branches.map((b) => ({
      username: deliveryUsername(b.id),
      password: DELIVERY_DEFAULT_PASSWORD,
      role: "delivery_incharge",
      yardId: null,
      branchId: b.id,
      yardName: b.name,
      yardCode: null,
      isDefault: true,
    })),
  ];
  return rows;
}
