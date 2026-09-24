/** Stable wire values shared by editorial clients and the application boundary. */
export const EditorialAction = {
  Save: "save",
  Submit: "submit",
  Approve: "approve",
  AuthorizeDirect: "authorize-direct",
  Publish: "publish",
  Dismiss: "dismiss",
  Restore: "restore",
} as const;
export type EditorialAction = (typeof EditorialAction)[keyof typeof EditorialAction];

/** Internal workflow and evaluation audit actions; not public client commands. */
export const InternalEditorialAction = {
  Create: "create",
  Revise: "revise",
  AppliedLocal: "applied-local",
} as const;
export type InternalEditorialAction =
  (typeof InternalEditorialAction)[keyof typeof InternalEditorialAction];
