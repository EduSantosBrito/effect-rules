import { definePlugin, defineRule, type Ranged } from "@oxlint/plugins";

type Node = Ranged & {
  readonly type?: unknown;
  readonly name?: unknown;
  readonly value?: unknown;
  readonly operator?: unknown;
  readonly object?: unknown;
  readonly property?: unknown;
  readonly callee?: unknown;
  readonly arguments?: ReadonlyArray<unknown>;
  readonly key?: unknown;
  readonly optional?: unknown;
  readonly source?: unknown;
  readonly specifiers?: ReadonlyArray<unknown>;
  readonly left?: unknown;
  readonly right?: unknown;
  readonly consequent?: unknown;
  readonly alternate?: unknown;
  readonly test?: unknown;
  readonly body?: unknown;
  readonly expression?: unknown;
  readonly typeAnnotation?: unknown;
  readonly typeArguments?: unknown;
  readonly typeParameters?: unknown;
  readonly parent?: unknown;
  readonly properties?: ReadonlyArray<unknown>;
  readonly declaration?: unknown;
  readonly init?: unknown;
  readonly id?: unknown;
  readonly argument?: unknown;
  readonly tag?: unknown;
  readonly imported?: unknown;
  readonly params?: ReadonlyArray<unknown>;
  readonly delegate?: unknown;
  readonly types?: ReadonlyArray<unknown>;
  readonly literal?: unknown;
  readonly members?: ReadonlyArray<unknown>;
  readonly declarations?: ReadonlyArray<unknown>;
  readonly cases?: ReadonlyArray<unknown>;
  readonly discriminant?: unknown;
  readonly superClass?: unknown;
  readonly static?: unknown;
  readonly returnType?: unknown;
  readonly typeName?: unknown;
  readonly exprName?: unknown;
};

const isRanged = (value: unknown): value is Ranged =>
  typeof value === "object" && value !== null && "range" in value;

const asNode = (value: unknown): Node | undefined => {
  if (typeof value !== "object" || value === null || !("type" in value)) return undefined;
  if (typeof value.type !== "string" || !isRanged(value)) return undefined;
  return value;
};

const isIdentifier = (value: unknown, name?: string): boolean => {
  const node = asNode(value);
  return (
    node?.type === "Identifier" &&
    typeof node.name === "string" &&
    (name === undefined || node.name === name)
  );
};

const identifierName = (value: unknown): string | undefined => {
  const node = asNode(value);
  return node?.type === "Identifier" && typeof node.name === "string" ? node.name : undefined;
};

const propertyName = (value: unknown): string | undefined => {
  const node = asNode(value);
  if (node?.type === "Identifier" && typeof node.name === "string") return node.name;
  if (node?.type === "PrivateIdentifier" && typeof node.name === "string") return node.name;
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  return undefined;
};

const literalValue = (value: unknown): unknown => asNode(value)?.value;

const isMember = (value: unknown, objectName: string, memberName: string): boolean => {
  const node = asNode(value);
  return (
    node?.type === "MemberExpression" &&
    isIdentifier(node.object, objectName) &&
    propertyName(node.property) === memberName
  );
};

const isEffectMember = (value: unknown, memberName: string): boolean =>
  isMember(value, "Effect", memberName);

const isEffectVoid = (value: unknown): boolean =>
  isEffectMember(value, "void") || isEffectMember(value, "unit");

const isEffectRunner = (value: unknown): boolean => {
  const method = propertyName(asNode(value)?.property);
  if (
    method !== "runPromise" &&
    method !== "runPromiseExit" &&
    method !== "runSync" &&
    method !== "runSyncExit"
  ) {
    return false;
  }

  const node = asNode(value);
  return node?.type === "MemberExpression";
};

const isCallToMember = (value: unknown, objectName: string, memberName: string): boolean => {
  const node = asNode(value);
  return node?.type === "CallExpression" && isMember(node.callee, objectName, memberName);
};

const isNewExpression = (value: unknown): boolean => asNode(value)?.type === "NewExpression";

const isFunction = (value: unknown): boolean => {
  const node = asNode(value);
  return (
    node?.type === "ArrowFunctionExpression" ||
    node?.type === "FunctionExpression" ||
    node?.type === "FunctionDeclaration"
  );
};

const isVoidReturningFunction = (value: unknown): boolean => {
  const node = asNode(value);
  if (node?.type !== "ArrowFunctionExpression" && node?.type !== "FunctionExpression") return false;
  if (isEffectVoid(node.body)) return true;

  const body = asNode(node.body);
  if (body?.type !== "BlockStatement" || !Array.isArray(body.body) || body.body.length !== 1) {
    return false;
  }

  const statement = asNode(body.body[0]);
  return statement?.type === "ReturnStatement" && isEffectVoid(statement.argument);
};

const isNullCheck = (value: unknown): Node | undefined => {
  const node = asNode(value);
  return node?.type === "BinaryExpression" && (node.operator === "!==" || node.operator === "!=")
    ? node
    : undefined;
};

const sameExpression = (left: unknown, right: unknown): boolean => {
  const leftNode = asNode(left);
  const rightNode = asNode(right);
  if (leftNode?.type === "Identifier" && rightNode?.type === "Identifier") {
    return leftNode.name === rightNode.name;
  }
  return left === right;
};

const checkedNullTarget = (value: unknown): unknown => {
  const node = isNullCheck(value);
  if (node === undefined) return undefined;
  if (literalValue(node.right) === null) return node.left;
  if (literalValue(node.left) === null) return node.right;
  return undefined;
};

const isOptionSomeCall = (value: unknown, target: unknown): boolean => {
  const node = asNode(value);
  return (
    node?.type === "CallExpression" &&
    isMember(node.callee, "Option", "some") &&
    Array.isArray(node.arguments) &&
    node.arguments.length === 1 &&
    sameExpression(node.arguments[0], target)
  );
};

const isOptionNoneCall = (value: unknown): boolean => {
  const node = asNode(value);
  return node?.type === "CallExpression" && isMember(node.callee, "Option", "none");
};

const typeParameterAt = (value: unknown, index: number): Node | undefined => {
  const node = asNode(value);
  const typeParameters = asNode(node?.typeParameters) ?? asNode(node?.typeArguments);
  if (typeParameters === undefined || !Array.isArray(typeParameters.params)) return undefined;
  return asNode(typeParameters.params[index]);
};

const typeReferenceName = (value: unknown): string | undefined => {
  const node = asNode(value);
  if (node?.type !== "TSTypeReference") return undefined;
  return typeQueryName(node.typeName);
};

