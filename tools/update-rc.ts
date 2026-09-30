/**
 * Bump the RC-tracked dependency set to the latest *compatible* versions.
 *
 * Versions are resolved from npm dist-tags, per package group:
 *
 *   effect, @effect/* (except tsgo), drizzle-orm, drizzle-kit  -> "rc"
 *   @effect/tsgo, foldkit, @foldkit/*                          -> "latest"
 *
 * A ceiling keeps `effect` (and everything version-locked to it) at the newest
 * release the pinned Foldkit can actually run. See {@link effectCeiling}.
 *
 * The command rewrites the root `catalog`, any exact-version dependency pins,
 * and the drizzle-orm patch key/filename, then runs `bun install`. Vendored
 * subtrees under `repos/` are re-pinned only with `--subtree`.
 *
 * @module
 */

import { BunHttpClient, BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, Layer, Schema } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

/**
 * Newest Effect release the pinned Foldkit supports.
 *
 * `effect@4.0.0-rc.118` removed the `effect/unstable/*` export paths, but
 * Foldkit's published code still imports `effect/unstable/http` and
 * `effect/unstable/persistence`. Until Foldkit migrates, anything above
 * rc.117 breaks the app. Raise this when Foldkit's peer `effect` moves past it;
 * `--latest` ignores it.
 */
const effectCeiling = "4.0.0-rc.117";

const effectCeilingRc = 117;

/** First Effect RC whose module layout `@effect/tsgo` 0.47+ requires. */
const effectTsgoNeedsRc = 118;

const rcTag = "rc";

const latestTag = "latest";

const usage = `Usage: bun run tools/update-rc.ts [flags]

  --dry-run   Print the plan without changing package.json or node_modules.
  --subtree   After installing, re-pin repos/effect and repos/foldkit.
  --latest    Ignore the Foldkit ceiling and resolve the newest RC.
  --help      Show this message.`;

/** Node-semver-style version string pinned to the Effect RC stream. */
const effectRcPattern = /^4\.0\.0-rc\.(\d+)$/;

/**
 * Expected failure while resolving versions or applying the update.
 *
 * `operation` names the step, `detail` states the failed invariant, and
 * `cause` carries the underlying defect when one exists.
 */
