/** Current local settings. Storage paths and snapshot formats are not migrated here. */
export function localStudioConfig(environment: Readonly<Record<string, string | undefined>>) {
  return {
    profilePath: environment.LOREKIND_STUDIO_PROFILE,
    dataRoot: environment.LOREKIND_STUDIO_DATA,
  };
}