const typeQueryName = (value: unknown): string | undefined => {
  const node = asNode(value);
  if (node === undefined) return undefined;
  if (node.type === "Identifier" && typeof node.name === "string") return node.name;
  if (node.type === "TSQualifiedName") {
    const left = typeQueryName(node.left);
    const right = typeQueryName(node.right);
    if (left === undefined || right === undefined) return undefined;
    return `${left}.${right}`;
  }
  return undefined;
};

const isTypeofInputType = (value: unknown, inputName: string): boolean => {
  const node = asNode(value);
  if (node?.type !== "TSTypeQuery") return false;
  return typeQueryName(node.exprName) === `${inputName}.Type`;
};

const typeAnnotation = (value: unknown): Node | undefined => {
  const annotation = asNode(asNode(value)?.typeAnnotation);
  return annotation?.type === "TSTypeAnnotation" ? asNode(annotation.typeAnnotation) : undefined;
};

const hasCallableOrEffectMember = (serviceShape: Node): boolean => {
  if (!Array.isArray(serviceShape.members)) return false;
  return serviceShape.members.some((memberValue) => {
    const member = asNode(memberValue);
    if (member?.type !== "TSPropertySignature") return false;
    const annotation = typeAnnotation(member);
    if (annotation?.type === "TSFunctionType") return true;
    return typeReferenceName(annotation) === "Effect.Effect";
  });
};

const expressionName = (value: unknown): string | undefined => {
  const node = asNode(value);
  if (node === undefined) return undefined;
  if (node.type === "Identifier" && typeof node.name === "string") return node.name;
  if (node.type !== "MemberExpression") return undefined;
  const objectName = expressionName(node.object);
  const memberName = propertyName(node.property);
  if (objectName === undefined || memberName === undefined) return undefined;
  return `${objectName}.${memberName}`;
};

const isInputMakeCall = (value: unknown, inputName: string, parameterName: string): boolean => {
  const node = asNode(value);
  return (
    node?.type === "CallExpression" &&
    expressionName(node.callee) === `${inputName}.make` &&
    Array.isArray(node.arguments) &&
    node.arguments.length === 1 &&
    isIdentifier(node.arguments[0], parameterName)
  );
};

const isLayerSucceedInputMake = (
  value: unknown,
  serviceName: string,
  inputName: string,
  parameterName: string,
): boolean => {
  const outer = asNode(value);
  const inner = asNode(outer?.callee);
  return (
    outer?.type === "CallExpression" &&
    Array.isArray(outer.arguments) &&
    outer.arguments.length === 1 &&
    isInputMakeCall(outer.arguments[0], inputName, parameterName) &&
    inner?.type === "CallExpression" &&
    isMember(inner.callee, "Layer", "succeed") &&
    Array.isArray(inner.arguments) &&
    inner.arguments.length === 1 &&
    isIdentifier(inner.arguments[0], serviceName)
  );
};

const isConfigDeclaration = (value: unknown, inputName: string, parameterName: string): boolean => {
  const node = asNode(value);
  const declaration = asNode(node?.declaration);
  if (node?.type !== "VariableDeclaration" || declaration !== undefined) return false;
  if (!Array.isArray(node.declarations) || node.declarations.length !== 1) return false;
  const declarator = asNode(node.declarations[0]);
  return (
    declarator?.type === "VariableDeclarator" &&
    isIdentifier(declarator.id, "config") &&
    isInputMakeCall(declarator.init, inputName, parameterName)
  );
};

const objectHasConfigSpread = (value: unknown): boolean => {
  const node = asNode(value);
  return (
    node?.type === "ObjectExpression" &&
    Array.isArray(node.properties) &&
    node.properties.some((property) => {
      const propertyNode = asNode(property);
      return propertyNode?.type === "SpreadElement" && isIdentifier(propertyNode.argument, "config");
    })
  );
};

const isServiceOfConfigObject = (value: unknown, serviceName: string): boolean => {
  const node = asNode(value);
  return (
    node?.type === "CallExpression" &&
    expressionName(node.callee) === `${serviceName}.of` &&
    Array.isArray(node.arguments) &&
    node.arguments.length === 1 &&
    objectHasConfigSpread(node.arguments[0])
  );
};

const isConfigBlockLayer = (
  value: unknown,
  serviceName: string,
  inputName: string,
  parameterName: string,
): boolean => {
  const node = asNode(value);
  if (node?.type !== "BlockStatement" || !Array.isArray(node.body)) return false;
  if (!node.body.some((statement) => isConfigDeclaration(statement, inputName, parameterName))) {
    return false;
  }
  return node.body.some((statementValue) => {
    const statement = asNode(statementValue);
    return (
      statement?.type === "ReturnStatement" && isServiceOfConfigObject(statement.argument, serviceName)
    );
  });
};

const isContextServiceSuperclass = (value: unknown): Node | undefined => {
  const outer = asNode(value);
  const serviceCall = asNode(outer?.callee);
  if (outer?.type !== "CallExpression" || serviceCall?.type !== "CallExpression") return undefined;
  return isContextServiceCall(serviceCall) ? serviceCall : undefined;
};

const isContextServiceCall = (value: unknown): boolean => {
  const node = asNode(value);
  return node?.type === "CallExpression" && isMember(node.callee, "Context", "Service");
};

const contextServiceTag = (value: unknown): string | undefined => {
  const outer = asNode(value);
  if (outer?.type !== "CallExpression" || !Array.isArray(outer.arguments)) return undefined;
  const tag = literalValue(outer.arguments[0]);
  return typeof tag === "string" ? tag : undefined;
};

const staticLayerInitializer = (classDeclaration: Node): Node | undefined => {
  const body = asNode(classDeclaration.body);
  if (body?.type !== "ClassBody" || !Array.isArray(body.body)) return undefined;

  for (const memberValue of body.body) {
    const member = asNode(memberValue);
    if (member?.static !== true || propertyName(member.key) !== "layer") continue;
    if (member.value !== undefined) return asNode(member.value);
  }
  return undefined;
};

const singleParameterName = (value: unknown): string | undefined => {
  const node = asNode(value);
  if (
    (node?.type !== "ArrowFunctionExpression" && node?.type !== "FunctionExpression") ||
    !Array.isArray(node.params) ||
    node.params.length !== 1
  ) {
    return undefined;
  }
  return identifierName(node.params[0]);
};

const hasInputTypeParameter = (value: unknown, inputName: string): boolean => {
  const node = asNode(value);
  if (
    (node?.type !== "ArrowFunctionExpression" && node?.type !== "FunctionExpression") ||
    !Array.isArray(node.params) ||
    node.params.length !== 1
  ) {
    return false;
  }
  return isTypeofInputType(typeAnnotation(node.params[0]), inputName);
};

const isEffectGenCall = (value: unknown): boolean => isCallToMember(value, "Effect", "gen");

