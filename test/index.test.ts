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

type RuleFixture = {
  readonly rule: string;
  readonly source: string;
  readonly message: RegExp;
  readonly fileName?: string;
};

const ruleRegressionFixtures: ReadonlyArray<RuleFixture> = [
  {
    rule: "no-explicit-any",
    source: `const value: any = "unsafe";`,
    message: /Do not use any/,
  },
  {
    rule: "no-type-casting",
    source: `const value = input as string;`,
    message: /Do not cast with type assertions/,
  },
  {
    rule: "no-non-null-assertion",
    source: `const value = input!;`,
    message: /Do not use non-null assertions/,
  },
  {
    rule: "no-ts-nocheck",
    source: `// @ts-nocheck\nconst value = 1;`,
    message: /Do not use @ts-nocheck/,
  },
  {
    rule: "no-disable-validation",
    source: `decode(input, { disableValidation: true });`,
    message: /Do not use disableValidation/,
  },
  {
    rule: "no-sql-type-parameter",
    source: "sql<string>`select 1`;",
    message: /Do not use sql<Type>/,
  },
  {
    rule: "prefer-option-from-nullable",
    source: `const option = value !== null ? Option.some(value) : Option.none();`,
    message: /Option\.fromNullable/,
  },
  {
    rule: "no-effect-ignore",
    source: `Effect.ignore(effect);`,
    message: /Do not use Effect\.ignore/,
  },
  {
    rule: "no-effect-catchallcause",
    source: `Effect.catchAllCause(effect, () => Effect.void);`,
    message: /Do not use Effect\.catchAllCause/,
  },
  {
    rule: "no-effect-escape-hatch",
    source: `Effect.die("boom");`,
    message: /Do not collapse typed failures/,
  },
  {
    rule: "no-unsupported-effect-api",
    source: `Effect.async(() => {});`,
    message: /Effect\.async is unavailable/,
  },
  {
    rule: "no-unnecessary-effect-tx",
    source: `Effect.tx(Effect.succeed(1));`,
    message: /Use Effect\.tx only around transactional/,
  },
  {
    rule: "no-silent-error-swallow",
    source: `Effect.catchAll(() => Effect.void);`,
    message: /Do not swallow errors/,
  },
  {
    rule: "no-service-option",
    source: `Effect.serviceOption(Service);`,
    message: /Do not use Effect\.serviceOption/,
  },
  {
    rule: "no-nested-layer-provide",
    source: `Layer.provide(Layer.provide(app, dependency), outer);`,
    message: /Avoid nested Layer\.provide/,
  },
  {
    rule: "no-void-expression",
    source: `void value;`,
    message: /Do not use void expressions/,
  },
  {
    rule: "no-direct-fetch",
    source: `fetch("/api");`,
    message: /Do not call fetch directly/,
  },
  {
    rule: "no-json-parse",
    source: `JSON.parse(text);`,
    message: /Parse JSON with Effect Schema/,
  },
  {
    rule: "no-unknown-shape-probing",
    source: `Reflect.get(value, "name");`,
    message: /Do not probe unknown shapes/,
  },
  {
    rule: "no-localstorage",
    source: `localStorage.getItem("token");`,
    message: /Do not use localStorage/,
  },
  {
    rule: "no-manual-layer-build-in-tests",
    source: `Layer.build(layer);`,
    message: /Avoid manual Layer\.build/,
    fileName: "fixture.test.ts",
  },
  {
    rule: "no-vitest-import",
    source: `import { it } from "vitest";`,
    message: /Import test helpers from @effect\/vitest/,
  },
  {
    rule: "prefer-effect-vitest",
    source: `it("runs", () => {});`,
    message: /Prefer it\.effect/,
  },
  {
    rule: "prefer-effect-vitest-assert",
    source: `import { expect } from "@effect/vitest";`,
    message: /Prefer assert from @effect\/vitest/,
  },
  {
    rule: "prefer-yieldable-error",
    source: `function* run() { yield* Effect.fail(new DomainError()); }`,
    message: /Use yield\* new ErrorType/,
  },
  {
    rule: "no-effect-fail-new-error",
    source: `Effect.fail(new Error("boom"));`,
    message: /Do not fail with generic Error/,
  },
  {
    rule: "no-built-in-error-constructor",
    source: `const error = new TypeError("boom");`,
    message: /Do not construct built-in Error objects/,
  },
  {
    rule: "no-raw-throw",
    source: `throw new DomainError();`,
    message: /Do not throw from Effect domain code/,
  },
  {
    rule: "no-instanceof-error",
    source: `if (error instanceof Error) { handle(error); }`,
    message: /Do not use instanceof Error/,
  },
  {
    rule: "no-unknown-error-message",
    source: `const message = error.message;`,
    message: /Do not read \.message from unknown errors/,
  },
  {
    rule: "no-promise-catch",
    source: `promise.catch(() => undefined);`,
    message: /Do not use Promise \.catch/,
  },
  {
    rule: "no-promise-reject",
    source: `Promise.reject(error);`,
    message: /Do not use Promise\.reject/,
  },
  {
    rule: "prefer-tagged-constructor",
    source: `const state = { _tag: "Idle" };`,
    message: /Use a tagged constructor/,
  },
  {
    rule: "prefer-data-tagged-enum",
    source: `type State = { readonly _tag: "Idle" } | { readonly _tag: "Busy" };`,
    message: /Use Data\.TaggedEnum/,
  },
  {
    rule: "no-manual-tag-check",
    source: `if (state._tag === "Idle") { run(); }`,
    message: /Do not inspect _tag manually/,
  },
  {
    rule: "prefer-schema-tagged-error-class",
    source: `const DomainError = Data.TaggedError("DomainError");`,
    message: /Use Schema\.TaggedErrorClass/,
  },
  {
    rule: "prefer-effect-fn",
    source: `const run = () => Effect.gen(function* () {});`,
    message: /Use Effect\.fn/,
  },
  {
    rule: "prefer-match-validation",
    source: `
      const validate = () => {
        if (missing) return Effect.fail(new Missing());
        if (invalid) return Effect.fail(new Invalid());
        return Effect.void;
      };
    `,
    message: /Prefer Match\.type/,
  },
  {
    rule: "prefer-match-value",
    source: `
      function label(value: string) {
        switch (value) {
          case "a": return "A";
          case "b": return "B";
        }
      }
    `,
    message: /Use Match\.value/,
  },
  {
    rule: "prefer-yieldable-error-in-match",
    source: `Match.when("Invalid", () => Effect.fail(new Invalid()));`,
    message: /Return new DomainError/,
  },
  {
    rule: "no-as-effect-method-reference",
    source: `const toEffect = error.asEffect;`,
    message: /Do not pass \.asEffect as a method reference/,
  },
  {
    rule: "prefer-context-service",
    source: `Context.Tag("Service");`,
    message: /Prefer Context\.Service/,
  },
  {
    rule: "no-inline-schema-compile",
    source: `const parse = (value: unknown) => Schema.decodeUnknownSync(Schema.String)(value);`,
    message: /Hoist Schema\.decodeUnknownSync/,
  },
  {
    rule: "no-try-catch",
    source: `try { run(); } catch (error) { handle(error); }`,
    message: /Avoid try\/catch/,
  },
];

