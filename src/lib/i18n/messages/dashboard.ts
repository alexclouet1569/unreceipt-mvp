import type { Namespace } from "../types";

// Filled in as the dashboard screens are translated.
const en = {};
const fr = {};
const sv = {};

const dashboard: Namespace<typeof en> = { en, fr, sv };
export default dashboard;
