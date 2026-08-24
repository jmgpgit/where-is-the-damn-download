/**
 * Per-asset OS/arch detection from a tokenized filename.
 * (The visitor's own platform is detected in src/platform; this reads assets.)
 */

import type { Architecture, OperatingSystem } from './asset-types';
import {
  ARCH_TOKEN_ALIASES,
  FOREIGN_ARCH_TOKENS,
  NON_DESKTOP_OS_TOKENS,
  OS_EXTENSIONS,
  OS_TOKEN_ALIASES,
  SCRIPT_EXTENSIONS,
} from './rules';
import { hasSequence, type TokenizedName } from './tokenizer';

export interface OsDetection {
  /** Union of token- and extension-implied systems. */
  systems: OperatingSystem[];
  tokenSystems: OperatingSystem[];
  extensionSystem: OperatingSystem | null;
  /** Display name of a non-desktop system named in the tokens (iOS), else null. */
  nonDesktop: string | null;
}

export function detectOperatingSystems(t: TokenizedName): OsDetection {
  const tokenSystems: OperatingSystem[] = [];
  for (const [os, alias] of OS_TOKEN_ALIASES) {
    if (!tokenSystems.includes(os) && hasSequence(t.tokens, alias)) tokenSystems.push(os);
  }
  const extensionSystem = OS_EXTENSIONS[t.extension] ?? null;
  const implied = extensionSystem !== null ? [extensionSystem] : SCRIPT_EXTENSIONS[t.extension] ?? [];
  const systems = [...tokenSystems];
  for (const os of implied) if (!systems.includes(os)) systems.push(os);
  const nonDesktopToken = t.tokens.find((token) => token in NON_DESKTOP_OS_TOKENS);
  const nonDesktop = nonDesktopToken === undefined ? null : NON_DESKTOP_OS_TOKENS[nonDesktopToken] ?? null;
  return { systems, tokenSystems, extensionSystem, nonDesktop };
}

export interface ArchDetection {
  architectures: Architecture[];
  /** x86 inferred only from a bare `win32` token. */
  weakX86: boolean;
  /** Processor families we never offer (s390x, ppc64le…), as written. */
  foreign: string[];
}

export function detectArchitectures(t: TokenizedName): ArchDetection {
  const architectures: Architecture[] = [];
  const add = (arch: Architecture): void => {
    if (!architectures.includes(arch)) architectures.push(arch);
  };
  for (const [arch, alias] of ARCH_TOKEN_ALIASES) {
    if (hasSequence(t.tokens, alias)) add(arch);
  }
  // `x86` is 32-bit unless it heads `x86_64`; bare `arm` is 32-bit unless it heads `arm-64`
  for (let i = 0; i < t.tokens.length; i++) {
    if (t.tokens[i] === 'x86' && t.tokens[i + 1] !== '64') add('x86');
    if (t.tokens[i] === 'arm' && t.tokens[i + 1] !== '64') add('arm');
  }
  const foreign = t.tokens.filter((token) => FOREIGN_ARCH_TOKENS.includes(token));
  if (architectures.length === 0 && foreign.length === 0 && t.tokens.includes('win32')) {
    return { architectures: ['x86'], weakX86: true, foreign };
  }
  return { architectures, weakX86: false, foreign };
}
