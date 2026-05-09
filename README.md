# effect-rules

Custom oxlint JS plugin rules for Effect TypeScript projects.

## Usage

```json
{
  "jsPlugins": ["effect-rules"],
  "rules": {
    "effect/no-explicit-any": "error",
    "effect/prefer-yieldable-error": "error",
    "effect/prefer-effect-fn": "warn"
  }
}
```

For local development before publishing:

```json
{
  "jsPlugins": ["./node_modules/effect-rules/src/index.ts"]
}
```

## Rules

- `effect/no-explicit-any`
- `effect/no-type-casting`
- `effect/no-non-null-assertion`
- `effect/no-ts-nocheck`
- `effect/no-disable-validation`
- `effect/no-sql-type-parameter`
- `effect/prefer-option-from-nullable`
- `effect/no-effect-ignore`
- `effect/no-effect-catchallcause`
- `effect/no-effect-escape-hatch`
- `effect/no-unsupported-effect-api`
- `effect/no-silent-error-swallow`
- `effect/no-service-option`
- `effect/no-nested-layer-provide`
- `effect/no-void-expression`
- `effect/no-direct-fetch`
- `effect/no-json-parse`
- `effect/no-unknown-shape-probing`
- `effect/no-localstorage`
- `effect/no-manual-layer-build-in-tests`
- `effect/no-vitest-import`
- `effect/prefer-effect-vitest`
- `effect/prefer-effect-vitest-assert`
- `effect/prefer-yieldable-error`
- `effect/no-effect-fail-new-error`
- `effect/no-built-in-error-constructor`
- `effect/no-raw-throw`
- `effect/no-instanceof-error`
- `effect/no-unknown-error-message`
- `effect/no-promise-catch`
- `effect/no-promise-reject`
- `effect/prefer-tagged-constructor`
- `effect/no-manual-tag-check`
- `effect/prefer-schema-tagged-error-class`
- `effect/prefer-effect-fn`
- `effect/prefer-match-validation`
- `effect/prefer-yieldable-error-in-match`
- `effect/no-as-effect-method-reference`
- `effect/prefer-context-service`
- `effect/no-inline-schema-compile`
- `effect/no-try-catch`

## Opinionated Rules

`effect/prefer-yieldable-error` flags direct failures like this:

```ts
yield * Effect.fail(new DomainError({ message }));
```

Prefer yieldable errors:

```ts
yield * new DomainError({ message });
```

`effect/prefer-tagged-constructor` flags bare tagged object construction:

```ts
const state = { _tag: "Idle" };
```

Prefer constructors:

```ts
const State = Data.taggedEnum<State>();
const state = State.Idle();
```

`effect/prefer-schema-tagged-error-class` flags `Data.TaggedError`. Prefer `Schema.TaggedErrorClass` for domain errors.

`effect/prefer-effect-fn` flags reusable functions that return `Effect.gen(...)`. Prefer `Effect.fn("Domain.method")` or `Effect.fnUntraced(...)`.

`effect/prefer-match-validation` flags validation-style `if` ladders that return `Effect.fail(new DomainError(...))` and end in `Effect.void`. Prefer `Match.type(...).pipe(...)` decision tables.

`effect/prefer-yieldable-error-in-match` flags `Match.when(..., () => Effect.fail(new DomainError(...)))`. Prefer `Match.when(..., () => new DomainError(...))` and yield the matcher result inside `Effect.fn` / `Effect.gen`.

`effect/no-as-effect-method-reference` flags unbound `.asEffect` method references. Prefer returning the yieldable error directly from `Match` handlers.

`effect/no-try-catch` flags `try` statements. Prefer `Effect.try`, `Effect.tryPromise`, `Effect.catch*`, or typed failures.

Rules ported from executor patterns also flag raw JavaScript error handling (`throw`, built-in `Error`, `Promise.reject`, `.catch`, `instanceof Error`, unknown `.message`), broad TypeScript bypasses (`@ts-nocheck`), ad hoc parsing/probing (`JSON.parse`, `Reflect.get`, string `in` checks), Effect escape hatches (`die`/`orDie`), and direct `vitest` imports.
