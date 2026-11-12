// The app's API failure kinds. Plain TypeScript (no React Native), so the
// call logic that throws them is tested (auth-retry.ts).

export type ApiErrorKind = "unauthorized" | "offline" | "server";

export class ApiError extends Error {
  constructor(readonly kind: ApiErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "ApiError";
  }
}
