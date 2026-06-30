import { ANIMATIONS, Animation } from "./clippy-animations";

export const ANIMATION_KEYS = Object.keys(ANIMATIONS);
export const ANIMATION_KEYS_BRACKETS = ANIMATION_KEYS.map((k) => `[${k}]`);
export const IDLE_ANIMATION_KEYS = ANIMATION_KEYS.filter((k) =>
  k.startsWith("Idle"),
);

const ANIMATION_DESCRIPTIONS: Record<string, string> = {
  Alert: "Hearing/listening reaction; despite the name, this is not a strong warning animation.",
  CheckingSomething: "Checks, inspects, or looks something over.",
  Congratulate: "Celebrates or congratulates.",
  Default: "Neutral/default pose.",
  EmptyTrash: "Throws away, clears, removes, deletes, or discards something.",
  Explain: "Explains with a talking or presenting motion.",
  GestureDown: "Gestures downward.",
  GestureLeft: "Gestures toward the left; use when pointing attention leftward.",
  GestureRight: "Gestures toward the right; use when pointing attention rightward.",
  GestureUp: "Gestures upward.",
  GetArtsy: "Creative or artistic flourish.",
  GetAttention: "Gets attention or emphasizes something important.",
  GetTechy: "Technical, computer-ish, or engineering-oriented action.",
  GetWizardy: "Sure/affirmative flourish; use for confident confirmation or a little showmanship.",
  GoodBye: "Goodbye or exit gesture.",
  Greeting: "Greeting or hello.",
  "Hearing 1": "Hearing/listening animation.",
  Hide: "Hides or disappears.",
  "Idle1 1": "Basic idle pose.",
  IdleAtom: "Atom/science/electronics-flavored idle.",
  IdleEyeBrowRaise: "Eyebrow raise, skepticism, dry reaction, or mild disbelief.",
  IdleFingerTap: "Finger tapping, waiting, impatience, or a gentle nudge.",
  IdleHeadScratch: "Confused, uncertain, or thinking through a weird situation.",
  IdleRopePile: "Tangled rope; messy, complicated, over-engineered, or chaotic situation.",
  IdleSideToSide: "Side-to-side idle movement.",
  IdleSnooze: "Sleeping, snoozing, tired, idle, or low-energy moment.",
  LookDown: "Looks down, then up.",
  LookDownLeft: "Looks down and to the left.",
  LookDownRight: "Looks down and to the right.",
  LookLeft: "Looks toward the left.",
  LookRight: "Looks toward the right.",
  LookUp: "Looks upward.",
  LookUpLeft: "Looks up and to the left.",
  LookUpRight: "Looks up and to the right.",
  Print: "Printing or producing finished output.",
  Processing: "Processing, working, or handling a task.",
  RestPose: "Neutral resting pose.",
  Save: "Saving, preserving, storing, or applying settings.",
  Searching: "Searching, looking something up, investigating, or finding information.",
  SendMail: "Sending mail, messages, posts, announcements, or shared text.",
  Show: "Shows, reveals, opens, presents, or demonstrates something.",
  Thinking: "Thinking, reasoning, comparing, or considering options.",
  Wave: "Alert-like attention motion; despite the name, this is not a friendly wave.",
  Writing: "Writing, drafting, composing, or editing text.",
};

export const ANIMATION_PROMPT_CONTEXT = ANIMATION_KEYS.map((key) => {
  const description = ANIMATION_DESCRIPTIONS[key] || "Available Clippy animation.";

  return `[${key}] - ${description}`;
}).join("\n");

export const EMPTY_ANIMATION: Animation = {
  src: `data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==`,
  length: 0,
};

/**
 * Get a random animation from the given keys'
 *
 * @param keys - The keys of the animations to choose from
 * @param current - The current animation
 * @returns A random animation from the given keys
 */
export function getRandomAnimation(keys: string[], current?: Animation) {
  const randomIndex = Math.floor(Math.random() * keys.length);
  const randomAnimationKey = keys[randomIndex] as keyof typeof ANIMATIONS;
  const animation = ANIMATIONS[randomAnimationKey];

  // If the random animation is the same as the current animation, get a new random animation
  if (current && animation === current) {
    return getRandomAnimation(keys, current);
  }

  return animation;
}

/**
 * Get a random idle animation
 *
 * @param current - The current animation
 * @returns A random idle animation
 */
export function getRandomIdleAnimation(current?: Animation) {
  return getRandomAnimation(IDLE_ANIMATION_KEYS, current);
}
