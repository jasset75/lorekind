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
