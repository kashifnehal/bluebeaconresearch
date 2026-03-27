import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const files = execSync('find apps/api/src -name "*.ts"', { encoding: "utf8" }).trim().split("\n").filter(Boolean);

let count = 0;

for (const file of files) {
  const content = readFileSync(file, "utf8");
  
  // This matches:
  // import { X } from "./path";
  // export * from "./path";
  // import "./path";
  // The (['"]) captures the quote type, and (\\.\\.?\\/[^\\'"]+) captures the relative path.
  const newContent = content.replace(
    /((?:import|export)\s+(?:.*?from\s+)?|import\s+)(['"])(\.\.?\/[^'"]+)\2/g,
    (match, prefix, quote, reqPath) => {
      // If it already has .js or .json, don't change it.
      if (reqPath.endsWith(".js") || reqPath.endsWith(".json")) {
        return match;
      }
      return `${prefix}${quote}${reqPath}.js${quote}`;
    }
  );

  if (content !== newContent) {
    writeFileSync(file, newContent);
    count++;
  }
}

console.log(`Updated ${count} files with .js extensions.`);
