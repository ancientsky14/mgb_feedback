// A per-tab draft, so a reload or a dropped connection does not lose answers. sessionStorage
// can be unavailable (private mode, blocked storage): every access is guarded and the form
// works without it.

const key = (servicePoint: string) => `csm-draft:${servicePoint}`;

export function loadDraft<T>(servicePoint: string): T | null {
  try {
    const raw = sessionStorage.getItem(key(servicePoint));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveDraft(servicePoint: string, value: unknown): void {
  try {
    sessionStorage.setItem(key(servicePoint), JSON.stringify(value));
  } catch {
    // storage full or blocked: the form still works, just without a draft
  }
}

export function clearDraft(servicePoint: string): void {
  try {
    sessionStorage.removeItem(key(servicePoint));
  } catch {
    // nothing to clear
  }
}
