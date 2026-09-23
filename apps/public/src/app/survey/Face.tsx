// The five faces of the ARTA form's Likert scale, from Strongly Disagree to Strongly Agree.
// Decorative: every choice also carries its text label, so meaning never rests on the picture.

const MOUTHS: Record<number, string> = {
  1: "M8 17.5c1.2-2.2 6.8-2.2 8 0",
  2: "M8.5 16.5c1.2-1.2 5.8-1.2 7 0",
  3: "M8.5 15.5h7",
  4: "M8.5 14.5c1.2 1.4 5.8 1.4 7 0",
  5: "M7.5 13.5c1 3.4 8 3.4 9 0z",
};

export function Face({ value }: { value: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
      {value === 1 && <path d="M7.5 8.2l2.3 1M16.5 8.2l-2.3 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />}
      <circle cx="9" cy="10.5" r="1.2" fill="currentColor" />
      <circle cx="15" cy="10.5" r="1.2" fill="currentColor" />
      <path
        d={MOUTHS[value]}
        fill={value === 5 ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
