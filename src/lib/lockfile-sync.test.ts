import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type DepMap = Record<string, string>;

interface PackageJsonLike {
  dependencies?: DepMap;
  devDependencies?: DepMap;
  optionalDependencies?: DepMap;
}

/** bun.lock é JSON com vírgulas finais; remove-as antes do parse. */
export function parseBunLock(text: string): {
  workspaces: Record<string, PackageJsonLike>;
} {
  return JSON.parse(text.replace(/,(\s*[}\]])/g, "$1"));
}

/** Retorna as divergências entre package.json e o workspace raiz do bun.lock. */
export function findLockfileDrift(pkg: PackageJsonLike, lockText: string): string[] {
  const root = parseBunLock(lockText).workspaces[""] ?? {};
  const drift: string[] = [];
  for (const section of ["dependencies", "devDependencies", "optionalDependencies"] as const) {
    const wanted = pkg[section] ?? {};
    const locked = root[section] ?? {};
    for (const [name, spec] of Object.entries(wanted)) {
      if (locked[name] !== spec) {
        drift.push(
          `${section}.${name}: package.json="${spec}" bun.lock="${locked[name] ?? "ausente"}"`,
        );
      }
    }
    for (const name of Object.keys(locked)) {
      if (!(name in wanted)) drift.push(`${section}.${name}: só existe no bun.lock`);
    }
  }
  return drift;
}

describe("bun.lock em sincronia com package.json (evita 'lockfile had changes, but lockfile is frozen' na Vercel)", () => {
  it("o bun.lock commitado não diverge do package.json", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
    const lock = readFileSync(resolve(process.cwd(), "bun.lock"), "utf8");
    expect(findLockfileDrift(pkg, lock)).toEqual([]);
  });

  it("detecta a regressão real de 22/10 (lovable 2.25.3 -> 2.13.1)", () => {
    const pkg = { devDependencies: { "@lovable.dev/vite-tanstack-config": "2.25.3" } };
    const staleLock = `{"lockfileVersion":1,"workspaces":{"":{"devDependencies":{"@lovable.dev/vite-tanstack-config":"2.13.1",},},},}`;
    expect(findLockfileDrift(pkg, staleLock)).toEqual([
      'devDependencies.@lovable.dev/vite-tanstack-config: package.json="2.25.3" bun.lock="2.13.1"',
    ]);
  });

  it("garante versões exatas de @lovable.dev/vite-tanstack-config e nitro entre package.json e bun.lock", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
    const lock = readFileSync(resolve(process.cwd(), "bun.lock"), "utf8");
    const root = parseBunLock(lock).workspaces[""] ?? {};

    // 1. @lovable.dev/vite-tanstack-config
    expect(pkg.devDependencies?.["@lovable.dev/vite-tanstack-config"]).toBe("2.25.3");
    expect(root.devDependencies?.["@lovable.dev/vite-tanstack-config"]).toBe("2.25.3");
    expect(root.devDependencies?.["@lovable.dev/vite-tanstack-config"]).toBe(
      pkg.devDependencies?.["@lovable.dev/vite-tanstack-config"],
    );

    // 2. nitro
    expect(pkg.devDependencies?.["nitro"]).toBe("3.0.260603-beta");
    expect(root.devDependencies?.["nitro"]).toBe("3.0.260603-beta");
    expect(root.devDependencies?.["nitro"]).toBe(pkg.devDependencies?.["nitro"]);

    // 3. Regressão simulada: se bun.lock regredir para o blob c5cb7bd (commit 67551be), o drift acusa ambas
    const brokenLockSnippet = `{"lockfileVersion":1,"workspaces":{"":{"devDependencies":{"@lovable.dev/vite-tanstack-config":"2.13.1","nitro":"^3.0.260610-beta",},},},}`;
    const syntheticPkg = {
      devDependencies: {
        "@lovable.dev/vite-tanstack-config": "2.25.3",
        nitro: "3.0.260603-beta",
      },
    };
    const drifts = findLockfileDrift(syntheticPkg, brokenLockSnippet);
    expect(drifts).toContain(
      'devDependencies.@lovable.dev/vite-tanstack-config: package.json="2.25.3" bun.lock="2.13.1"',
    );
    expect(drifts).toContain(
      'devDependencies.nitro: package.json="3.0.260603-beta" bun.lock="^3.0.260610-beta"',
    );
  });
});