const isTransactionalApi = (value: unknown): boolean => {
  const node = asNode(value);
  if (node?.type !== "MemberExpression") return false;
  if (isIdentifier(node.object, "Effect")) {
    const name = propertyName(node.property);
    return name === "txRetry" || name === "Transaction";
  }
  const object = asNode(node.object);
  return (
    object?.type === "Identifier" && typeof object.name === "string" && /^Tx[A-Z]/.test(object.name)
  );
};

const containsTransactionalApi = (value: unknown, seen = new Set<unknown>()): boolean => {
  if (typeof value !== "object" || value === null || seen.has(value)) return false;
  seen.add(value);

  const node = asNode(value);
  if (node !== undefined && isTransactionalApi(node)) return true;

  for (const [key, child] of Object.entries(value)) {
    if (key === "parent" || key === "range") continue;
    if (Array.isArray(child)) {
      if (child.some((item) => containsTransactionalApi(item, seen))) return true;
      continue;
    }
    if (containsTransactionalApi(child, seen)) return true;
  }
  return false;
};

const isInspectableTxArgument = (value: unknown): boolean => {
  const node = asNode(value);
  if (node?.type !== "CallExpression") return false;
  if (isEffectGenCall(node)) return true;
  return isIdentifier(asNode(node.callee)?.object, "Effect");
};

const isEffectFailNewExpression = (value: unknown): boolean => {
  const node = asNode(value);
  return (
    node?.type === "CallExpression" &&
    isEffectMember(node.callee, "fail") &&
    Array.isArray(node.arguments) &&
    isNewExpression(node.arguments[0])
  );
};

const returnsEffectGen = (value: unknown): boolean => {
  const node = asNode(value);
  if (node?.type !== "ArrowFunctionExpression" && node?.type !== "FunctionExpression") return false;
  if (isEffectGenCall(node.body)) return true;

  const body = asNode(node.body);
  if (body?.type !== "BlockStatement" || !Array.isArray(body.body)) return false;

  for (const statementValue of body.body) {
    const statement = asNode(statementValue);
    if (statement?.type === "ReturnStatement" && isEffectGenCall(statement.argument)) return true;
  }
  return false;
};

const isDataTaggedErrorCall = (value: unknown): boolean =>
  isCallToMember(value, "Data", "TaggedError");

const isMatchWhenCall = (value: unknown): boolean => {
  const node = asNode(value);
  if (node?.type !== "CallExpression") return false;
  return (
    isMember(node.callee, "Match", "when") ||
    isMember(node.callee, "Match", "whenOr") ||
    isMember(node.callee, "Match", "whenAnd")
  );
};

const isReturnEffectFailNewStatement = (value: unknown): boolean => {
  const node = asNode(value);
  return node?.type === "ReturnStatement" && isEffectFailNewExpression(node.argument);
};

const returnsEffectFailNew = (value: unknown): boolean => {
  const node = asNode(value);
  if (node?.type !== "ArrowFunctionExpression" && node?.type !== "FunctionExpression") return false;
  if (isEffectFailNewExpression(node.body)) return true;
  const body = asNode(node.body);
  if (body?.type !== "BlockStatement" || !Array.isArray(body.body)) return false;
  return body.body.some(isReturnEffectFailNewStatement);
};

const isEffectFnCall = (value: unknown): boolean => {
  const node = asNode(value);
  return (
    node?.type === "CallExpression" &&
    (isEffectMember(node.callee, "fn") || isEffectMember(node.callee, "fnUntraced"))
  );
};

const isEffectFnImplementationCall = (value: unknown): boolean => {
  const node = asNode(value);
  return node?.type === "CallExpression" && isEffectFnCall(node.callee);
};

const ifConsequentReturnsEffectFailNew = (value: unknown): boolean => {
  const node = asNode(value);
  if (node?.type !== "IfStatement") return false;
  if (isReturnEffectFailNewStatement(node.consequent)) return true;
  const consequent = asNode(node.consequent);
  return (
    consequent?.type === "BlockStatement" &&
    Array.isArray(consequent.body) &&
    consequent.body.some(isReturnEffectFailNewStatement)
  );
};

const returnsEffectVoid = (value: unknown): boolean => {
  const node = asNode(value);
  return node?.type === "ReturnStatement" && isEffectVoid(node.argument);
};

const isValidationFailureLadder = (value: unknown): boolean => {
  const node = asNode(value);
  if (node?.type !== "ArrowFunctionExpression" && node?.type !== "FunctionExpression") return false;
  const body = asNode(node.body);
  if (body?.type !== "BlockStatement" || !Array.isArray(body.body)) return false;

  let failureBranches = 0;
  let hasSuccessReturn = false;
  for (const statement of body.body) {
    if (ifConsequentReturnsEffectFailNew(statement)) failureBranches++;
    if (returnsEffectVoid(statement)) hasSuccessReturn = true;
  }
  return failureBranches >= 2 && hasSuccessReturn;
};

const schemaCompilerMethods = new Set([
  "is",
  "asserts",
  "decodeEffect",
  "decodeExit",
  "decodeOption",
  "decodePromise",
  "decodeSync",
  "decodeUnknownExit",
  "decodeUnknownEffect",
  "decodeUnknownOption",
  "decodeUnknownPromise",
  "decodeUnknownSync",
  "encodeExit",
  "encodeEffect",
  "encodeOption",
  "encodePromise",
  "encodeSync",
  "encodeUnknownExit",
  "encodeUnknownEffect",
  "encodeUnknownOption",
  "encodeUnknownPromise",
  "encodeUnknownSync",
]);

const schemaCompilerMethod = (value: unknown): string | undefined => {
  const node = asNode(value);
  if (node?.type !== "MemberExpression" || !isIdentifier(node.object, "Schema")) return undefined;
  const method = propertyName(node.property);
  return method !== undefined && schemaCompilerMethods.has(method) ? method : undefined;
};

const builtInErrorConstructors = new Set([
  "AggregateError",
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
]);

const isBuiltInErrorConstructor = (value: unknown): boolean => {
  const node = asNode(value);
  return node?.type === "Identifier" && typeof node.name === "string"
    ? builtInErrorConstructors.has(node.name)
    : false;
};

const isBuiltInErrorNewExpression = (value: unknown): boolean => {
  const node = asNode(value);
  return node?.type === "NewExpression" && isBuiltInErrorConstructor(node.callee);
};

const hasParentEffectFailCall = (value: unknown): boolean => {
  const node = asNode(value);
  const parent = asNode(node?.parent);
  return parent?.type === "CallExpression" && isEffectMember(parent.callee, "fail");
};

const hasParentThrowStatement = (value: unknown): boolean => {
  const node = asNode(value);
  return asNode(node?.parent)?.type === "ThrowStatement";
};

const isPromiseReject = (value: unknown): boolean => isMember(value, "Promise", "reject");

