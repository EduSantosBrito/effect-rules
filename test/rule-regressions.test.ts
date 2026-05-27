import { assert, describe, it } from "@effect/vitest";
import { lint } from "./lint";

type RuleFixture = {
  readonly rule: string;
  readonly source: string;
  readonly message: RegExp;
  readonly fileName?: string;
};

const ruleRegressionFixtures: ReadonlyArray<RuleFixture> = [
  { rule: "no-explicit-any", source: `const value: any = "unsafe";`, message: /Do not use any/ },
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
    rule: "no-process-env",
    source: `const token = process.env.AUTH_TOKEN;`,
    message: /Effect Config/,
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
    rule: "no-bare-yield-in-effect-generator",
    source: `Effect.gen(function* () { yield Effect.succeed(1); });`,
    message: /Use yield\*/,
  },
  {
    rule: "no-floating-effect-in-generator",
    source: `Effect.gen(function* () { Effect.logInfo("started"); });`,
    message: /Do not leave Effects floating/,
  },
  {
    rule: "no-return-effect-from-generator",
    source: `Effect.gen(function* () { return Effect.succeed(1); });`,
    message: /Do not return an Effect/,
  },
  {
    rule: "no-effect-run-in-effect-code",
    source: `Effect.gen(function* () { return yield* Effect.promise(() => Effect.runPromise(program)); });`,
    message: /Do not run Effects inside Effect code/,
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
    rule: "prefer-map-error-for-wrapping",
    source: `Effect.catchAll((error) => Effect.fail(new WrappedError({ cause: error })));`,
    message: /Use Effect\.mapError/,
  },
  {
    rule: "no-service-option",
    source: `Effect.serviceOption(Service);`,
    message: /Do not use Effect\.serviceOption/,
  },
  {
    rule: "no-primitive-context-service",
    source: `class Token extends Context.Service<Token, string>()("app/Token") {}`,
    message: /Context\.Service shapes should be objects/,
  },
  {
    rule: "no-promise-service-method",
    source: `class Users extends Context.Service<Users, { readonly find: () => Promise<User> }>()("app/Users") {}`,
    message: /not Promise/,
  },
  {
    rule: "no-nested-layer-provide",
    source: `Layer.provide(Layer.provide(app, dependency), outer);`,
    message: /Avoid nested Layer\.provide/,
  },
  {
    rule: "prefer-layer-provide-merge",
    source: `Layer.mergeAll(AuthLive.pipe(Layer.provide(workflowsLayer)), workflowsLayer);`,
    message: /Layer\.provideMerge/,
  },
  {
    rule: "no-repeated-layer-factory",
    source: `Layer.mergeAll(makeDb(config), makeDb(config));`,
    message: /Bind it once/,
  },
  {
    rule: "prefer-layer-constructor-semantics",
    source: `Layer.effect(Service, Effect.succeed({}));`,
    message: /Use Layer\.succeed/,
  },
  {
    rule: "prefer-fork-scoped-in-layer",
    source: `Layer.effectDiscard(Effect.gen(function* () { yield* Effect.fork(worker); }));`,
    message: /forkScoped/,
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
  { rule: "no-void-expression", source: `void value;`, message: /Do not use void expressions/ },
  { rule: "no-direct-fetch", source: `fetch("/api");`, message: /Do not call fetch directly/ },
  {
    rule: "no-native-clock-in-effect",
    source: `Effect.sync(() => Date.now());`,
    message: /Clock or DateTime/,
  },
  {
    rule: "no-native-random-in-effect",
    source: `Effect.sync(() => Math.random());`,
    message: /Effect Random/,
  },
  {
    rule: "no-timer-api-in-effect",
    source: `Effect.sync(() => setTimeout(run, 100));`,
    message: /Effect\.sleep/,
  },
  {
    rule: "no-promise-combinators-in-effect",
    source: `Effect.tryPromise(() => Promise.all(tasks));`,
    message: /Effect\.all/,
  },
  { rule: "no-json-parse", source: `JSON.parse(text);`, message: /Parse JSON with Effect Schema/ },
  {
    rule: "no-sync-schema-decode-in-effect",
    source: `Effect.gen(function* () { return Schema.decodeUnknownSync(User)(input); });`,
    message: /decodeUnknownEffect/,
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
    source: `it("runs", () => Effect.succeed(1));`,
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
