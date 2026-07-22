export interface ParsedCurl {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** Parse a cURL command string into method, url, headers, and body. */
export function parseCurl(curlString: string): ParsedCurl {
  const result: ParsedCurl = {
    method: 'GET',
    url: '',
    headers: {},
    body: '',
  };

  if (!curlString || !curlString.trim()) return result;

  // Clean multiline escapes and extra spaces
  const cleanStr = curlString
    .replace(/\\\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Basic regex tokenizer preserving quotes
  const args: string[] = [];
  const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(cleanStr)) !== null) {
    if (match[1] !== undefined) {
      args.push(match[1].replace(/\\"/g, '"'));
    } else if (match[2] !== undefined) {
      args.push(match[2].replace(/\\'/g, "'"));
    } else if (match[3] !== undefined) {
      args.push(match[3]);
    }
  }

  let i = 0;
  // Skip leading 'curl' if present
  if (args[0] === 'curl') i = 1;

  let bodySetByFlag = false;

  while (i < args.length) {
    const arg = args[i];

    // Method flag
    if (arg === '-X' || arg === '--request') {
      if (i + 1 < args.length) {
        result.method = args[i + 1].toUpperCase();
        i += 2;
        continue;
      }
    }

    // Header flag
    if (arg === '-H' || arg === '--header') {
      if (i + 1 < args.length) {
        const headerStr = args[i + 1];
        const idx = headerStr.indexOf(':');
        if (idx > 0) {
          const key = headerStr.slice(0, idx).trim();
          const val = headerStr.slice(idx + 1).trim();
          result.headers[key] = val;
        }
        i += 2;
        continue;
      }
    }

    // Data / Body flags
    if (
      arg === '-d' ||
      arg === '--data' ||
      arg === '--data-raw' ||
      arg === '--data-binary' ||
      arg === '--data-ascii'
    ) {
      if (i + 1 < args.length) {
        result.body = args[i + 1];
        bodySetByFlag = true;
        if (result.method === 'GET') {
          result.method = 'POST';
        }
        i += 2;
        continue;
      }
    }

    // URL handling
    if (!arg.startsWith('-') && !result.url) {
      if (arg.startsWith('http://') || arg.startsWith('https://') || arg.includes('.')) {
        result.url = arg.startsWith('http') ? arg : `https://${arg}`;
      }
    }

    i++;
  }

  return result;
}

/** Export HTTP request config into a formatted cURL command. */
export function generateCurl(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string
): string {
  const parts: string[] = ['curl'];

  if (method && method.toUpperCase() !== 'GET') {
    parts.push(`-X ${method.toUpperCase()}`);
  }

  if (url) {
    parts.push(`"${url}"`);
  }

  for (const [key, val] of Object.entries(headers)) {
    if (key && val) {
      parts.push(`-H "${key}: ${val}"`);
    }
  }

  if (body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
    const cleanBody = body.replace(/"/g, '\\"');
    parts.push(`-d "${cleanBody}"`);
  }

  return parts.join(' \\\n  ');
}
