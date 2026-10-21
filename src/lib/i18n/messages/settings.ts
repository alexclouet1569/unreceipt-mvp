import type { Namespace } from "../types";

// Filled in as the settings screens are translated.
const en = {};
const fr = {};
const sv = {};

const settings: Namespace<typeof en> = { en, fr, sv };
export default settings;
