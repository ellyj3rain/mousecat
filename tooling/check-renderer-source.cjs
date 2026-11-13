"use strict";
const fs = require("node:fs");
const path = require("node:path");
const compilerIndex = process.argv.indexOf("--typescript");
const ts = require(compilerIndex >= 0 ? path.resolve(process.argv[compilerIndex + 1]) : "typescript");
const root = path.resolve(__dirname, "..");
const files = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) walk(file); else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) files.push(file); } }
walk(path.join(root, "src"));
const program = ts.createProgram(files, { noEmit: true, noResolve: true, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, lib: ["lib.es2023.d.ts", "lib.dom.d.ts"], types: [], skipLibCheck: true });
const syntax = program.getSyntacticDiagnostics();
const semantic = program.getSemanticDiagnostics();
const unbound = semantic.filter(item => item.code === 2304);
const dependencyErrors = semantic.filter(item => [2307, 2792, 2875, 2503, 7026].includes(item.code)).length;
const findings = [...syntax, ...unbound].map(item => ({ file: item.file ? path.relative(root, item.file.fileName) : null, code: item.code, message: ts.flattenDiagnosticMessageText(item.messageText, " ") }));
console.log(JSON.stringify({ schema: "mc.renderer-source-check/1", compilerVersion: ts.version, files: files.length, findings, unresolvedDependencyDiagnostics: dependencyErrors, scope: "syntax and unbound identifiers only; full dependency-aware typecheck/build and rendered inspection remain separate" }, null, 2));
process.exitCode = findings.length ? 1 : 0;