const isPromiseConstructor = (value: unknown): boolean => {
  const node = asNode(value);
  return node?.type === "NewExpression" && isIdentifier(node.callee, "Promise");
};

const isErrorLikeIdentifier = (value: unknown): boolean => {
  const node = asNode(value);
  if (node?.type !== "Identifier" || typeof node.name !== "string") return false;
  return ["cause", "e", "err", "error", "reason", "unknownError"].includes(node.name);
};

const isTagProperty = (value: unknown): boolean => propertyName(value) === "_tag";

const isStringLiteralType = (value: unknown): boolean => {
  const node = asNode(value);
  return node?.type === "TSLiteralType" && typeof literalValue(node.literal) === "string";
};

const isTagPropertySignature = (value: unknown): boolean => {
  const node = asNode(value);
  if (node?.type !== "TSPropertySignature" || !isTagProperty(node.key)) return false;
  const annotation = asNode(node.typeAnnotation);
  return annotation?.type === "TSTypeAnnotation" && isStringLiteralType(annotation.typeAnnotation);
};

const isTaggedTypeLiteral = (value: unknown): boolean => {
  const node = asNode(value);
  return (
    node?.type === "TSTypeLiteral" &&
    Array.isArray(node.members) &&
    node.members.some(isTagPropertySignature)
  );
};

const isStringCase = (value: unknown): boolean => {
  const node = asNode(value);
  return node?.type === "SwitchCase" && typeof literalValue(node.test) === "string";
};

const isReturnStatement = (value: unknown): boolean => asNode(value)?.type === "ReturnStatement";

const isReturnOnlyStringSwitch = (value: unknown): boolean => {
  const node = asNode(value);
  return (
    node?.type === "SwitchStatement" &&
    Array.isArray(node.cases) &&
    node.cases.length >= 2 &&
    node.cases.every((caseValue) => {
      const switchCase = asNode(caseValue);
      if (switchCase === undefined) return false;
      return (
        isStringCase(switchCase) &&
        Array.isArray(switchCase.consequent) &&
        switchCase.consequent.length === 1 &&
        switchCase.consequent.every(isReturnStatement)
      );
    })
  );
};

const isTaggedUnionType = (value: unknown): boolean => {
  const node = asNode(value);
  return (
    node?.type === "TSUnionType" &&
    Array.isArray(node.types) &&
    node.types.length >= 2 &&
    node.types.every(isTaggedTypeLiteral)
  );
};

const unsupportedEffectApiMessages = new Map([
  ["async", "Effect.async is unavailable in Effect v4/effect-smol. Use Effect.callback."],
  [
    "zipRight",
    "Effect.zipRight is unavailable in Effect v4/effect-smol. Use Effect.andThen or Effect.gen.",
  ],
  [
    "timeoutFail",
    "Effect.timeoutFail is unavailable in Effect v4/effect-smol. Use Effect.timeoutOrElse or Effect.timeoutOption.",
  ],
  [
    "catchIf",
    "Effect.catchIf is unavailable in Effect v4/effect-smol. Use Effect.catchAll with a predicate branch or catchTag/catchTags for tagged errors.",
  ],
]);

const noExplicitAny = defineRule({
  meta: { type: "problem", docs: { description: "Disallow explicit any." } },
  createOnce(context) {
    const report = (node: Ranged) => {
      context.report({
        node,
        message: "Do not use any. Use unknown, generics, or a precise type.",
      });
    };

    return { TSAnyKeyword: report };
  },
});

const noTypeCasting = defineRule({
  meta: { type: "problem", docs: { description: "Disallow TypeScript type assertions." } },
  createOnce(context) {
    const report = (node: Ranged) => {
      context.report({
        node,
        message:
          "Do not cast with type assertions. Parse at boundaries or model the type precisely.",
      });
    };

    return { TSAsExpression: report, TSTypeAssertion: report };
  },
});

const noNonNullAssertion = defineRule({
  meta: { type: "problem", docs: { description: "Disallow non-null assertions." } },
  createOnce(context) {
    return {
      TSNonNullExpression(node) {
        context.report({
          node,
          message:
            "Do not use non-null assertions. Represent absence with Option or validate first.",
        });
      },
    };
  },
});

const noTsNocheck = defineRule({
  meta: { type: "problem", docs: { description: "Disallow @ts-nocheck directives." } },
  createOnce(context) {
    return {
      Program(node) {
        if (!/@ts-nocheck\b/.test(context.sourceCode.text)) return;
        context.report({
          node,
          message: "Do not use @ts-nocheck. Fix the types or narrow the unsafe boundary.",
        });
      },
    };
  },
});

const noDisableValidation = defineRule({
  meta: { type: "problem", docs: { description: "Disallow disableValidation: true." } },
  createOnce(context) {
    return {
      Property(node) {
        if (propertyName(node.key) === "disableValidation" && literalValue(node.value) === true) {
          context.report({
            node,
            message: "Do not use disableValidation: true. Fix the schema or input.",
          });
        }
      },
    };
  },
});

const noSqlTypeParameter = defineRule({
  meta: { type: "problem", docs: { description: "Disallow sql<Type>`...`." } },
  createOnce(context) {
    return {
      TaggedTemplateExpression(node) {
        const template = asNode(node);
        if (
          (template?.typeArguments === undefined && template?.typeParameters === undefined) ||
          !isIdentifier(template.tag, "sql")
        ) {
          return;
        }
        context.report({
          node,
          message:
            "Do not use sql<Type>`...`. Use Schema-backed SQL decoding for runtime validation.",
        });
      },
    };
  },
});

const preferOptionFromNullable = defineRule({
  meta: { type: "suggestion", docs: { description: "Prefer Option.fromNullable." } },
  createOnce(context) {
    return {
      ConditionalExpression(node) {
        const target = checkedNullTarget(node.test);
        if (target === undefined) return;

        if (isOptionSomeCall(node.consequent, target) && isOptionNoneCall(node.alternate)) {
          context.report({
            node,
            message: "Use Option.fromNullable(...) instead of Option.some/none ternary.",
          });
        }
      },
    };
  },
});

