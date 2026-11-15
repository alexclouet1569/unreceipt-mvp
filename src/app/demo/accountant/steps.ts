// How many steps the accountant tour has (the last is its end screen). A
// plain module, so the server page can read the number: a value imported
// from the "use client" tour would reach it as a client reference. A test
// checks it against the tour's own list.
export const ACCOUNTANT_STEP_COUNT = 5;
