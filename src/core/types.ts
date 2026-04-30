export type JsonPath = (string | number)[];

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [k: string]: JsonValue };

export interface ParseError {
  message: string;
  path: JsonPath;
  offset: number;
  length: number;
  line: number;
  column: number;
  severity: 'error' | 'warning';
}

export interface ParseResult {
  text: string;
  value: JsonValue | undefined;
  errors: ParseError[];
  byteSize: number;
}

export type Patch =
  | { op: 'replace'; path: JsonPath; value: JsonValue }
  | { op: 'add'; path: JsonPath; value: JsonValue }
  | { op: 'remove'; path: JsonPath }
  | { op: 'move'; from: JsonPath; path: JsonPath }
  | { op: 'renameKey'; path: JsonPath; from: string; to: string }
  | { op: 'replaceText'; text: string };

export interface DocSnapshot {
  text: string;
  parse: ParseResult;
  dirty: boolean;
  name: string;
}
