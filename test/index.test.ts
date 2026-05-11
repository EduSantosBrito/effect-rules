import { assert, describe, it } from "@effect/vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const pluginPath = join(root, "src", "index.ts");

const lint = (
  source: string,
  rules: ReadonlyArray<string> = ["effect/prefer-inline-context-service-shape"],
) => {
  const directory = mkdtempSync(join(tmpdir(), "effect-rules-"));
  const configPath = join(directory, ".oxlintrc.json");
  const sourcePath = join(directory, "fixture.ts");

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

const typeCheck = (source: string) => {
  const directory = mkdtempSync(join(root, ".effect-rules-test-"));
  const configPath = join(directory, "tsconfig.json");
  const sourcePath = join(directory, "fixture.ts");

  writeFileSync(
    configPath,
    JSON.stringify({
      extends: join(root, "tsconfig.json"),
      compilerOptions: {
        baseUrl: root,
        lib: ["ESNext", "DOM"],
        noEmit: true,
        types: [],
      },
      include: [sourcePath],
    }),
  );
  writeFileSync(sourcePath, source);

  const result = spawnSync("bun", ["--bun", "tsc", "-p", configPath], {
    cwd: root,
    encoding: "utf8",
  });

  rmSync(directory, { recursive: true, force: true });
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
  };
};

const trustedOriginFixturePreamble = `
  import { Context, Effect, Schema } from "effect";

  type IsEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
  type Expect<T extends true> = T;

  class PublicAuthError extends Schema.TaggedErrorClass<PublicAuthError>()("PublicAuthError", {}) {}

  const unauthorized = new PublicAuthError({});

  class TrustedOriginPolicy extends Context.Service<TrustedOriginPolicy, {
    readonly isTrusted: (origin: URL) => Effect.Effect<boolean>;
  }>()("TrustedOriginPolicy") {}
`;

describe("prefer-inline-context-service-shape", () => {
  it("accepts pure config services built from Schema input", () => {
    const result = lint(`
      import { Context, Layer, Option, Schema } from "effect";

      const SomethingConfigInput = Schema.Struct({
        optionalProp: Schema.Option(Schema.String),
        requiredProp: Schema.String,
      });

      export class SomethingConfig extends Context.Service<SomethingConfig, {
        readonly optionalProp: Option.Option<string>;
        readonly requiredProp: string;
      }>()("SomethingConfig") {
        static readonly layer = (input: typeof SomethingConfigInput.Type) =>
          Layer.succeed(SomethingConfig)(SomethingConfigInput.make(input));
      }
    `);

    assert.strictEqual(result.status, 0, result.output);
  });

  it("accepts config services with methods built via Service.of", () => {
    const result = lint(`
      import { Context, Effect, Option, Random, Schema } from "effect";

      const SomethingConfigInput = Schema.Struct({
        optionalProp: Schema.Option(Schema.String),
        requiredProp: Schema.String,
      });

      export class SomethingConfig extends Context.Service<SomethingConfig, {
        readonly optionalProp: Option.Option<string>;
        readonly requiredProp: string;
        readonly logProps: Effect.Effect<void>;
        readonly anotherFn: () => Effect.Effect<number>;
      }>()("SomethingConfig") {
        static readonly layer = (input: typeof SomethingConfigInput.Type) => {
          const config = SomethingConfigInput.make(input);

          const anotherFn = Effect.fn("anotherFn")(function* () {
            const random = yield* Random.next;
            return random;
          });

          return SomethingConfig.of({
            ...config,
            logProps: Effect.logInfo("SomethingConfig props", {
              optionalProp: config.optionalProp,
              requiredProp: config.requiredProp,
            }),
            anotherFn,
          });
        };
      }
    `);

    assert.strictEqual(result.status, 0, result.output);
  });

  it("ignores Context.Service with no object service shape", () => {
    const result = lint(`
      import { Context, Layer } from "effect";

      export class Token extends Context.Service<Token>()("Token") {
        static readonly layer = Layer.succeed(Token)("token");
      }

      export class Literal extends Context.Service<Literal, "literal">()("Literal") {
        static readonly layer = Layer.succeed(Literal)("literal");
      }
    `);

    assert.strictEqual(result.status, 0, result.output);
  });

  it("rejects service shape interfaces", () => {
    const result = lint(`
      import { Context } from "effect";

      interface MailerShape {
        readonly send: (message: string) => void;
      }

      export class Mailer extends Context.Service<Mailer, MailerShape>()("Mailer") {}
    `);

    assert.notStrictEqual(result.status, 0);
    assert.match(result.output, /Inline the Context\.Service shape/);
  });

  it("rejects optional fields in inline service shapes", () => {
    const result = lint(`
      import { Context } from "effect";

      export class Mailer extends Context.Service<Mailer, {
        readonly replyTo?: string;
        readonly send: (message: string) => void;
      }>()("Mailer") {}
    `);

    assert.notStrictEqual(result.status, 0);
    assert.match(result.output, /Use Option for optional Context\.Service fields/);
  });

  it("rejects non-schema layer input", () => {
    const result = lint(`
      import { Context, Layer, Option, Schema } from "effect";

      const SomethingConfigInput = Schema.Struct({
        optionalProp: Schema.Option(Schema.String),
        requiredProp: Schema.String,
      });

      export class SomethingConfig extends Context.Service<SomethingConfig, {
        readonly optionalProp: Option.Option<string>;
        readonly requiredProp: string;
      }>()("SomethingConfig") {
        static readonly layer = (input: { readonly requiredProp: string }) =>
          Layer.succeed(SomethingConfig)(SomethingConfigInput.make(input));
      }
    `);

    assert.notStrictEqual(result.status, 0);
    assert.match(result.output, /typeof SomethingConfigInput\.Type/);
  });

  it("rejects method services built with Layer.succeed", () => {
    const result = lint(`
      import { Context, Effect, Layer, Option, Schema } from "effect";

      const SomethingConfigInput = Schema.Struct({
        optionalProp: Schema.Option(Schema.String),
        requiredProp: Schema.String,
      });

      export class SomethingConfig extends Context.Service<SomethingConfig, {
        readonly optionalProp: Option.Option<string>;
        readonly requiredProp: string;
        readonly logProps: Effect.Effect<void>;
      }>()("SomethingConfig") {
        static readonly layer = (input: typeof SomethingConfigInput.Type) => {
          const config = SomethingConfigInput.make(input);
          return Layer.succeed(SomethingConfig)({
            ...config,
            logProps: Effect.logInfo("props"),
          });
        };
      }
    `);

    assert.notStrictEqual(result.status, 0);
    assert.match(result.output, /return SomethingConfig\.of/);
  });
});

