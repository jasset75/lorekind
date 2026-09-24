export const ApiErrorCode = {
  MediaType: "media-type",
  TooLarge: "too-large",
  PreconditionRequired: "precondition-required",
  InvalidPrecondition: "invalid-precondition",
  InvalidPath: "invalid-path",
  InternalError: "internal-error",
  NotFound: "not-found",
  UnsupportedQuery: "unsupported-query",
  MethodNotAllowed: "method-not-allowed",
  Unauthenticated: "unauthenticated",
  IdentityMismatch: "identity-mismatch",
  DiffUnavailable: "diff-unavailable",
  RequestOriginDenied: "request-origin-denied",
} as const;
export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];
