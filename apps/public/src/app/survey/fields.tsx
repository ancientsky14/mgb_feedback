import { useEffect, useRef, type ReactNode } from "react";
import { Face } from "./Face";

export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-2 text-sm font-medium text-red-800">
      {message}
    </p>
  );
}

interface ChoiceOption<T> {
  value: T;
  label: ReactNode;
}

/** A radio group built on native inputs, so screen readers, keyboards and switch access all work. */
export function ChoiceGroup<T extends string | number>(props: {
  name: string;
  legend: ReactNode;
  options: readonly ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string | undefined;
  hint?: ReactNode;
}) {
  const errorId = `${props.name}-error`;
  return (
    <fieldset className="mt-6" id={props.name} aria-describedby={props.error ? errorId : undefined}>
      <legend className="text-base font-semibold text-slate-900">{props.legend}</legend>
      {props.hint && <p className="mt-1 text-sm text-slate-600">{props.hint}</p>}
      <div className="mt-3 grid gap-2">
        {props.options.map((option) => (
          <label key={String(option.value)} className="block cursor-pointer">
            <input
              type="radio"
              name={props.name}
              value={String(option.value)}
              checked={props.value === option.value}
              onChange={() => props.onChange(option.value)}
              className="peer sr-only"
            />
            <span className="flex min-h-12 items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-800 peer-checked:border-emerald-700 peer-checked:bg-emerald-50 peer-checked:font-medium peer-checked:text-emerald-900 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan-700">
              <span
                aria-hidden="true"
                className={`h-5 w-5 shrink-0 rounded-full ${
                  props.value === option.value ? "border-[6px] border-emerald-700" : "border-2 border-slate-400"
                }`}
              />
              <span>{option.label}</span>
            </span>
          </label>
        ))}
      </div>
      <FieldError id={errorId} message={props.error} />
    </fieldset>
  );
}

const SCALE_VALUES = [1, 2, 3, 4, 5] as const;

/** One SQD statement: five faces with their text labels, plus N/A. */
export function LikertItem(props: {
  name: string;
  number: number;
  text: string;
  hint?: string | undefined;
  labels: Record<1 | 2 | 3 | 4 | 5, string>;
  naLabel: string;
  value: number | undefined;
  onChange: (value: number) => void;
  error?: string | undefined;
}) {
  const errorId = `${props.name}-error`;
  const option = (value: number, content: ReactNode, label: string) => (
    <label key={value} className="block cursor-pointer" title={label}>
      <input
        type="radio"
        name={props.name}
        value={value}
        checked={props.value === value}
        onChange={() => props.onChange(value)}
        className="peer sr-only"
        aria-label={label}
      />
      <span className="flex h-full min-h-20 flex-col items-center justify-start gap-1 rounded-lg border border-slate-300 bg-white px-1 py-2 text-center text-slate-700 peer-checked:border-emerald-700 peer-checked:bg-emerald-700 peer-checked:text-white peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan-700">
        {content}
        <span className="text-[11px] leading-tight">{label}</span>
      </span>
    </label>
  );
  return (
    <fieldset
      id={props.name}
      className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      aria-describedby={props.error ? errorId : undefined}
    >
      <legend className="sr-only">
        SQD{props.number}. {props.text}
      </legend>
      <p aria-hidden="true" className="font-medium text-slate-900">
        <span className="mr-1 text-slate-500">SQD{props.number}.</span>
        {props.text}
      </p>
      {props.hint && <p className="mt-1 text-sm text-slate-600">{props.hint}</p>}
      <div className="mt-3 grid grid-cols-6 gap-1.5">
        {SCALE_VALUES.map((v) => option(v, <Face value={v} />, props.labels[v]))}
        {option(0, <span className="flex h-8 items-center text-sm font-semibold" aria-hidden="true">N/A</span>, props.naLabel)}
      </div>
      <FieldError id={errorId} message={props.error} />
    </fieldset>
  );
}

/** Lists a step's problems at the top, each linked to its field, and is announced when it appears. */
export function ErrorSummary({ errors }: { errors: Record<string, string> }) {
  const entries = Object.entries(errors);
  const box = useRef<HTMLDivElement>(null);
  const signature = Object.keys(errors).join(",");
  // Focus moves to the summary each time a step fails, so keyboard users land on the list of problems.
  useEffect(() => {
    if (signature) box.current?.focus();
  }, [signature]);
  if (entries.length === 0) return null;
  return (
    <div ref={box} tabIndex={-1} role="alert" className="mt-4 rounded-lg border-2 border-red-700 bg-red-50 p-4">
      <p className="font-semibold text-red-900">Please check {entries.length === 1 ? "this answer" : "these answers"}:</p>
      <ul className="mt-2 list-disc pl-5 text-sm text-red-900">
        {entries.map(([field, message]) => (
          <li key={field}>
            <a href={`#${field}`} className="underline">
              {message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