describe("rule regressions", () => {
  for (const fixture of ruleRegressionFixtures) {
    it(`rejects ${fixture.rule} violations`, () => {
      const result = lint(
        fixture.source,
        [`effect/${fixture.rule}`],
        fixture.fileName ?? "fixture.ts",
      );

      assert.notStrictEqual(result.status, 0);
      assert.match(result.output, fixture.message);
    });
  }
});

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
      }>()("test/config/SomethingConfig") {
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
      }>()("test/config/SomethingConfig") {
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

      export class Token extends Context.Service<Token>()("test/auth/Token") {
        static readonly layer = Layer.succeed(Token)("token");
      }

      export class Literal extends Context.Service<Literal, "literal">()("test/auth/Literal") {
        static readonly layer = Layer.succeed(Literal)("literal");
      }
    `);

    assert.strictEqual(result.status, 0, result.output);
  });

  it("rejects generic service tags", () => {
    const result = lint(`
      import { Context } from "effect";

      export class Auth extends Context.Service<Auth, {
        readonly token: string;
      }>()("Auth") {}
    `);

    assert.notStrictEqual(result.status, 0);
    assert.match(result.output, /namespaced Context\.Service tag/);
  });

  it("rejects namespaced service tags for the wrong class", () => {
    const result = lint(`
      import { Context } from "effect";

      export class Auth extends Context.Service<Auth, {
        readonly token: string;
      }>()("effect-auth/auth/AuthToken") {}
    `);

    assert.notStrictEqual(result.status, 0);
    assert.match(result.output, /ending with \/Auth/);
  });

  it("rejects service shape interfaces", () => {
    const result = lint(`
      import { Context } from "effect";

      interface MailerShape {
        readonly send: (message: string) => void;
      }

      export class Mailer extends Context.Service<Mailer, MailerShape>()("test/mail/Mailer") {}
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
      }>()("test/mail/Mailer") {}
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
      }>()("test/config/SomethingConfig") {
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
      }>()("test/config/SomethingConfig") {
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

describe("no-effect-run-in-tests", () => {
  it("accepts manual Effect runners outside test files", () => {
    const result = lint(
      `
        import { Effect } from "effect";

        export const main = () => Effect.runPromise(Effect.void);
      `,
      ["effect/no-effect-run-in-tests"],
      "fixture.ts",
    );

    assert.strictEqual(result.status, 0, result.output);
  });

  it("rejects manual Effect runners in test files", () => {
    const result = lint(
      `
        import { Effect } from "effect";

        it("runs", async () => {
          await Effect.runPromise(Effect.void);
        });
      `,
      ["effect/no-effect-run-in-tests"],
      "fixture.test.ts",
    );

    assert.notStrictEqual(result.status, 0);
    assert.match(result.output, /Use it\.effect/);
  });
});
