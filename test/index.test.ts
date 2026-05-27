import { assert, describe, it } from "@effect/vitest";
import { join } from "node:path";
import { recommended, strict } from "../src/configs";
import plugin from "../src/index";
import { lint, lintWithExtends } from "./lint";

const root = process.cwd();

describe("packaged configs", () => {
  it("only references exported plugin rule names", () => {
    const pluginRuleNames = new Set(Object.keys(plugin.rules).map((name) => `effect/${name}`));
    const configuredRuleNames = [...Object.keys(recommended.rules), ...Object.keys(strict.rules)];

    assert.deepStrictEqual(
      configuredRuleNames.filter((name) => !pluginRuleNames.has(name)),
      [],
    );
  });

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

describe("layer composition intent rules", () => {
  it("rejects provide-then-merge wiring in mergeAll", () => {
    const result = lint(
      `
        import { Layer } from "effect";

        const AppLayer = Layer.mergeAll(
          AuthTestLive.pipe(Layer.provide(workflowsLayer)),
          workflowsLayer,
        );
      `,
      ["effect/prefer-layer-provide-merge"],
    );

    assert.notStrictEqual(result.status, 0);
    assert.match(result.output, /Layer\.provideMerge/);
  });

  it("rejects provide-then-merge wiring with dependency first", () => {
    const result = lint(
      `
        import { Layer } from "effect";

        const TestLayer = Layer.merge(
          PgLive,
          DrizzlePg.layer({ schema: auth }).pipe(Layer.provide(PgLive)),
        );
      `,
      ["effect/prefer-layer-provide-merge"],
    );

    assert.notStrictEqual(result.status, 0);
    assert.match(result.output, /dependency is provided and then merged back/);
  });

  it("accepts plain provide when dependencies are not merged back", () => {
    const result = lint(
      `
        import { Layer } from "effect";

        const AuthLayer = AuthLive.pipe(Layer.provide(AuthStorageLive));
      `,
      ["effect/prefer-layer-provide-merge"],
    );

    assert.strictEqual(result.status, 0, result.output);
  });

  it("rejects repeated layer factory calls in one merge graph", () => {
    const result = lint(
      `
        import { Layer } from "effect";

        const AppLayer = Layer.mergeAll(
          makeDb(config),
          makeDb(config),
        );
      `,
      ["effect/no-repeated-layer-factory"],
    );

    assert.notStrictEqual(result.status, 0);
    assert.match(result.output, /Bind it once/);
  });

  it("accepts shared layer values and different factory inputs", () => {
    const result = lint(
      `
        import { Layer } from "effect";

        const DbLive = makeDb(config);
        const AppLayer = Layer.mergeAll(
          DbLive,
          makeDb(otherConfig),
          makeQueue(config),
        );
      `,
      ["effect/no-repeated-layer-factory"],
    );

    assert.strictEqual(result.status, 0, result.output);
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

describe("conflicting review guidance", () => {
  it("allows pure synchronous tests to stay regular it blocks", () => {
    const result = lint(
      `
        import { assert, it } from "@effect/vitest";

        it("formats", () => {
          assert.strictEqual(format(1), "1");
        });
      `,
      ["effect/prefer-effect-vitest"],
      "fixture.test.ts",
    );

    assert.strictEqual(result.status, 0, result.output);
  });

  it("rejects primitive service values inferred from Layer.succeed", () => {
    const result = lint(
      `
        import { Context, Layer } from "effect";

        class Token extends Context.Service<Token>()("app/Token") {
          static readonly layer = Layer.succeed(Token)("secret");
        }
      `,
      ["effect/no-primitive-context-service"],
    );

    assert.notStrictEqual(result.status, 0);
    assert.match(result.output, /Wrap primitive values/);
  });

  it("allows deliberate GenericTag keys", () => {
    const result = lint(
      `
        import { Context } from "effect";

        export const CurrentTenant = Context.GenericTag<Tenant>("app/CurrentTenant");
      `,
      ["effect/prefer-context-service"],
    );

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
