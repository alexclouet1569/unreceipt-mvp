import type { Namespace } from "../types";

// Filled in as the receipt screens are translated.
const en = {};
const fr = {};
const sv = {};

const receipt: Namespace<typeof en> = { en, fr, sv };
export default receipt;
