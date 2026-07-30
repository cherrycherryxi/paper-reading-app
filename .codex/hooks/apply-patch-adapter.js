import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const configuredRoot = process.env.WOLF_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR;
let root = configuredRoot;
if (!root) {
    try {
        root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf-8" }).trim();
    }
    catch {
        root = process.cwd();
    }
}

const hook = path.join(root, ".wolf", "hooks", process.argv[2]);
const raw = fs.readFileSync(0, "utf-8");
let input;
try {
    input = JSON.parse(raw);
}
catch {
    process.exit(0);
}

const patch = input.tool_input?.command || "";
const files = [...patch.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)]
    .map((match) => match[1].trim())
    .filter(Boolean);

for (const filePath of files) {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
    const fileContent = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf-8") : "";
    const adapted = {
        ...input,
        tool_name: "Write",
        tool_input: { file_path: absolutePath, content: fileContent },
    };
    const result = spawnSync("node", [hook], { input: JSON.stringify(adapted), encoding: "utf-8" });
    if (result.stderr)
        process.stderr.write(result.stderr);
}
