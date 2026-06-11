import assert from "node:assert";
import { groupCharsToWords } from "./classroomAudio";

// "Hi there" → two words with first/last non-space char times
const align = {
  characters:                     ["H","i"," ","t","h","e","r","e"],
  character_start_times_seconds:  [0.0,0.1,0.2,0.3,0.4,0.5,0.6,0.7],
  character_end_times_seconds:    [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8],
};

const words = groupCharsToWords(align);
assert.deepStrictEqual(words, [
  { text: "Hi",    start: 0.0, end: 0.2 },
  { text: "there", start: 0.3, end: 0.8 },
]);

// trailing/leading spaces and double spaces collapse, no empty words
const align2 = {
  characters:                    [" ","a"," "," ","b"," "],
  character_start_times_seconds: [0.0,0.1,0.2,0.3,0.4,0.5],
  character_end_times_seconds:   [0.1,0.2,0.3,0.4,0.5,0.6],
};
const words2 = groupCharsToWords(align2);
assert.deepStrictEqual(words2, [
  { text: "a", start: 0.1, end: 0.2 },
  { text: "b", start: 0.4, end: 0.5 },
]);

console.log("groupCharsToWords: PASS");
