/**
 * Filename tokenization for release assets.
 *
 * All matching elsewhere is over whole-token sequences, never substrings,
 * so "darwin" can never read as Windows and "resources" never as source.
 */

export interface TokenizedName {
  /** As uploaded, for display. */
  original: string;
  /** Compound or single extension, lowercased with leading dot; '' if none. */
  extension: string;
  /** Lowercased stem tokens in filename order. */
  tokens: string[];
}

// Checked before single extensions so `.tar.gz` wins over `.gz`.
const COMPOUND_EXTENSIONS: readonly string[] = [
  '.spdx.json',
  '.cdx.json',
  '.dsym.zip',
  '.tar.bz2',
  '.app.zip',
  '.tar.gz',
  '.tar.xz',
];

// Requires at least one letter so version fragments (".1") are not extensions.
const SINGLE_EXTENSION = /\.([0-9]*[a-z][a-z0-9]*)$/;

const TOKEN_SEPARATORS = /[ \-_.()/\\]+/;

export function tokenize(name: string): TokenizedName {
  const lower = name.toLowerCase();
  let extension = '';
  let stem = lower;
  for (const ext of COMPOUND_EXTENSIONS) {
    if (lower.length > ext.length && lower.endsWith(ext)) {
      extension = ext;
      stem = lower.slice(0, -ext.length);
      break;
    }
  }
  if (extension === '') {
    const match = SINGLE_EXTENSION.exec(lower);
    if (match !== null && match.index > 0) {
      extension = `.${match[1] ?? ''}`;
      stem = lower.slice(0, match.index);
    }
  }
  const tokens = stem.split(TOKEN_SEPARATORS).filter((t) => t.length > 0);
  return { original: name, extension, tokens };
}

/** True when `seq` appears as consecutive whole tokens. */
export function hasSequence(tokens: readonly string[], seq: readonly string[]): boolean {
  if (seq.length === 0) return false;
  outer: for (let i = 0; i + seq.length <= tokens.length; i++) {
    for (let j = 0; j < seq.length; j++) {
      if (tokens[i + j] !== seq[j]) continue outer;
    }
    return true;
  }
  return false;
}