describe("no-return-yieldable-error", () => {
  it("accepts yielding yieldable errors without return", () => {
    const result = lint(
      `
        import { Effect } from "effect";

        export const checkTrustedOrigin = Effect.fn("checkTrustedOrigin")(function* (origin: URL) {
          const policy = yield* TrustedOriginPolicy;
          const trusted = yield* policy.isTrusted(origin);
          if (!trusted) yield* unauthorized;
        });
      `,
      ["effect/no-return-yieldable-error"],
    );

    assert.strictEqual(result.status, 0, result.output);
  });

  it("rejects returning yieldable errors", () => {
    const result = lint(
      `
        import { Effect } from "effect";

        export const checkTrustedOrigin = Effect.fn("checkTrustedOrigin")(function* (origin: URL) {
          const policy = yield* TrustedOriginPolicy;
          const trusted = yield* policy.isTrusted(origin);
          if (!trusted) return yield* unauthorized;
        });
      `,
      ["effect/no-return-yieldable-error"],
    );

    assert.notStrictEqual(result.status, 0);
    assert.match(result.output, /Do not return yieldable errors/);
  });

  it("documents that return yieldable errors infer undefined", () => {
    const result = typeCheck(`
      ${trustedOriginFixturePreamble}

      const checkTrustedOrigin = (origin: URL) =>
        Effect.fn("checkTrustedOrigin")(function* () {
          const policy = yield* TrustedOriginPolicy;
          const trusted = yield* policy.isTrusted(origin);
          if (!trusted) return yield* unauthorized;
        })();

      type Actual = Effect.Success<ReturnType<typeof checkTrustedOrigin>>;
      type _check = Expect<IsEqual<Actual, undefined>>;
    `);

    assert.strictEqual(result.status, 0, result.output);
  });
});

describe("no-effect-fn-immediate-invocation", () => {
  it("accepts Effect.fn parameters on the generator function", () => {
    const result = lint(
      `
        import { Effect } from "effect";

        export const checkTrustedOrigin = Effect.fn("checkTrustedOrigin")(function* (origin: URL) {
          const policy = yield* TrustedOriginPolicy;
          const trusted = yield* policy.isTrusted(origin);
          if (!trusted) yield* unauthorized;
        });
      `,
      ["effect/no-effect-fn-immediate-invocation"],
    );

    assert.strictEqual(result.status, 0, result.output);
  });

  it("rejects Effect.fn implementations called immediately", () => {
    const result = lint(
      `
        import { Effect } from "effect";

        export const checkTrustedOrigin = (
          origin: URL,
        ): Effect.Effect<void, PublicAuthError, TrustedOriginPolicy> =>
          Effect.fn("checkTrustedOrigin")(function* () {
            const policy = yield* TrustedOriginPolicy;
            const trusted = yield* policy.isTrusted(origin);
            if (!trusted) return yield* unauthorized;
          })();
      `,
      ["effect/no-effect-fn-immediate-invocation"],
    );

    assert.notStrictEqual(result.status, 0);
    assert.match(result.output, /Do not write Effect\.fn\(\.\.\.\)\(\.\.\.\)\(\)/);
  });

  it("documents that generator parameters preserve void inference", () => {
    const result = typeCheck(`
      ${trustedOriginFixturePreamble}

      const checkTrustedOrigin = Effect.fn("checkTrustedOrigin")(function* (origin: URL) {
        const policy = yield* TrustedOriginPolicy;
        const trusted = yield* policy.isTrusted(origin);
        if (!trusted) yield* unauthorized;
      });

      type Actual = Effect.Success<ReturnType<typeof checkTrustedOrigin>>;
      type _check = Expect<IsEqual<Actual, void>>;
    `);

    assert.strictEqual(result.status, 0, result.output);
  });
});
