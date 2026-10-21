import type { Namespace } from "../types";

// Filled in as the auth screens are translated.
const en = {};
const fr = {};
const sv = {};

const auth: Namespace<typeof en> = { en, fr, sv };
export default auth;
