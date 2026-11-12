// "By date / By category", the website's two-option switch (DESIGN.md
// "Group and filter"): the same gliding thumb as Insights' period switch.

import { s } from "../i18n";
import { space } from "../theme";
import { Segmented } from "./insights/Segmented";

export type ListView = "date" | "category";

export function ViewToggle({ view, onChange }: { view: ListView; onChange: (v: ListView) => void }) {
  return (
    <Segmented
      label={s.summary.groupLabel}
      options={[
        { value: "date", label: s.summary.byDate },
        { value: "category", label: s.summary.byCategory },
      ]}
      value={view}
      onChange={(v) => {
        if (v !== view) onChange(v);
      }}
      style={{ marginTop: space.lg }}
    />
  );
}
