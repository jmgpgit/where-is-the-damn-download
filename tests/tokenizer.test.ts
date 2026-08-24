import { describe, expect, it } from 'vitest';
import { hasSequence, tokenize } from '../src/domain/tokenizer';

interface Case {
  name: string;
  extension: string;
  tokens: string[];
}

const CASES: Case[] = [
  { name: 'Foo-4.2.1-setup-win64.exe', extension: '.exe', tokens: ['foo', '4', '2', '1', 'setup', 'win64'] },
  { name: 'Foo_4.2.1_x64.msi', extension: '.msi', tokens: ['foo', '4', '2', '1', 'x64'] },
  { name: 'foo-x86_64-pc-windows-msvc.zip', extension: '.zip', tokens: ['foo', 'x86', '64', 'pc', 'windows', 'msvc'] },
  { name: 'foo-x86_64-apple-darwin.tar.gz', extension: '.tar.gz', tokens: ['foo', 'x86', '64', 'apple', 'darwin'] },
  { name: 'foo-src.tar.xz', extension: '.tar.xz', tokens: ['foo', 'src'] },
  { name: 'foo.tar.bz2', extension: '.tar.bz2', tokens: ['foo'] },
  { name: 'Foo.app.zip', extension: '.app.zip', tokens: ['foo'] },
  { name: 'foo.dSYM.zip', extension: '.dsym.zip', tokens: ['foo'] },
  { name: 'foo.sbom.spdx.json', extension: '.spdx.json', tokens: ['foo', 'sbom'] },
  { name: 'foo.cdx.json', extension: '.cdx.json', tokens: ['foo'] },
  { name: 'foo.pdb.zip', extension: '.zip', tokens: ['foo', 'pdb'] },
  { name: 'foo-linux-x86_64.AppImage', extension: '.appimage', tokens: ['foo', 'linux', 'x86', '64'] },
  { name: 'foo.7z', extension: '.7z', tokens: ['foo'] },
  { name: 'foo-1.2.3', extension: '', tokens: ['foo', '1', '2', '3'] },
  { name: 'SHA256SUMS', extension: '', tokens: ['sha256sums'] },
  { name: 'latest.yml', extension: '.yml', tokens: ['latest'] },
  { name: 'foo (portable) v2/x64.zip', extension: '.zip', tokens: ['foo', 'portable', 'v2', 'x64'] },
  { name: 'foo-self-contained-win64.zip', extension: '.zip', tokens: ['foo', 'self', 'contained', 'win64'] },
  { name: '.hidden', extension: '', tokens: ['hidden'] },
];

describe('tokenize', () => {
  it.each(CASES)('$name', ({ name, extension, tokens }) => {
    const t = tokenize(name);
    expect(t.extension).toBe(extension);
    expect(t.tokens).toEqual(tokens);
  });

  it('keeps the original name for display', () => {
    expect(tokenize('Foo-Setup.EXE').original).toBe('Foo-Setup.EXE');
    expect(tokenize('Foo-Setup.EXE').extension).toBe('.exe');
  });
});

describe('hasSequence', () => {
  const tokens = ['foo', 'x86', '64', 'pc', 'windows', 'msvc'];
  it('matches consecutive whole tokens', () => {
    expect(hasSequence(tokens, ['x86', '64'])).toBe(true);
    expect(hasSequence(tokens, ['pc', 'windows'])).toBe(true);
    expect(hasSequence(tokens, ['msvc'])).toBe(true);
  });
  it('never matches substrings or gaps', () => {
    expect(hasSequence(['darwin'], ['win'])).toBe(false);
    expect(hasSequence(['resources'], ['source'])).toBe(false);
    expect(hasSequence(tokens, ['x86', 'pc'])).toBe(false);
    expect(hasSequence(tokens, [])).toBe(false);
  });
});
