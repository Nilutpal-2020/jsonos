import type { JsonValue } from './types';

export type TargetLang = 'typescript' | 'zod' | 'python' | 'rust' | 'go' | 'dart' | 'json-schema';

export interface TypeGenOptions {
  rootName?: string;
  target: TargetLang;
}

function toCamelCase(str: string): string {
  const p = toPascalCase(str);
  if (!p) return 'field';
  return p.charAt(0).toLowerCase() + p.slice(1);
}

function toPascalCase(str: string): string {
  if (!str) return 'Root';
  const clean = str.replace(/[^a-zA-Z0-9_]/g, ' ');
  return clean
    .split(/\s+|_/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .toLowerCase();
}

/** Infer TypeScript Interface code from JSON value. */
function generateTypeScript(val: JsonValue, rootName: string): string {
  const structs: { name: string; code: string }[] = [];

  function helper(v: JsonValue, name: string): string {
    if (v === null) return 'any';
    if (typeof v === 'boolean') return 'boolean';
    if (typeof v === 'number') return 'number';
    if (typeof v === 'string') return 'string';

    if (Array.isArray(v)) {
      if (v.length === 0) return 'any[]';
      const itemTypes = Array.from(new Set(v.map((item, idx) => helper(item, `${name}Item`))));
      if (itemTypes.length === 1) return `${itemTypes[0]}[]`;
      return `(${itemTypes.join(' | ')})[]`;
    }

    if (typeof v === 'object') {
      const fields: string[] = [];
      for (const [key, propVal] of Object.entries(v)) {
        const fieldName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
        const childName = `${name}${toPascalCase(key)}`;
        const typeStr = helper(propVal, childName);
        fields.push(`  ${fieldName}: ${typeStr};`);
      }

      const structCode = `export interface ${name} {\n${fields.join('\n')}\n}`;
      structs.push({ name, code: structCode });
      return name;
    }

    return 'any';
  }

  helper(val, rootName);
  return structs.map((s) => s.code).reverse().join('\n\n');
}

/** Infer Zod Schema code from JSON value. */
function generateZod(val: JsonValue, rootName: string): string {
  const schemas: { name: string; code: string }[] = [];

  function helper(v: JsonValue, name: string): string {
    if (v === null) return 'z.null()';
    if (typeof v === 'boolean') return 'z.boolean()';
    if (typeof v === 'number') return Number.isInteger(v) ? 'z.number().int()' : 'z.number()';
    if (typeof v === 'string') return 'z.string()';

    if (Array.isArray(v)) {
      if (v.length === 0) return 'z.array(z.unknown())';
      const itemTypes = Array.from(new Set(v.map((item, idx) => helper(item, `${name}Item`))));
      if (itemTypes.length === 1) return `z.array(${itemTypes[0]})`;
      return `z.array(z.union([${itemTypes.join(', ')}]))`;
    }

    if (typeof v === 'object') {
      const fields: string[] = [];
      for (const [key, propVal] of Object.entries(v)) {
        const fieldName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
        const childName = `${name}${toPascalCase(key)}`;
        const typeStr = helper(propVal, childName);
        fields.push(`  ${fieldName}: ${typeStr},`);
      }

      const schemaName = `${name}Schema`;
      const structCode = `export const ${schemaName} = z.object({\n${fields.join('\n')}\n});\nexport type ${name} = z.infer<typeof ${schemaName}>;`;
      schemas.push({ name: schemaName, code: structCode });
      return schemaName;
    }

    return 'z.unknown()';
  }

  helper(val, rootName);
  const header = `import { z } from 'zod';\n\n`;
  return header + schemas.map((s) => s.code).reverse().join('\n\n');
}

/** Infer Python Pydantic models from JSON value. */
function generatePython(val: JsonValue, rootName: string): string {
  const models: { name: string; code: string }[] = [];

  function helper(v: JsonValue, name: string): string {
    if (v === null) return 'Optional[Any]';
    if (typeof v === 'boolean') return 'bool';
    if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
    if (typeof v === 'string') return 'str';

    if (Array.isArray(v)) {
      if (v.length === 0) return 'List[Any]';
      const itemTypes = Array.from(new Set(v.map((item, idx) => helper(item, `${name}Item`))));
      if (itemTypes.length === 1) return `List[${itemTypes[0]}]`;
      return `List[Union[${itemTypes.join(', ')}]]`;
    }

    if (typeof v === 'object') {
      const fields: string[] = [];
      for (const [key, propVal] of Object.entries(v)) {
        const fieldName = toSnakeCase(key);
        const childName = `${name}${toPascalCase(key)}`;
        const typeStr = helper(propVal, childName);
        if (fieldName !== key) {
          fields.push(`    ${fieldName}: ${typeStr} = Field(alias="${key}")`);
        } else {
          fields.push(`    ${fieldName}: ${typeStr}`);
        }
      }

      const structCode = `class ${name}(BaseModel):\n${fields.join('\n') || '    pass'}`;
      models.push({ name, code: structCode });
      return name;
    }

    return 'Any';
  }

  helper(val, rootName);
  const header = `from typing import List, Optional, Any, Union\nfrom pydantic import BaseModel, Field\n\n`;
  return header + models.map((s) => s.code).reverse().join('\n\n');
}

/** Infer Rust Serde Structs from JSON value. */
function generateRust(val: JsonValue, rootName: string): string {
  const structs: { name: string; code: string }[] = [];

  function helper(v: JsonValue, name: string): string {
    if (v === null) return 'Option<serde_json::Value>';
    if (typeof v === 'boolean') return 'bool';
    if (typeof v === 'number') return Number.isInteger(v) ? 'i64' : 'f64';
    if (typeof v === 'string') return 'String';

    if (Array.isArray(v)) {
      if (v.length === 0) return 'Vec<serde_json::Value>';
      const itemTypes = Array.from(new Set(v.map((item, idx) => helper(item, `${name}Item`))));
      if (itemTypes.length === 1) return `Vec<${itemTypes[0]}>`;
      return 'Vec<serde_json::Value>';
    }

    if (typeof v === 'object') {
      const fields: string[] = [];
      for (const [key, propVal] of Object.entries(v)) {
        const fieldName = toSnakeCase(key);
        const childName = `${name}${toPascalCase(key)}`;
        const typeStr = helper(propVal, childName);
        if (fieldName !== key) {
          fields.push(`    #[serde(rename = "${key}")]`);
        }
        fields.push(`    pub ${fieldName}: ${typeStr},`);
      }

      const structCode = `#[derive(Debug, Serialize, Deserialize)]\npub struct ${name} {\n${fields.join('\n')}\n}`;
      structs.push({ name, code: structCode });
      return name;
    }

    return 'serde_json::Value';
  }

  helper(val, rootName);
  const header = `use serde::{Serialize, Deserialize};\n\n`;
  return header + structs.map((s) => s.code).reverse().join('\n\n');
}

/** Infer Go Structs from JSON value. */
function generateGo(val: JsonValue, rootName: string): string {
  const structs: { name: string; code: string }[] = [];

  function helper(v: JsonValue, name: string): string {
    if (v === null) return 'interface{}';
    if (typeof v === 'boolean') return 'bool';
    if (typeof v === 'number') return Number.isInteger(v) ? 'int64' : 'float64';
    if (typeof v === 'string') return 'string';

    if (Array.isArray(v)) {
      if (v.length === 0) return '[]interface{}';
      const itemTypes = Array.from(new Set(v.map((item, idx) => helper(item, `${name}Item`))));
      if (itemTypes.length === 1) return `[]${itemTypes[0]}`;
      return '[]interface{}';
    }

    if (typeof v === 'object') {
      const fields: string[] = [];
      for (const [key, propVal] of Object.entries(v)) {
        const fieldName = toPascalCase(key);
        const childName = `${name}${toPascalCase(key)}`;
        const typeStr = helper(propVal, childName);
        fields.push(`\t${fieldName} ${typeStr} \`json:"${key}"\``);
      }

      const structCode = `type ${name} struct {\n${fields.join('\n')}\n}`;
      structs.push({ name, code: structCode });
      return name;
    }

    return 'interface{}';
  }

  helper(val, rootName);
  return `package main\n\n` + structs.map((s) => s.code).reverse().join('\n\n');
}

/** Infer Dart model classes (with fromJson and toJson) from JSON value. */
function generateDart(val: JsonValue, rootName: string): string {
  const models: { name: string; code: string }[] = [];

  function helper(v: JsonValue, name: string): string {
    if (v === null) return 'dynamic';
    if (typeof v === 'boolean') return 'bool';
    if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'double';
    if (typeof v === 'string') return 'String';

    if (Array.isArray(v)) {
      if (v.length === 0) return 'List<dynamic>';
      const itemTypes = Array.from(new Set(v.map((item) => helper(item, `${name}Item`))));
      if (itemTypes.length === 1) return `List<${itemTypes[0]}>`;
      return 'List<dynamic>';
    }

    if (typeof v === 'object') {
      const className = toPascalCase(name);
      const fields: { key: string; name: string; type: string; isClass: boolean; isList: boolean }[] = [];

      for (const [key, propVal] of Object.entries(v)) {
        const fieldName = toCamelCase(key);
        const childName = `${className}${toPascalCase(key)}`;
        const typeStr = helper(propVal, childName);
        const isClass = typeof propVal === 'object' && propVal !== null && !Array.isArray(propVal);
        const isList = Array.isArray(propVal);

        fields.push({
          key,
          name: fieldName,
          type: typeStr,
          isClass,
          isList,
        });
      }

      const propsCode = fields.map((f) => `  final ${f.type}? ${f.name};`).join('\n');
      const constrParams = fields.map((f) => `    this.${f.name},`).join('\n');
      const constructorCode = fields.length > 0
        ? `  ${className}({\n${constrParams}\n  });`
        : `  ${className}();`;

      const fromJsonAssigns = fields.map((f) => {
        if (f.isClass) {
          return `      ${f.name}: json['${f.key}'] != null ? ${f.type}.fromJson(json['${f.key}'] as Map<String, dynamic>) : null,`;
        }
        if (f.isList && f.type.startsWith('List<') && !f.type.includes('dynamic')) {
          const itemType = f.type.slice(5, -1);
          const isItemClass = !['String', 'int', 'double', 'bool', 'num', 'dynamic'].includes(itemType);
          if (isItemClass) {
            return `      ${f.name}: json['${f.key}'] != null ? (json['${f.key}'] as List).map((i) => ${itemType}.fromJson(i as Map<String, dynamic>)).toList() : null,`;
          } else {
            return `      ${f.name}: json['${f.key}'] != null ? List<${itemType}>.from(json['${f.key}']) : null,`;
          }
        }
        return `      ${f.name}: json['${f.key}'] as ${f.type}?,`;
      }).join('\n');

      const fromJsonCode = `  factory ${className}.fromJson(Map<String, dynamic> json) {\n    return ${className}(\n${fromJsonAssigns}\n    );\n  }`;

      const toJsonAssigns = fields.map((f) => {
        if (f.isClass) {
          return `      '${f.key}': ${f.name}?.toJson(),`;
        }
        if (f.isList && f.type.startsWith('List<')) {
          const itemType = f.type.slice(5, -1);
          const isItemClass = !['String', 'int', 'double', 'bool', 'num', 'dynamic'].includes(itemType);
          if (isItemClass) {
            return `      '${f.key}': ${f.name}?.map((i) => i.toJson()).toList(),`;
          }
        }
        return `      '${f.key}': ${f.name},`;
      }).join('\n');

      const toJsonCode = `  Map<String, dynamic> toJson() {\n    return {\n${toJsonAssigns}\n    };\n  }`;

      const classCode = `class ${className} {\n${propsCode}\n\n${constructorCode}\n\n${fromJsonCode}\n\n${toJsonCode}\n}`;
      models.push({ name: className, code: classCode });
      return className;
    }

    return 'dynamic';
  }

  helper(val, rootName);
  return models.map((m) => m.code).reverse().join('\n\n');
}

/** Infer JSON Schema (Draft-07) from JSON value. */
function generateJsonSchema(val: JsonValue, rootName: string): string {
  function helper(v: JsonValue): any {
    if (v === null) return { type: 'null' };
    if (typeof v === 'boolean') return { type: 'boolean' };
    if (typeof v === 'number') return { type: Number.isInteger(v) ? 'integer' : 'number' };
    if (typeof v === 'string') return { type: 'string' };

    if (Array.isArray(v)) {
      if (v.length === 0) return { type: 'array', items: {} };
      const items = v.map((item) => helper(item));
      return { type: 'array', items: items[0] };
    }

    if (typeof v === 'object') {
      const properties: Record<string, any> = {};
      const required: string[] = [];
      for (const [key, propVal] of Object.entries(v)) {
        properties[key] = helper(propVal);
        required.push(key);
      }
      return {
        type: 'object',
        properties,
        required,
      };
    }

    return {};
  }

  const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: rootName,
    ...helper(val),
  };

  return JSON.stringify(schema, null, 2);
}

export function generateTypes(val: JsonValue | undefined, opts: TypeGenOptions): string {
  if (val === undefined) return '// No valid JSON document loaded';
  const rootName = toPascalCase(opts.rootName || 'Root');

  switch (opts.target) {
    case 'typescript':
      return generateTypeScript(val, rootName);
    case 'zod':
      return generateZod(val, rootName);
    case 'python':
      return generatePython(val, rootName);
    case 'rust':
      return generateRust(val, rootName);
    case 'go':
      return generateGo(val, rootName);
    case 'dart':
      return generateDart(val, rootName);
    case 'json-schema':
      return generateJsonSchema(val, rootName);
    default:
      return generateTypeScript(val, rootName);
  }
}
