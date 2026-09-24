export const StudioMode = { Local: "studio", Api: "api" } as const;
export type StudioMode = (typeof StudioMode)[keyof typeof StudioMode];
