/** Per-conversation tab key: header / ?s= parsing and sanitising. */
import assert from "node:assert/strict";
import { sessionOf } from "../lib/index.js";

const r = (url, headers = {}) => sessionOf({ url, headers });
assert.equal(r("/x"), "default");
assert.equal(r("/x", { "x-sidepanel-session": "abc-123_X" }), "abc-123_X");
assert.equal(r("/x?s=q1"), "q1");
assert.equal(r("/x?s=q1", { "x-sidepanel-session": "h1" }), "h1");
assert.equal(r("/x", { "x-sidepanel-session": "../etc" }), "default");
assert.equal(r("/x", { "x-sidepanel-session": "a".repeat(65) }), "default");
console.log("session-smoke ok");