const preferInlineContextServiceShape = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "Prefer inline Context.Service shapes with Option for absence." },
  },
  createOnce(context) {
    const checkServiceShape = (serviceShape: Node): void => {
      if (serviceShape.type !== "TSTypeLiteral") {
        if (serviceShape.type !== "TSTypeReference") return;
        context.report({
          node: serviceShape,
          message: "Inline the Context.Service shape instead of referencing an interface.",
        });
        return;
      }

      if (!Array.isArray(serviceShape.members)) return;
      for (const memberValue of serviceShape.members) {
        const member = asNode(memberValue);
        if (member?.type !== "TSPropertySignature" || member.optional !== true) continue;
        context.report({
          node: member,
          message: "Use Option for optional Context.Service fields instead of optional properties.",
        });
      }
    };

    return {
      ClassDeclaration(node) {
        const className = identifierName(node.id);
        if (className === undefined) return;

        const serviceCall = isContextServiceSuperclass(node.superClass);
        if (serviceCall === undefined) return;

        const serviceSelf = typeParameterAt(serviceCall, 0);
        if (typeReferenceName(serviceSelf) !== className) {
          context.report({
            node: serviceSelf ?? node,
            message: "Use the service class as the first Context.Service type parameter.",
          });
        }

        const tag = contextServiceTag(node.superClass);
        if (tag !== undefined && tag !== className) {
          context.report({
            node,
            message: "Use the service class name as the Context.Service tag.",
          });
        }

        const serviceShape = typeParameterAt(serviceCall, 1);
        if (serviceShape === undefined) return;
        checkServiceShape(serviceShape);
        if (serviceShape.type !== "TSTypeLiteral") return;

        const layer = staticLayerInitializer(node);
        if (layer === undefined) return;

        const inputName = `${className}Input`;
        const parameterName = singleParameterName(layer);
        if (parameterName === undefined || !hasInputTypeParameter(layer, inputName)) {
          context.report({
            node: layer,
            message: `Type the service layer input as typeof ${inputName}.Type.`,
          });
          return;
        }

        const layerBody = asNode(layer.body);
        if (hasCallableOrEffectMember(serviceShape)) {
          if (!isConfigBlockLayer(layerBody, className, inputName, parameterName)) {
            context.report({
              node: layer,
              message: `Build config with ${inputName}.make(input) and return ${className}.of({ ...config, ...methods }).`,
            });
          }
          return;
        }

        if (!isLayerSucceedInputMake(layerBody, className, inputName, parameterName)) {
          context.report({
            node: layer,
            message: `Pure config services should return Layer.succeed(${className})(${inputName}.make(input)).`,
          });
        }
      },
      CallExpression(node) {
        if (!isContextServiceCall(node)) return;
        const serviceShape = typeParameterAt(node, 1);
        if (serviceShape === undefined) return;
        checkServiceShape(serviceShape);
      },
    };
  },
});

const noEffectIgnore = defineRule({
  meta: { type: "problem", docs: { description: "Disallow Effect.ignore." } },
  createOnce(context) {
    return {
      MemberExpression(node) {
        if (isEffectMember(node, "ignore")) {
          context.report({
            node,
            message: "Do not use Effect.ignore. Handle or propagate errors explicitly.",
          });
        }
      },
    };
  },
});

const noEffectCatchAllCause = defineRule({
  meta: { type: "problem", docs: { description: "Disallow Effect.catchAllCause." } },
  createOnce(context) {
    return {
      MemberExpression(node) {
        if (isEffectMember(node, "catchAllCause")) {
          context.report({
            node,
            message:
              "Do not use Effect.catchAllCause for recoverable errors. Catch expected errors only.",
          });
        }
      },
    };
  },
});

const noEffectEscapeHatch = defineRule({
  meta: { type: "problem", docs: { description: "Disallow Effect die/orDie escape hatches." } },
  createOnce(context) {
    return {
      MemberExpression(node) {
        const name = propertyName(node.property);
        if (name === "die" || name === "dieMessage" || name === "orDie" || name === "orDieWith") {
          if (!isIdentifier(node.object, "Effect")) return;
          context.report({
            node,
            message:
              "Do not collapse typed failures with Effect die/orDie. Preserve the error channel.",
          });
        }
      },
    };
  },
});

const noUnsupportedEffectApi = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Disallow Effect APIs unavailable in Effect v4/effect-smol." },
  },
  createOnce(context) {
    return {
      MemberExpression(node) {
        if (!isIdentifier(node.object, "Effect")) return;
        const name = propertyName(node.property);
        if (name === undefined) return;
        const message = unsupportedEffectApiMessages.get(name);
        if (message === undefined) return;
        context.report({ node, message });
      },
    };
  },
});

const noUnnecessaryEffectTx = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "Disallow Effect.tx without transactional Effect APIs." },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (!isEffectMember(node.callee, "tx")) return;
        if (!Array.isArray(node.arguments) || node.arguments.length === 0) return;
        if (!isInspectableTxArgument(node.arguments[0])) return;
        if (containsTransactionalApi(node.arguments[0])) return;
        context.report({
          node,
          message:
            "Use Effect.tx only around transactional Tx* operations, Effect.txRetry, or Effect.Transaction.",
        });
      },
    };
  },
});

const noSilentErrorSwallow = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Disallow catch handlers returning Effect.void." },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        const catchName = propertyName(asNode(node.callee)?.property);
        if (!isIdentifier(asNode(node.callee)?.object, "Effect")) return;

        if (
          catchName === "catchAll" &&
          Array.isArray(node.arguments) &&
          isVoidReturningFunction(node.arguments[0])
        ) {
          const handler = node.arguments[0];
          if (isRanged(handler)) {
            context.report({ node: handler, message: "Do not swallow errors with Effect.void." });
          }
        }

        if (
          catchName === "catchTag" &&
          Array.isArray(node.arguments) &&
          isVoidReturningFunction(node.arguments[1])
        ) {
          const handler = node.arguments[1];
          if (isRanged(handler)) {
            context.report({ node: handler, message: "Do not swallow errors with Effect.void." });
          }
        }

        if (catchName !== "catchTags" || !Array.isArray(node.arguments)) return;
        const handlers = asNode(node.arguments[0]);
        if (handlers?.type !== "ObjectExpression" || !Array.isArray(handlers.properties)) return;

        for (const property of handlers.properties) {
          const handler = asNode(property)?.value;
          if (isVoidReturningFunction(handler) && isRanged(handler)) {
            context.report({ node: handler, message: "Do not swallow errors with Effect.void." });
          }
        }
      },
    };
  },
});

const noServiceOption = defineRule({
  meta: { type: "problem", docs: { description: "Disallow Effect.serviceOption." } },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (isEffectMember(node.callee, "serviceOption")) {
          context.report({
            node,
            message: "Do not use Effect.serviceOption. Require services in context.",
          });
        }
      },
    };
  },
});

const isLayerProvideCall = (value: unknown): boolean => isCallToMember(value, "Layer", "provide");

const noNestedLayerProvide = defineRule({
  meta: { type: "problem", docs: { description: "Disallow nested Layer.provide." } },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (!isLayerProvideCall(node) || !Array.isArray(node.arguments)) return;
        for (const argument of node.arguments) {
          if (isLayerProvideCall(argument)) {
            context.report({
              node: argument,
              message: "Avoid nested Layer.provide. Extract it or use Layer.provideMerge.",
            });
          }
        }
      },
    };
  },
});

