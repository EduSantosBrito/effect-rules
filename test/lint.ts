import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const pluginPath = join(root, "src", "index.ts");

export const lint = (
  source: string,
  rules: ReadonlyArray<string> = ["effect/prefer-inline-context-service-shape"],
  fileName = "fixture.ts",
) => {
  const directory = mkdtempSync(join(tmpdir(), "effect-rules-"));
  const configPath = join(directory, ".oxlintrc.json");
  const sourcePath = join(directory, fileName);

  writeFileSync(
    configPath,
    JSON.stringify({
      jsPlugins: [pluginPath],
      rules: Object.fromEntries(rules.map((rule) => [rule, "error"])),
    }),
  );
  writeFileSync(sourcePath, source);

  const result = spawnSync("bun", ["--bun", "oxlint", "-c", configPath, sourcePath], {
    cwd: root,
    encoding: "utf8",
  });

  rmSync(directory, { recursive: true, force: true });
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
  };
};

export const lintWithExtends = (source: string, extendsPath: string, fileName = "fixture.ts") => {
  const directory = mkdtempSync(join(tmpdir(), "effect-rules-"));
  const configPath = join(directory, ".oxlintrc.json");
  const sourcePath = join(directory, fileName);

  writeFileSync(
    configPath,
    JSON.stringify({
      extends: [extendsPath],
      jsPlugins: [pluginPath],
    }),
  );
  writeFileSync(sourcePath, source);

  const result = spawnSync("bun", ["--bun", "oxlint", "-c", configPath, sourcePath], {
    cwd: root,
    encoding: "utf8",
  });

  rmSync(directory, { recursive: true, force: true });
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
  };
};
