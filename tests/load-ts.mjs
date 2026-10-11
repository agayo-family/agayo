import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { createRequire } from 'node:module';
export async function loadTs(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

export async function loadTsx(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  const runtimeRequire = createRequire(import.meta.url);
  // Only trusted repository source is compiled. Dependencies resolve through
  // the project's installed packages; fixture data never executes as code.
  const require = (specifier) => Object.hasOwn(dependencies, specifier) ? dependencies[specifier] : runtimeRequire(specifier);
  new Function('require', 'module', 'exports', output)(require, module, module.exports);
  return module.exports;
}