const noVoidExpression = defineRule({
  meta: { type: "problem", docs: { description: "Disallow void expressions." } },
  createOnce(context) {
    return {
      UnaryExpression(node) {
        if (node.operator === "void") {
          context.report({
            node,
            message: "Do not use void expressions. Handle or intentionally discard another way.",
          });
        }
      },
    };
  },
});

const noDirectFetch = defineRule({
  meta: { type: "problem", docs: { description: "Disallow direct fetch." } },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (
          isIdentifier(node.callee, "fetch") ||
          isMember(node.callee, "window", "fetch") ||
          isMember(node.callee, "globalThis", "fetch")
        ) {
          context.report({
            node,
            message: "Do not call fetch directly. Use a typed Effect HTTP/client boundary.",
          });
        }
      },
    };
  },
});

const noJsonParse = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Disallow JSON.parse in domain code." },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (!isMember(node.callee, "JSON", "parse")) return;
        context.report({
          node,
          message: "Parse JSON with Effect Schema, e.g. Schema.parseJson or Schema.fromJsonString.",
        });
      },
    };
  },
});

const noUnknownShapeProbing = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Disallow ad hoc unknown object shape probing." },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (!isMember(node.callee, "Reflect", "get")) return;
        context.report({
          node,
          message: "Do not probe unknown shapes. Decode with Schema or a named typed guard.",
        });
      },
      BinaryExpression(node) {
        if (node.operator !== "in" || typeof literalValue(node.left) !== "string") return;
        if (literalValue(node.left) === "_tag") return;
        context.report({
          node,
          message: "Do not probe unknown shapes with string `in` checks. Decode at the boundary.",
        });
      },
    };
  },
});

const noLocalStorage = defineRule({
  meta: { type: "problem", docs: { description: "Disallow localStorage." } },
  createOnce(context) {
    return {
      Identifier(node) {
        if (node.name === "localStorage") {
          context.report({ node, message: "Do not use localStorage for auth state or secrets." });
        }
      },
    };
  },
});

const noManualLayerBuildInTests = defineRule({
  meta: { type: "problem", docs: { description: "Disallow Layer.build in tests." } },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (isMember(node.callee, "Layer", "build")) {
          context.report({
            node,
            message:
              "Avoid manual Layer.build in tests. Prefer it.layer(...) or Effect.provide(layer).",
          });
        }
      },
    };
  },
});

const preferEffectVitest = defineRule({
  meta: { type: "suggestion", docs: { description: "Prefer it.effect for Effect tests." } },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (!isIdentifier(node.callee, "test") && !isIdentifier(node.callee, "it")) return;
        if (!Array.isArray(node.arguments)) return;
        if (isFunction(node.arguments[1])) {
          context.report({ node: node.callee, message: "Prefer it.effect(...) for Effect tests." });
        }
      },
    };
  },
});

const noVitestImport = defineRule({
  meta: { type: "problem", docs: { description: "Prefer @effect/vitest over vitest." } },
  createOnce(context) {
    return {
      ImportDeclaration(node) {
        if (literalValue(node.source) !== "vitest") return;
        context.report({
          node: asNode(node.source) ?? node,
          message: "Import test helpers from @effect/vitest instead of vitest.",
        });
      },
    };
  },
});

const preferEffectVitestAssert = defineRule({
  meta: { type: "suggestion", docs: { description: "Prefer assert from @effect/vitest." } },
  createOnce(context) {
    return {
      ImportDeclaration(node) {
        if (literalValue(node.source) !== "@effect/vitest" || !Array.isArray(node.specifiers))
          return;
        for (const specifier of node.specifiers) {
          const imported = propertyName(asNode(specifier)?.imported);
          if (imported === "expect") {
            context.report({
              node: specifier,
              message: "Prefer assert from @effect/vitest over expect.",
            });
          }
        }
      },
    };
  },
});

const noEffectRunInTests = defineRule({
  meta: { type: "problem", docs: { description: "Disallow manual Effect runners in tests." } },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (!isEffectRunner(node.callee)) return;
        context.report({
          node,
          message: "Use it.effect(...) instead of manually running Effects in tests.",
        });
      },
    };
  },
});

const preferYieldableError = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "Prefer yieldable errors over yield* Effect.fail(new ErrorType())." },
  },
  createOnce(context) {
    return {
      YieldExpression(node) {
        const argument = asNode(node.argument);
        if (!isCallToMember(argument, "Effect", "fail")) return;
        const args = argument?.arguments;
        if (!Array.isArray(args)) return;
        if (isNewExpression(args[0])) {
          if (isBuiltInErrorNewExpression(args[0])) return;
          context.report({
            node,
            message:
              "Use yield* new ErrorType(...) instead of yield* Effect.fail(new ErrorType(...)).",
          });
        }
      },
    };
  },
});

const noEffectFailNewError = defineRule({
  meta: { type: "problem", docs: { description: "Disallow Effect.fail(new Error(...))." } },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (!isEffectMember(node.callee, "fail") || !Array.isArray(node.arguments)) return;
        const failure = asNode(node.arguments[0]);
        if (failure?.type === "NewExpression" && isIdentifier(failure.callee, "Error")) {
          context.report({
            node,
            message: "Do not fail with generic Error. Use a typed Schema.TaggedErrorClass.",
          });
        }
      },
    };
  },
});

const noBuiltInErrorConstructor = defineRule({
  meta: { type: "problem", docs: { description: "Disallow built-in Error constructors." } },
  createOnce(context) {
    const report = (node: Ranged) => {
      context.report({
        node,
        message: "Do not construct built-in Error objects. Use typed tagged errors.",
      });
    };

    return {
      NewExpression(node) {
        if (hasParentEffectFailCall(node) || hasParentThrowStatement(node)) return;
        if (isBuiltInErrorConstructor(node.callee)) report(node);
      },
      CallExpression(node) {
        if (hasParentThrowStatement(node)) return;
        if (isBuiltInErrorConstructor(node.callee)) report(node);
      },
    };
  },
});

const noRawThrow = defineRule({
  meta: { type: "problem", docs: { description: "Disallow throw statements." } },
  createOnce(context) {
    return {
      ThrowStatement(node) {
        context.report({
          node,
          message: "Do not throw from Effect domain code. Return typed Effect failures.",
        });
      },
    };
  },
});

const noInstanceofError = defineRule({
  meta: { type: "problem", docs: { description: "Disallow instanceof Error checks." } },
  createOnce(context) {
    return {
      BinaryExpression(node) {
        if (node.operator !== "instanceof" || !isIdentifier(node.right, "Error")) return;
        context.report({
          node,
          message:
            "Do not use instanceof Error. Preserve typed failures with tagged-error handling.",
        });
      },
    };
  },
});

