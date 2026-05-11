# effect-rules

Oxlint rules for Effect TypeScript projects that turn team conventions into fast, local feedback.

These rules focus on the Effect mistakes that usually survive typechecking: untyped error channels, unsafe boundary parsing, hidden dependency gaps, test runners that bypass Effect, and v4 APIs that no longer exist.

> Opinionated: this is what I think is best for Effect codebases. I might be wrong.

## Why Use This

| Benefit | What the rules catch | Example rules |
| --- | --- | --- |
| Keep failures typed | Raw throws, generic `Error`, `Promise.reject`, swallowed failures, `die` / `orDie` escape hatches | `no-raw-throw`, `no-built-in-error-constructor`, `no-promise-reject`, `no-effect-ignore` |
| Make unsafe boundaries explicit | `any`, casts, non-null assertions, unchecked JSON, ad hoc shape probing, skipped validation | `no-explicit-any`, `no-type-casting`, `no-json-parse`, `no-disable-validation` |
| Protect Effect architecture | Optional services, nested layer wiring, direct fetch, manual service tags, unvalidated SQL decoding | `no-service-option`, `prefer-context-service`, `no-nested-layer-provide`, `no-direct-fetch` |
| Standardize Effect style | Yieldable errors, `Effect.fn`, `Match` decision tables, constructors for tagged values | `prefer-yieldable-error`, `prefer-effect-fn`, `prefer-match-validation`, `prefer-tagged-constructor` |
| Make tests run like production Effects | Direct `vitest` imports, manual runners, manual layer builds, `expect` instead of Effect assertions | `prefer-effect-vitest`, `no-effect-run-in-tests`, `no-vitest-import`, `prefer-effect-vitest-assert` |
| Stay on supported Effect v4 APIs | Removed or renamed APIs such as `Effect.async`, `zipRight`, `timeoutFail`, `catchIf` | `no-unsupported-effect-api` |

## Install

```sh
bun add -d effect-rules oxlint
```

## Usage

Add the plugin to `.oxlintrc.json` and enable the rules you want.

