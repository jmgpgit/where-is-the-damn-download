/**
 * Per-asset OS/arch detection from a tokenized filename.
 * (The visitor's own platform is detected in src/platform; this reads assets.)
 */

import type { Architecture, OperatingSystem } from './asset-types';
import { ARCH_TOKEN_ALIASES, OS_EXTENSIONS, OS_TOKEN_ALIASES } from './rules';
import { hasSequence, type TokenizedName } from './tokenizer';

export interface OsDetection {
  /** Union of token- and extension-implied systems. */
  systems: OperatingSystem[];
  tokenSystems: OperatingSystem[];
  extensionSystem: OperatingSystem | null;
}

export function detectOperatingSystems(t: TokenizedName): OsDetection {
  const tokenSystems: OperatingSystem[] = [];
  for (const [os, alias] of OS_TOKEN_ALIASES) {
    if (!tokenSystems.includes(os) && hasSequence(t.tokens, alias)) tokenSystems.push(os);
  }
  const extensionSystem = OS_EXTENSIONS[t.extension] ?? null;
  const systems = [...tokenSystems];
  if (extensionSystem !== null && !systems.includes(extensionSystem)) systems.push(extensionSystem);
  return { systems, tokenSystems, extensionSystem };
}

export interface ArchDetection {
  architectures: Architecture[];
  /** x86 inferred only from a bare `win32` token. */
  weakX86: boolean;
}

export function detectArchitectures(t: TokenizedName): ArchDetection {
  const architectures: Architecture[] = [];
  const add = (arch: Architecture): void => {
    if (!architectures.includes(arch)) architectures.push(arch);
  };
  for (const [arch, alias] of ARCH_TOKEN_ALIASES) {
    if (hasSequence(t.tokens, alias)) add(arch);
  }
  // `x86` is 32-bit unless it heads `x86_64`
  for (let i = 0; i < t.tokens.length; i++) {
    if (t.tokens[i] === 'x86' && t.tokens[i + 1] !== '64') {
      add('x86');
      break;
    }
  }
  if (architectures.length === 0 && t.tokens.includes('win32')) {
    return { architectures: ['x86'], weakX86: true };
  }
  return { architectures, weakX86: false };
}
