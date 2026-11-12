import { describe, expect, it } from 'vitest';
import {
  comparePassword,
  createToken,
  hashPassword,
  verifyToken,
} from '../src/config/auth.js';

describe('Tulya authentication security', () => {
  it('signs tokens and rejects a modified signature', () => {
    const token = createToken({ id: 'user-1', email: 'member@example.com', name: 'Member' });
    const [header, payload, signature] = token.split('.');
    const modifiedToken = `${header}.${payload}.${signature.slice(0, -1)}x`;

    expect(verifyToken(token)).toMatchObject({
      sub: 'user-1',
      email: 'member@example.com',
    });
    expect(verifyToken(modifiedToken)).toBeNull();
    expect(verifyToken('eyJzdWIiOiJhZG1pbiJ9')).toBeNull();
  });

  it('uses salted password hashes and verifies only the correct password', () => {
    const firstHash = hashPassword('correct horse battery staple');
    const secondHash = hashPassword('correct horse battery staple');

    expect(firstHash).not.toBe(secondHash);
    expect(comparePassword('correct horse battery staple', firstHash)).toBe(true);
    expect(comparePassword('incorrect password', firstHash)).toBe(false);
  });
});