```json
{
  "jsPlugins": ["effect-rules"],
  "rules": {
    "effect/no-explicit-any": "error",
    "effect/no-type-casting": "error",
    "effect/no-non-null-assertion": "error",
    "effect/no-raw-throw": "error",
    "effect/prefer-yieldable-error": "warn",
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

## Recommended Starting Set

Start with the rules that prevent the highest-cost bugs first.

```json
{
  "rules": {
    "effect/no-explicit-any": "error",
    "effect/no-type-casting": "error",
    "effect/no-non-null-assertion": "error",
    "effect/no-ts-nocheck": "error",
    "effect/no-disable-validation": "error",
    "effect/no-raw-throw": "error",
    "effect/no-built-in-error-constructor": "error",
    "effect/no-effect-fail-new-error": "error",
    "effect/no-promise-reject": "error",
    "effect/no-promise-catch": "error",
    "effect/no-effect-ignore": "error",
    "effect/no-silent-error-swallow": "error",
    "effect/no-json-parse": "error",
    "effect/no-unknown-shape-probing": "error",
    "effect/no-unsupported-effect-api": "error"
  }
}
```

Then add style and architecture rules as teams converge on the conventions.

## Rule Groups

### Type Safety

| Rule | Benefit |
| --- | --- |
| `effect/no-explicit-any` | Keeps unknown data honest until it is narrowed or decoded. |
| `effect/no-type-casting` | Prevents papering over mismatched types with assertions. |
| `effect/no-non-null-assertion` | Makes absence explicit with `Option` or validation. |
| `effect/no-ts-nocheck` | Stops entire files from opting out of type safety. |
| `effect/no-disable-validation` | Keeps schemas as runtime contracts, not documentation. |
| `effect/no-sql-type-parameter` | Pushes SQL results through Schema-backed decoding. |
| `effect/prefer-option-from-nullable` | Replaces hand-written null checks with one canonical constructor. |

### Effect Error Handling

| Rule | Benefit |
| --- | --- |
| `effect/no-raw-throw` | Keeps domain failures in the Effect error channel. |
| `effect/no-try-catch` | Moves exception capture into typed Effect constructors and handlers. |
| `effect/no-built-in-error-constructor` | Avoids opaque `Error` values in domain code. |
| `effect/no-effect-fail-new-error` | Requires typed failures instead of `Effect.fail(new Error(...))`. |
| `effect/prefer-schema-tagged-error-class` | Standardizes domain errors on `Schema.TaggedErrorClass`. |
| `effect/prefer-yieldable-error` | Removes noisy `Effect.fail(new DomainError(...))` in generators. |
| `effect/prefer-yieldable-error-in-match` | Keeps `Match` handlers returning domain errors, not nested Effects. |
| `effect/no-effect-ignore` | Forces explicit recovery or propagation. |
| `effect/no-effect-catchallcause` | Avoids catching defects as recoverable errors. |
| `effect/no-effect-escape-hatch` | Preserves typed failures instead of collapsing them into defects. |
| `effect/no-silent-error-swallow` | Catches `catch*` handlers that erase failures with `Effect.void`. |
| `effect/no-instanceof-error` | Encourages tagged-error handling instead of runtime class checks. |
| `effect/no-unknown-error-message` | Stops lossy unknown-error stringification. |
| `effect/no-promise-catch` | Models async failures with Effect instead of Promise chains. |
| `effect/no-promise-reject` | Keeps failures in Effect constructors and `Effect.tryPromise`. |

### Effect Architecture

| Rule | Benefit |
| --- | --- |
| `effect/prefer-context-service` | Standardizes dependency definitions on `Context.Service`. |
| `effect/prefer-inline-context-service-shape` | Keeps service shape, config input, and layer construction local. |
| `effect/no-service-option` | Makes required dependencies impossible to silently omit. |
| `effect/no-nested-layer-provide` | Keeps layer graphs flatter and easier to inspect. |
| `effect/no-unnecessary-effect-tx` | Reserves `Effect.tx` for real STM transaction boundaries. |
| `effect/no-direct-fetch` | Pushes HTTP through typed Effect clients or adapters. |
| `effect/no-inline-schema-compile` | Hoists Schema compilation so hot paths do not rebuild decoders. |
| `effect/no-localstorage` | Blocks fragile auth or secret state in browser storage. |

### Data Modeling And Control Flow

| Rule | Benefit |
| --- | --- |
| `effect/prefer-tagged-constructor` | Centralizes tagged value creation behind constructors. |
| `effect/prefer-data-tagged-enum` | Makes tagged unions consistent and constructor-backed. |
| `effect/no-manual-tag-check` | Replaces brittle `_tag` probing with Effect and Predicate helpers. |
| `effect/prefer-match-validation` | Turns validation ladders into readable decision tables. |
| `effect/prefer-match-value` | Turns return-only string switches into exhaustive `Match` mappings. |
| `effect/no-void-expression` | Prevents accidental value discard through `void`. |
| `effect/no-json-parse` | Requires Schema decoding for JSON boundaries. |
| `effect/no-unknown-shape-probing` | Replaces ad hoc probing with Schema or named typed guards. |

### Effect Function Style

| Rule | Benefit |
| --- | --- |
| `effect/prefer-effect-fn` | Names reusable Effect functions and improves traces. |
| `effect/no-effect-fn-immediate-invocation` | Avoids `Effect.fn(...)(...)()` wrappers by putting params on the generator. |
| `effect/no-as-effect-method-reference` | Avoids unbound `.asEffect` references in Match handlers. |
| `effect/no-unsupported-effect-api` | Catches APIs unavailable in Effect v4 / effect-smol. |

### Effect Tests

| Rule | Benefit |
| --- | --- |
| `effect/no-vitest-import` | Keeps test helpers on `@effect/vitest`. |
| `effect/prefer-effect-vitest` | Uses `it.effect(...)` for Effect tests. |
| `effect/prefer-effect-vitest-assert` | Uses Effect-aware `assert` instead of `expect`. |
| `effect/no-effect-run-in-tests` | Avoids manually running Effects in test bodies. |
| `effect/no-manual-layer-build-in-tests` | Uses test layers through Effect test helpers instead of manual builds. |

## Examples

### Typed Failures

```ts
// flagged
yield * Effect.fail(new DomainError({ message }));

// preferred
yield * new DomainError({ message });
```

### Tagged Constructors

```ts
// flagged
const state = { _tag: "Idle" };

// preferred
const State = Data.taggedEnum<State>();
const state = State.Idle();
```

### Tagged Unions

```ts
// flagged
export type AuthHttpError =
  | { readonly _tag: "Unauthorized" }
  | { readonly _tag: "BadRequest"; readonly reason: string };

// preferred
export type AuthHttpError = Data.TaggedEnum<{
  Unauthorized: {};
  BadRequest: { readonly reason: string };
}>;

export const AuthHttpError = Data.taggedEnum<AuthHttpError>();
```

### Match Validation

```ts
// flagged
if (input.name.length === 0) {
  return Effect.fail(new EmptyNameError());
}

// preferred
const validate = Match.type<Input>().pipe(
  Match.when({ name: "" }, () => new EmptyNameError()),
  Match.orElse(() => Effect.void),
);
```

## Development

```sh
bun install
bun test
bun run check
```
