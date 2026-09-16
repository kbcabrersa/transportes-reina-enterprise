import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../pages/dashboard-enterprise.html", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../js/dashboard-enterprise.js", import.meta.url), "utf8");
const service = readFileSync(new URL("../js/firebase-service.js", import.meta.url), "utf8");

const failures = [];
const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) failures.push(`IDs HTML duplicados: ${[...new Set(duplicates)].join(", ")}`);

const functions = new Set([...dashboard.matchAll(/\bfunction\s+([\w$]+)\s*\(/g)].map(match => match[1]));
const inlineHandlers = [...html.matchAll(/\bonclick=["']([\w$]+)\s*\(/g)].map(match => match[1]);
const missingHandlers = [...new Set(inlineHandlers.filter(name => !functions.has(name)))];
if (missingHandlers.length) failures.push(`Manejadores onclick ausentes: ${missingHandlers.join(", ")}`);

const sectionIds = new Set([...html.matchAll(/<section\s+id=["']([^"']+)["']/g)].map(match => match[1]));
const tabTargets = [...html.matchAll(/data-tab=["']([^"']+)["']/g)].map(match => match[1]);
const missingSections = tabTargets.filter(target => !sectionIds.has(target));
if (missingSections.length) failures.push(`Pestañas sin sección: ${missingSections.join(", ")}`);

const importedBlock = dashboard.match(/const\s*\{([\s\S]*?)\}\s*=\s*await import\("\/js\/firebase-service\.js/);
if (importedBlock) {
  const importedNames = importedBlock[1].split(",").map(value => value.trim()).filter(Boolean);
  const exports = new Set([...service.matchAll(/export\s+(?:async\s+)?function\s+([\w$]+)/g)].map(match => match[1]));
  const missingExports = importedNames.filter(name => !exports.has(name));
  if (missingExports.length) failures.push(`Servicios Firebase no exportados: ${missingExports.join(", ")}`);
} else {
  failures.push("No se encontró el bloque de importación de Firebase.");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Enterprise OK: ${ids.length} IDs, ${tabTargets.length} pestañas y ${inlineHandlers.length} acciones verificadas.`);