const noUnknownErrorMessage = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Disallow common unknown-error message extraction patterns." },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (!isIdentifier(node.callee, "String") || !Array.isArray(node.arguments)) return;
        if (!node.arguments.some(isErrorLikeIdentifier)) return;
        context.report({
          node,
          message: "Do not stringify unknown errors. Normalize them into typed failures.",
        });
      },
      MemberExpression(node) {
        if (propertyName(node.property) !== "message" || !isErrorLikeIdentifier(node.object))
          return;
        context.report({
          node,
          message: "Do not read .message from unknown errors. Preserve typed failures.",
        });
      },
      VariableDeclarator(node) {
        const id = asNode(node.id);
        if (id?.type !== "ObjectPattern" || !Array.isArray(id.properties)) return;
        if (!isErrorLikeIdentifier(node.init)) return;
        for (const property of id.properties) {
          const propertyNode = asNode(property);
          if (propertyNode?.type !== "Property" || propertyName(propertyNode.key) !== "message") {
            continue;
          }
          context.report({
            node: propertyNode,
            message: "Do not destructure .message from unknown errors. Preserve typed failures.",
          });
        }
      },
    };
  },
});

const noPromiseCatch = defineRule({
  meta: { type: "problem", docs: { description: "Disallow Promise-style .catch()." } },
  createOnce(context) {
    return {
      CallExpression(node) {
        const callee = asNode(node.callee);
        if (
          callee?.type !== "MemberExpression" ||
          isIdentifier(callee.object, "Effect") ||
          propertyName(callee.property) !== "catch"
        ) {
          return;
        }
        context.report({
          node,
          message: "Do not use Promise .catch(). Model async failures with Effect.tryPromise.",
        });
      },
    };
  },
});

const noPromiseReject = defineRule({
  meta: { type: "problem", docs: { description: "Disallow Promise rejection APIs." } },
  createOnce(context) {
    const promiseExecutors = new WeakSet<Node>();
    const rejectNames: Array<string | undefined> = [];

    const enterFunction = (value: unknown) => {
      const node = asNode(value);
      if (node === undefined || !promiseExecutors.has(node)) return;
      const rejectParam = node.params?.[1];
      const rejectNode = asNode(rejectParam);
      rejectNames.push(
        rejectNode?.type === "Identifier" && typeof rejectNode.name === "string"
          ? rejectNode.name
          : undefined,
      );
    };

    const exitFunction = (value: unknown) => {
      const node = asNode(value);
      if (node !== undefined && promiseExecutors.has(node)) rejectNames.pop();
    };

    return {
      NewExpression(node) {
        if (!isPromiseConstructor(node) || !Array.isArray(node.arguments)) return;
        const executor = asNode(node.arguments[0]);
        if (executor !== undefined && isFunction(executor)) promiseExecutors.add(executor);
      },
      CallExpression(node) {
        if (isPromiseReject(node.callee)) {
          context.report({
            node,
            message:
              "Do not use Promise.reject(). Model failures with Effect.fail or Effect.tryPromise.",
          });
          return;
        }

        const callee = asNode(node.callee);
        if (callee?.type !== "Identifier" || typeof callee.name !== "string") return;
        if (!rejectNames.includes(callee.name)) return;
        context.report({
          node,
          message: "Do not call Promise executor reject(). Model failures with Effect.",
        });
      },
      FunctionDeclaration: enterFunction,
      "FunctionDeclaration:exit": exitFunction,
      FunctionExpression: enterFunction,
      "FunctionExpression:exit": exitFunction,
      ArrowFunctionExpression: enterFunction,
      "ArrowFunctionExpression:exit": exitFunction,
    };
  },
});

const preferTaggedConstructor = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "Prefer tagged constructors over bare _tag objects." },
  },
  createOnce(context) {
    return {
      ObjectExpression(node) {
        if (!Array.isArray(node.properties)) return;
        for (const property of node.properties) {
          const propertyNode = asNode(property);
          if (propertyNode?.type !== "Property") continue;
          if (propertyName(propertyNode.key) !== "_tag") continue;
          if (typeof literalValue(propertyNode.value) !== "string") continue;
          context.report({
            node,
            message: "Use a tagged constructor instead of constructing _tag objects by hand.",
          });
          return;
        }
      },
    };
  },
});

const preferDataTaggedEnum = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "Prefer Data.TaggedEnum over manual _tag union type aliases." },
  },
  createOnce(context) {
    return {
      TSTypeAliasDeclaration(node) {
        if (!isTaggedUnionType(node.typeAnnotation)) return;
        context.report({
          node,
          message: "Use Data.TaggedEnum for tagged union types instead of manual _tag unions.",
        });
      },
    };
  },
});

const noManualTagCheck = defineRule({
  meta: { type: "problem", docs: { description: "Disallow manual _tag checks." } },
  createOnce(context) {
    return {
      BinaryExpression(node) {
        if (node.operator === "in" && isTagProperty(node.left)) {
          context.report({
            node,
            message:
              "Do not inspect _tag manually. Use catchTag/catchTags, Predicate.isTagged, or public helpers.",
          });
          return;
        }
        if (!["===", "!==", "==", "!="].includes(String(node.operator))) return;
        if (!isTagAccess(node.left) && !isTagAccess(node.right)) return;
        context.report({
          node,
          message:
            "Do not inspect _tag manually. Use catchTag/catchTags, Predicate.isTagged, or public helpers.",
        });
      },
    };
  },
});

const isTagAccess = (value: unknown): boolean => {
  const node = asNode(value);
  return node?.type === "MemberExpression" && isTagProperty(node.property);
};

const preferSchemaTaggedErrorClass = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Prefer Schema.TaggedErrorClass over Data.TaggedError." },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (isDataTaggedErrorCall(node)) {
          context.report({ node, message: "Use Schema.TaggedErrorClass for typed domain errors." });
        }
      },
    };
  },
});

const preferEffectFn = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "Prefer Effect.fn or Effect.fnUntraced for reusable Effect functions." },
  },
  createOnce(context) {
    return {
      VariableDeclarator(node) {
        if (returnsEffectGen(node.init)) {
          context.report({
            node,
            message:
              "Use Effect.fn(...) or Effect.fnUntraced(...) instead of a reusable Effect.gen wrapper.",
          });
        }
      },
      FunctionDeclaration(node) {
        if (returnsEffectGen(node)) {
          context.report({
            node,
            message:
              "Use Effect.fn(...) or Effect.fnUntraced(...) instead of returning Effect.gen(...).",
          });
        }
      },
    };
  },
});

