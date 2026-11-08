import type { MailLang } from "./ui-labels";

/** What every picture can draw: the user's own address, words and language. */
export type SceneProps = {
  lang: MailLang;
  address: string;
  filterQuery: string;
  words: readonly string[];
};

export type SceneFn = (p: SceneProps) => React.ReactNode;
