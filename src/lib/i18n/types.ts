/**
 * The shape every language must match: same keys as English, strings stay
 * strings, functions keep their parameters. A missing or extra key in
 * French or Swedish fails the typecheck.
 */
export type Translation<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends (...args: infer A) => infer R
      ? (...args: A) => R
      : Translation<T[K]>;
};

/** One namespace of messages in all three languages. */
export type Namespace<T> = { en: T; fr: Translation<T>; sv: Translation<T> };