const noEffectFnImmediateInvocation = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Disallow immediate invocation of Effect.fn implementations." },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (!Array.isArray(node.arguments) || node.arguments.length !== 0) return;
        if (!isEffectFnImplementationCall(node.callee)) return;
        context.report({
          node,
          message:
            "Do not write Effect.fn(...)(...)(). Put parameters on the generator function instead.",
        });
      },
    };
  },
});

const preferMatchValidation = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer Match decision tables for validation failure ladders.",
    },
  },
  createOnce(context) {
    const report = (node: Ranged) => {
      context.report({
        node,
        message:
          "Prefer Match.type(...).pipe(...) for validation decision tables instead of Effect.fail if ladders.",
      });
    };

    return {
      ArrowFunctionExpression(node) {
        if (isValidationFailureLadder(node)) report(node);
      },
      FunctionExpression(node) {
        if (isValidationFailureLadder(node)) report(node);
      },
    };
  },
});

const preferMatchValue = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "Prefer Match.value over return-only string switch mappings." },
  },
  createOnce(context) {
    return {
      SwitchStatement(node) {
        if (!isReturnOnlyStringSwitch(node)) return;
        context.report({
          node,
          message: "Use Match.value(...).pipe(...) instead of return-only string switch mappings.",
        });
      },
    };
  },
});

const preferYieldableErrorInMatch = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "Prefer returning yieldable errors from Match handlers." },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (!isMatchWhenCall(node) || !Array.isArray(node.arguments)) return;
        const handler = asNode(node.arguments[node.arguments.length - 1]);
        if (handler === undefined) return;
        if (!returnsEffectFailNew(handler)) return;
        context.report({
          node: handler,
          message:
            "Return new DomainError(...) from Match handlers; yield the matcher result in Effect.fn/Effect.gen.",
        });
      },
    };
  },
});

const noAsEffectMethodReference = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Disallow passing .asEffect as an unbound method reference." },
  },
  createOnce(context) {
    return {
      MemberExpression(node) {
        if (propertyName(node.property) !== "asEffect") return;
        const parent = asNode(node.parent);
        if (parent?.type === "CallExpression" && parent.callee === node) return;
        context.report({
          node,
          message:
            "Do not pass .asEffect as a method reference. Return the yieldable error instead.",
        });
      },
    };
  },
});

const preferContextService = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "Prefer Context.Service over Context.Tag or Context.GenericTag." },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (
          isMember(node.callee, "Context", "Tag") ||
          isMember(node.callee, "Context", "GenericTag")
        ) {
          context.report({
            node,
            message: "Prefer Context.Service class syntax over Context.Tag/GenericTag.",
          });
        }
      },
    };
  },
});

const noInlineSchemaCompile = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Disallow inline Schema compiler calls inside function bodies." },
  },
  createOnce(context) {
    let functionDepth = 0;
    return {
      before() {
        functionDepth = 0;
      },
      FunctionDeclaration() {
        functionDepth++;
      },
      "FunctionDeclaration:exit"() {
        functionDepth--;
      },
      FunctionExpression() {
        functionDepth++;
      },
      "FunctionExpression:exit"() {
        functionDepth--;
      },
      ArrowFunctionExpression() {
        functionDepth++;
      },
      "ArrowFunctionExpression:exit"() {
        functionDepth--;
      },
      CallExpression(node) {
        if (functionDepth === 0) return;
        const outer = asNode(node.parent);
        if (outer?.type !== "CallExpression" || outer.callee !== node) return;
        const method = schemaCompilerMethod(node.callee);
        if (method === undefined) return;
        context.report({
          node: node.callee,
          message: `Hoist Schema.${method}(...) to module scope.`,
        });
      },
    };
  },
});

const noTryCatch = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Disallow try/catch. Use Effect error constructors instead." },
  },
  createOnce(context) {
    return {
      TryStatement(node) {
        context.report({
          node,
          message:
            "Avoid try/catch. Use Effect.try, Effect.tryPromise, Effect.catch*, or typed failures.",
        });
      },
    };
  },
});

export default definePlugin({
  meta: { name: "effect" },
  rules: {
    "no-explicit-any": noExplicitAny,
    "no-type-casting": noTypeCasting,
    "no-non-null-assertion": noNonNullAssertion,
    "no-ts-nocheck": noTsNocheck,
    "no-disable-validation": noDisableValidation,
    "no-sql-type-parameter": noSqlTypeParameter,
    "prefer-option-from-nullable": preferOptionFromNullable,
    "prefer-inline-context-service-shape": preferInlineContextServiceShape,
    "no-effect-ignore": noEffectIgnore,
    "no-effect-catchallcause": noEffectCatchAllCause,
    "no-effect-escape-hatch": noEffectEscapeHatch,
    "no-unsupported-effect-api": noUnsupportedEffectApi,
    "no-unnecessary-effect-tx": noUnnecessaryEffectTx,
    "no-silent-error-swallow": noSilentErrorSwallow,
    "no-service-option": noServiceOption,
    "no-nested-layer-provide": noNestedLayerProvide,
    "no-void-expression": noVoidExpression,
    "no-direct-fetch": noDirectFetch,
    "no-json-parse": noJsonParse,
    "no-unknown-shape-probing": noUnknownShapeProbing,
    "no-localstorage": noLocalStorage,
    "no-manual-layer-build-in-tests": noManualLayerBuildInTests,
    "no-effect-run-in-tests": noEffectRunInTests,
    "no-vitest-import": noVitestImport,
    "prefer-effect-vitest": preferEffectVitest,
    "prefer-effect-vitest-assert": preferEffectVitestAssert,
    "prefer-yieldable-error": preferYieldableError,
    "no-effect-fail-new-error": noEffectFailNewError,
    "no-built-in-error-constructor": noBuiltInErrorConstructor,
    "no-raw-throw": noRawThrow,
    "no-instanceof-error": noInstanceofError,
    "no-unknown-error-message": noUnknownErrorMessage,
    "no-promise-catch": noPromiseCatch,
    "no-promise-reject": noPromiseReject,
    "prefer-tagged-constructor": preferTaggedConstructor,
    "prefer-data-tagged-enum": preferDataTaggedEnum,
    "no-manual-tag-check": noManualTagCheck,
    "prefer-schema-tagged-error-class": preferSchemaTaggedErrorClass,
    "prefer-effect-fn": preferEffectFn,
    "no-effect-fn-immediate-invocation": noEffectFnImmediateInvocation,
    "prefer-match-validation": preferMatchValidation,
    "prefer-match-value": preferMatchValue,
    "prefer-yieldable-error-in-match": preferYieldableErrorInMatch,
    "no-as-effect-method-reference": noAsEffectMethodReference,
    "prefer-context-service": preferContextService,
    "no-inline-schema-compile": noInlineSchemaCompile,
    "no-try-catch": noTryCatch,
  },
});
