/** Strict JSON field readers — grpc-gateway protojson uses camelCase. */

export function requireJsonString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`Invalid response: missing ${key}`);
  }
  return v;
}

export function optionalJsonString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function optionalJsonStringOrEmpty(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') {
    throw new Error(`Invalid response: bad ${key}`);
  }
  return v;
}

export function optionalJsonNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`Invalid response: bad ${key}`);
  }
  return v;
}

export function requireJsonNumber(obj: Record<string, unknown>, key: string): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`Invalid response: missing ${key}`);
  }
  return v;
}

/** Proto3 JSON may omit `false`; treat only explicit `true` as true. */
export function jsonBoolTrue(obj: Record<string, unknown>, key: string): boolean {
  return obj[key] === true;
}

export function requireJsonBoolean(obj: Record<string, unknown>, key: string): boolean {
  const v = obj[key];
  if (typeof v !== 'boolean') {
    throw new Error(`Invalid response: missing ${key}`);
  }
  return v;
}

export function requireJsonObject(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = obj[key];
  if (!v || typeof v !== 'object') {
    throw new Error(`Invalid response: missing ${key}`);
  }
  return v as Record<string, unknown>;
}

export function parseJsonDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !value) {
    throw new Error(`Invalid response: missing ${field}`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid response: bad ${field}`);
  }
  return d;
}

export function optionalJsonDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new Error('Invalid response: bad date');
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid response: bad date');
  }
  return d;
}
