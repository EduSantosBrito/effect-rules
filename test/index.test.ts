import { assert, describe, it } from "@effect/vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recommended, strict } from "../src/configs";

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

const lintWithExtends = (source: string, extendsPath: string, fileName = "fixture.ts") => {
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
    rule: "no-unknown-runtime-requirements",
    source: `const runWithRuntime = (effect: Effect.Effect<string, never, unknown>) => effect;`,
    message: /Do not use unknown as the Effect requirement type/,
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
    rule: "prefer-static-effect",
    source: `const getClients = () => Effect.succeed(clients);`,
    message: /Effects are already lazy/,
  },
  {
    rule: "prefer-stream-from-pubsub",
    source: `const subscribe = () => eventsPubSub.subscribe();`,
    message: /Stream\.fromPubSub/,
  },
  {
    rule: "prefer-service-log-annotations",
    source: `const layer = Layer.effect(Service, Effect.gen(function* () { return Service.of({}); }));`,
    message: /Effect\.annotateLogs/,
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
    rule: "no-schema-error-response-leak",
    source: `
      const app = Effect.catchTag(program, "SchemaError", (error) =>
        Effect.succeed(HttpServerResponse.jsonUnsafe({ error }, { status: 400 }))
      );
    `,
    message: /Do not expose SchemaError details/,
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
    rule: "no-raw-indexeddb",
    source: `indexedDB.open("app");`,
    message: /Do not use raw IndexedDB APIs/,
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
  {
    rule: "prefer-shared-managed-runtime",
    source: `Effect.runPromise(program.pipe(Effect.provide(AppLayer)));`,
    message: /shared ManagedRuntime/,
  },
  {
    rule: "require-callback-cleanup-for-listeners",
    source: `Effect.callback((resume) => { socket.once("close", () => resume(Effect.void)); });`,
    message: /Return a cleanup Effect/,
  },
  {
    rule: "prefer-scoped-temp-cleanup",
    source: `
      const program = Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectory();
        yield* work(dir).pipe(Effect.ensuring(fs.remove(dir, { recursive: true })));
      });
    `,
    message: /makeTempDirectoryScoped/,
  },
  {
    rule: "no-nested-semaphore-acquire",
    source: `fromLock.withPermit(toLock.withPermit(Effect.void));`,
    message: /Do not acquire a semaphore while holding another semaphore/,
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

describe("packaged configs", () => {
  it("exports strict config for oxlint.config.ts", () => {
    assert.deepStrictEqual(recommended.jsPlugins, ["effect-rules"]);
    assert.strictEqual(recommended.rules["effect/no-explicit-any"], "error");
    assert.deepStrictEqual(strict.jsPlugins, ["effect-rules"]);
    assert.strictEqual(strict.rules["effect/prefer-static-effect"], "error");
  });

  it("loads strict config through oxlint extends", () => {
    const result = lintWithExtends(
      `const getClients = () => Effect.succeed(clients);`,
      join(root, "configs", "strict.json"),
    );

    assert.notStrictEqual(result.status, 0);
    assert.match(result.output, /Effects are already lazy/);
  });
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

  it("does not infer schema input from type-only Input names", () => {
    const result = lint(`
      import { Context, Effect, Layer } from "effect";

      interface AuthHttpConfigInput {
        readonly baseUrl: URL;
      }

      export class AuthHttpConfig extends Context.Service<AuthHttpConfig, {
        readonly baseUrl: URL;
      }>()("effect-auth/AuthHttpConfig") {
        static readonly layer = (input: AuthHttpConfigInput) =>
          Layer.effect(AuthHttpConfig, Effect.succeed(AuthHttpConfig.of({
            baseUrl: input.baseUrl,
          })));
      }
    `);

    assert.strictEqual(result.status, 0, result.output);
  });

  it("does not infer schema input from named layer function type-only Input names", () => {
    const result = lint(`
      import { Context, Effect, Layer } from "effect";

      type AuthHttpConfigInput = {
        readonly baseUrl: URL;
      };

      const authHttpConfigLayer = (input: AuthHttpConfigInput) =>
        Layer.effect(AuthHttpConfig, Effect.succeed(AuthHttpConfig.of({
          baseUrl: input.baseUrl,
        })));

      export class AuthHttpConfig extends Context.Service<AuthHttpConfig, {
        readonly baseUrl: URL;
      }>()("effect-auth/AuthHttpConfig") {
        static readonly layer = authHttpConfigLayer;
      }
    `);

    assert.strictEqual(result.status, 0, result.output);
  });

  it("checks schema input through named layer functions", () => {
    const result = lint(`
      import { Context, Layer, Option, Schema } from "effect";

      const SomethingConfigInput = Schema.Struct({
        optionalProp: Schema.Option(Schema.String),
        requiredProp: Schema.String,
      });

      const somethingLayer = (input: { readonly requiredProp: string }) =>
        Layer.succeed(SomethingConfig)(SomethingConfigInput.make(input));

      export class SomethingConfig extends Context.Service<SomethingConfig, {
        readonly optionalProp: Option.Option<string>;
        readonly requiredProp: string;
      }>()("test/config/SomethingConfig") {
        static readonly layer = somethingLayer;
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
});

describe("reference-backed boundary rules", () => {
  it("allows plain Effect runners at JS boundaries", () => {
    const result = lint(`Effect.runPromise(program);`, ["effect/prefer-shared-managed-runtime"]);

    assert.strictEqual(result.status, 0, result.output);
  });

  it("allows Effect.callback without registered listeners", () => {
    const result = lint(
      `
        Effect.callback((resume) => {
          legacyConvert(input, (error, output) => {
            resume(error ? Effect.die(error) : Effect.succeed(output));
          });
        });
      `,
      ["effect/require-callback-cleanup-for-listeners"],
    );

    assert.strictEqual(result.status, 0, result.output);
  });

  it("allows Effect.callback listener registrations with cleanup", () => {
    const result = lint(
      `
        Effect.callback((resume) => {
          const onClose = () => resume(Effect.void);
          socket.once("close", onClose);
          return Effect.sync(() => socket.off("close", onClose));
        });
      `,
      ["effect/require-callback-cleanup-for-listeners"],
    );

    assert.strictEqual(result.status, 0, result.output);
  });

  it("allows persistent unscoped temp resources without manual cleanup", () => {
    const result = lint(
      `
        const getRuntimeDirectory = Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const parent = yield* fs.makeTempDirectory({ prefix: "runtime-" });
          return path.join(parent, "helper");
        });
      `,
      ["effect/prefer-scoped-temp-cleanup"],
    );

    assert.strictEqual(result.status, 0, result.output);
  });
});

describe("no-nested-semaphore-acquire", () => {
  it("accepts sequential semaphore acquisition", () => {
    const result = lint(
      `
        const program = Effect.gen(function* () {
          yield* first.withPermit(Effect.void);
          yield* second.withPermit(Effect.void);
        });
      `,
      ["effect/no-nested-semaphore-acquire"],
    );

    assert.strictEqual(result.status, 0, result.output);
  });

  it("rejects curried nested withPermits", () => {
    const result = lint(`fromLock.withPermits(1)(toLock.withPermits(1)(Effect.void));`, [
      "effect/no-nested-semaphore-acquire",
    ]);

    assert.notStrictEqual(result.status, 0);
    assert.match(result.output, /TxRef\/TxQueue/);
  });

  it("rejects module combinator nested acquisition", () => {
    const result = lint(
      `Semaphore.withPermit(fromLock, Semaphore.withPermits(toLock, 1, Effect.void));`,
      ["effect/no-nested-semaphore-acquire"],
    );

    assert.notStrictEqual(result.status, 0);
    assert.match(result.output, /coordinated state/);
  });
});

describe("no-schema-error-response-leak", () => {
  it("accepts logging SchemaError while returning generic response", () => {
    const result = lint(
      `
        program.pipe(
          Effect.catchTag("SchemaError", (error) =>
            Effect.logError("Decode failure", { cause: error }).pipe(
              Effect.andThen(HttpServerResponse.jsonUnsafe({ error: "Bad request" }, { status: 400 }))
            )
          )
        );
      `,
      ["effect/no-schema-error-response-leak"],
    );

    assert.strictEqual(result.status, 0, result.output);
  });

  it("rejects piped SchemaError responses containing error.message", () => {
    const result = lint(
      `
        const app = program.pipe(
          Effect.catchTag("SchemaError", (error) =>
            HttpServerResponse.json({ message: error.message }, { status: 400 })
          )
        );
      `,
      ["effect/no-schema-error-response-leak"],
    );

    assert.notStrictEqual(result.status, 0);
    assert.match(result.output, /generic decode error/);
  });
});

describe("no-raw-indexeddb", () => {
  it("accepts platform-browser IndexedDb service usage", () => {
    const result = lint(
      `
        import * as IndexedDb from "@effect/platform-browser/IndexedDb";

        const layer = IndexedDb.layerWindow;
      `,
      ["effect/no-raw-indexeddb"],
    );

    assert.strictEqual(result.status, 0, result.output);
  });

  it("rejects window.indexedDB and IDBKeyRange usage", () => {
    const result = lint(
      `
        const request = window.indexedDB.open("app");
        const range = IDBKeyRange.only("user-1");
      `,
      ["effect/no-raw-indexeddb"],
    );

    assert.notStrictEqual(result.status, 0);
    assert.match(result.output, /Schema-backed tables/);
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