class UpdateRcError extends Schema.TaggedError<UpdateRcError>()("UpdateRcError", {
  operation: Schema.String,
  detail: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

/** One catalog or dependency entry the update will change. */
interface Change {
  /** Dotted path of the changed entry, for the printed plan. */
  readonly where: string;
  /** Version currently in package.json. */
  readonly from: string;
  /** Version this run will pin. */
  readonly to: string;
}

/** Flags parsed from the command line. */
interface Options {
  /** Print usage and exit without touching anything. */
  readonly help: boolean;
  /** Report the plan but write nothing. */
  readonly dryRun: boolean;
  /** Re-pin the vendored subtrees after installing. */
  readonly subtree: boolean;
  /** Resolve the newest RC instead of clamping to the Foldkit ceiling. */
  readonly ignoreCeiling: boolean;
}

/** package name -> npm dist-tag to follow. */
const targets = {
  effect: rcTag,
  "@effect/platform-bun": rcTag,
  "@effect/platform-node": rcTag,
  "@effect/platform-node-shared": rcTag,
  "@effect/platform-browser": rcTag,
  "@effect/sql-pg": rcTag,
  "@effect/sql-pglite": rcTag,
  "@effect/atom-react": rcTag,
  "@effect/tsgo": latestTag,
  foldkit: latestTag,
  "@foldkit/ui": latestTag,
  "@foldkit/devtools": latestTag,
  "@foldkit/devtools-mcp": latestTag,
  "@foldkit/oxlint-plugin": latestTag,
  "@foldkit/vite-plugin": latestTag,
  "drizzle-orm": rcTag,
  "drizzle-kit": rcTag,
} as const;

/** Effect-line packages that share the `4.0.0-rc.N` version stream. */
const effectLine = new Set([
  "effect",
  "@effect/platform-bun",
  "@effect/platform-node",
  "@effect/platform-node-shared",
  "@effect/platform-browser",
  "@effect/sql-pg",
  "@effect/sql-pglite",
  "@effect/atom-react",
]);

/** Subtrees to re-pin with `--subtree`, keyed by catalog package name. */
const subtrees = [
  { pkg: "effect", prefix: "repos/effect", repo: "https://github.com/Effect-TS/effect.git" },
  { pkg: "foldkit", prefix: "repos/foldkit", repo: "https://github.com/foldkit/foldkit.git" },
] as const;

const knownFlags = new Set(["--help", "-h", "--dry-run", "--subtree", "--latest"]);

const registryManifest = Schema.Struct({
  "dist-tags": Schema.Record(Schema.String, Schema.String),
});

const stringMap = Schema.Record(Schema.String, Schema.String);

/** package.json as a JSON document; every top-level key survives a round trip. */
const packageJsonDocument = Schema.Record(Schema.String, Schema.Unknown);

const packageJsonJson = Schema.fromJsonString(packageJsonDocument, { space: 2 });

type PackageJson = typeof packageJsonDocument.Type;

/** Parse CLI flags into {@link Options}, rejecting unknown flags. */
const parseOptions = (argv: ReadonlyArray<string>): Effect.Effect<Options, UpdateRcError> =>
  Effect.gen(function* () {
    const unknown = argv.filter((argument) => !knownFlags.has(argument));

    if (unknown.length > 0) {
      return yield* new UpdateRcError({
        operation: "parse arguments",
        detail: `unknown flag(s): ${unknown.join(", ")}`,
      });
    }

    return {
      help: argv.includes("--help") || argv.includes("-h"),
      dryRun: argv.includes("--dry-run"),
      subtree: argv.includes("--subtree"),
      ignoreCeiling: argv.includes("--latest"),
    };
  });

/** Extract the RC number from an Effect RC version, when it is one. */
const rcNumber = (version: string): number | undefined => {
  const match = effectRcPattern.exec(version);
  const captured = match?.[1];

  return captured === undefined ? undefined : Number(captured);
};

/** Clamp an Effect-line version to the Foldkit ceiling unless overridden. */
const clampVersion = (
  name: string,
  version: string,
  current: ReadonlyMap<string, string>,
  ignoreCeiling: boolean,
): string => {
  if (ignoreCeiling) return version;

  const versionRc = rcNumber(version);

  if (effectLine.has(name) && versionRc !== undefined && versionRc > effectCeilingRc) {
    return effectCeiling;
  }

  if (name === "@effect/tsgo" && effectCeilingRc < effectTsgoNeedsRc) {
    return current.get(name) ?? version;
  }

  return version;
};

/** Resolve one package's version from its tracked npm dist-tag. */
const resolveTarget = Effect.fn("update-rc.resolveTarget")(function* (name: string, tag: string) {
  const response = yield* HttpClient.get(
    `https://registry.npmjs.org/${encodeURIComponent(name)}`,
  ).pipe(
    Effect.mapError(
      (cause) =>
        new UpdateRcError({
          operation: `resolve ${name}`,
          detail: "registry request failed",
          cause,
        }),
    ),
  );

  const okResponse = yield* HttpClientResponse.filterStatusOk(response).pipe(
    Effect.mapError(
      (cause) =>
        new UpdateRcError({
          operation: `resolve ${name}`,
          detail: "registry status not ok",
          cause,
        }),
    ),
  );

  const manifest = yield* HttpClientResponse.schemaBodyJson(registryManifest)(okResponse).pipe(
    Effect.mapError(
      (cause) =>
        new UpdateRcError({
          operation: `resolve ${name}`,
          detail: "registry response decode failed",
          cause,
        }),
    ),
  );

  const version = manifest["dist-tags"][tag] ?? manifest["dist-tags"][latestTag];

  if (version === undefined) {
    return yield* new UpdateRcError({
      operation: `resolve ${name}`,
      detail: `no "${tag}" dist-tag`,
    });
  }

  return version;
});

/** Resolve every target, clamping Effect-line packages to the ceiling. */
const resolveLatest = Effect.fn("update-rc.resolveLatest")(function* (
  current: ReadonlyMap<string, string>,
  ignoreCeiling: boolean,
) {
  const pairs = yield* Effect.forEach(
    Object.entries(targets),
    ([name, tag]) =>
      resolveTarget(name, tag).pipe(
        Effect.map(
          (version) => [name, clampVersion(name, version, current, ignoreCeiling)] as const,
        ),
      ),
    { concurrency: "unbounded" },
  );

  return new Map(pairs);
});

/** Update one string-map field, keeping its key order and unknown keys. */
const applyField = (
  pkg: PackageJson,
  field: string,
  label: string,
  resolved: ReadonlyMap<string, string>,
  keep: (current: string) => boolean,
) => {
  const changes: Array<Change> = [];
  const stored = pkg[field];

  if (!Schema.is(stringMap)(stored)) return { pkg, changes };

  const next = { ...stored };

  for (const [name, version] of resolved) {
    const from = next[name];

    if (from === undefined || from === version || !keep(from)) continue;

    changes.push({ where: `${label}.${name}`, from, to: version });
    next[name] = version;
  }

  return { pkg: { ...pkg, [field]: next }, changes };
};

/** Rename the drizzle-orm patch and key when its version moves. */
const applyPatches = Effect.fn("update-rc.applyPatches")(function* (
  pkg: PackageJson,
  resolved: ReadonlyMap<string, string>,
) {
  const changes: Array<Change> = [];
  const stored = pkg["patchedDependencies"];

  if (!Schema.is(stringMap)(stored)) return { pkg, changes };

  const fs = yield* FileSystem;
  const next: Record<string, string> = {};

  for (const [key, patchPath] of Object.entries(stored)) {
    const at = key.lastIndexOf("@");
    const name = key.slice(0, at);
    const version = key.slice(at + 1);
    const target = resolved.get(name);

    if (target === undefined || target === version) {
      next[key] = patchPath;
      continue;
    }

    const nextKey = `${name}@${target}`;
    const nextPath = patchPath.replace(`${name}@${version}`, `${name}@${target}`);

    if (nextPath !== patchPath) {
      yield* fs.rename(patchPath, nextPath).pipe(
        Effect.mapError(
          (cause) =>
            new UpdateRcError({
              operation: `rename ${patchPath}`,
              detail: "patch rename failed",
              cause,
            }),
        ),
      );
    }

    changes.push({ where: `patchedDependencies.${name}`, from: key, to: nextKey });
    next[nextKey] = nextPath;
  }

  return { pkg: { ...pkg, patchedDependencies: next }, changes };
});

/** Run a command, failing when it exits non-zero. */
const runCommand = Effect.fn("update-rc.runCommand")(function* (
  command: ChildProcess.Command,
  operation: string,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const exitCode = yield* spawner
    .exitCode(command)
    .pipe(
      Effect.mapError(
        (cause) => new UpdateRcError({ operation, detail: "failed to start command", cause }),
      ),
    );

  if (exitCode !== 0) {
    return yield* new UpdateRcError({ operation, detail: `command exited with code ${exitCode}` });
  }
});

/** Re-pin every vendored subtree whose catalog version moved. */
const repinSubtrees = Effect.fn("update-rc.repinSubtrees")(function* (
  root: string,
  resolved: ReadonlyMap<string, string>,
  before: ReadonlyMap<string, string>,
) {
  for (const { pkg, prefix, repo } of subtrees) {
    const version = resolved.get(pkg);

    if (version === undefined || version === before.get(pkg)) {
      yield* Console.log(`• ${prefix}: unchanged, skipping subtree pull`);
      continue;
    }

    yield* Console.log(`• ${prefix}: re-pinning to ${pkg}@${version}`);

    yield* runCommand(
      ChildProcess.make(
        "git",
        ["subtree", "pull", `--prefix=${prefix}`, repo, `${pkg}@${version}`, "--squash"],
        {
          cwd: root,
          stdout: "inherit",
          stderr: "inherit",
        },
      ),
      `git subtree pull ${prefix}`,
    );
  }
});

/** Print the plan, then apply it and install unless this is a dry run. */
const main = Effect.fn("update-rc.main")(function* (options: Options) {
  if (options.help) {
    yield* Console.log(usage);

    return;
  }

  const fs = yield* FileSystem;
  const path = yield* Path;
  const root = path.join(import.meta.dir, "..");
  const pkgPath = path.join(root, "package.json");

  const text = yield* fs
    .readFileString(pkgPath)
    .pipe(
      Effect.mapError(
        (cause) => new UpdateRcError({ operation: "read package.json", detail: pkgPath, cause }),
      ),
    );

  const pkg = yield* Schema.decodeEffect(packageJsonJson)(text).pipe(
    Effect.mapError(
      (cause) =>
        new UpdateRcError({ operation: "parse package.json", detail: "invalid JSON", cause }),
    ),
  );

  const catalog = pkg["catalog"];

  const before = Schema.is(stringMap)(catalog)
    ? new Map(Object.entries(catalog))
    : new Map<string, string>();

  const ceiling = options.ignoreCeiling ? "ignored (--latest)" : effectCeiling;

  yield* Console.log(`Resolving latest versions from npm (ceiling: ${ceiling})…`);

  const resolved = yield* resolveLatest(before, options.ignoreCeiling);

  const effectVersion = resolved.get("effect");
  const effectVersionRc = effectVersion === undefined ? undefined : rcNumber(effectVersion);

  if (
    effectVersion !== undefined &&
    effectVersionRc !== undefined &&
    effectVersionRc > effectCeilingRc
  ) {
    yield* Effect.logWarning(
      `Pinning effect@${effectVersion}, past the Foldkit ceiling (${effectCeiling}).`,
    );
    yield* Effect.logWarning(
      "Foldkit's published code imports `effect/unstable/*`, which this Effect release removes.",
    );
  }

  const catalogApplied = applyField(pkg, "catalog", "catalog", resolved, () => true);

  const dependenciesApplied = applyField(
    catalogApplied.pkg,
    "dependencies",
    "dependencies",
    resolved,
    (current) => current !== "catalog:" && !current.startsWith("workspace:"),
  );

  const devDependenciesApplied = applyField(
    dependenciesApplied.pkg,
    "devDependencies",
    "devDependencies",
    resolved,
    (current) => current !== "catalog:" && !current.startsWith("workspace:"),
  );

  const patchesApplied = yield* applyPatches(devDependenciesApplied.pkg, resolved);

  const changes = [
    ...catalogApplied.changes,
    ...dependenciesApplied.changes,
    ...devDependenciesApplied.changes,
    ...patchesApplied.changes,
  ];

  if (changes.length === 0) {
    yield* Console.log("✓ Everything is already on the latest compatible versions.");

    return;
  }

  yield* Console.log("Planned changes:");
  yield* Effect.forEach(
    changes,
    (change) => Console.log(`  ${change.where.padEnd(48)} ${change.from} -> ${change.to}`),
    { discard: true },
  );

  if (options.dryRun) {
    yield* Console.log("--dry-run: package.json and node_modules are untouched.");

    return;
  }

  const encoded = yield* Schema.encodeEffect(packageJsonJson)(patchesApplied.pkg).pipe(
    Effect.mapError(
      (cause) =>
        new UpdateRcError({ operation: "encode package.json", detail: "encode failed", cause }),
    ),
  );

  yield* fs
    .writeFileString(pkgPath, `${encoded}\n`)
    .pipe(
      Effect.mapError(
        (cause) => new UpdateRcError({ operation: "write package.json", detail: pkgPath, cause }),
      ),
    );

  yield* Console.log("Wrote package.json. Running `bun install`…");
  yield* runCommand(
    ChildProcess.make("bun", ["install"], { cwd: root, stdout: "inherit", stderr: "inherit" }),
    "bun install",
  );

  if (options.subtree) {
    yield* repinSubtrees(root, resolved, before);
  } else {
    yield* Console.log(
      "Vendored subtrees were not touched. Re-run with --subtree to re-pin repos/effect and repos/foldkit.",
    );
  }

  yield* Console.log("Next: `bun run typecheck && bun run test && bun run lint`.");
});

const platformLayer = Layer.mergeAll(BunServices.layer, BunHttpClient.layer);

const program = Effect.gen(function* () {
  const options = yield* parseOptions(process.argv.slice(2));

  yield* main(options);
});

BunRuntime.runMain(program.pipe(Effect.provide(platformLayer)));
