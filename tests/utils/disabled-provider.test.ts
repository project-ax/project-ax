import { describe, test, expect } from 'vitest';
import { disabledProvider } from '../../src/utils/disabled-provider.js';

interface FakeProvider {
  doSomething(x: number): Promise<string>;
  doOther(): void;
}

describe('disabledProvider', () => {
  test('throws "Provider disabled" on any method call', () => {
    const provider = disabledProvider<FakeProvider>();
    expect(() => provider.doSomething(42)).toThrow('Provider disabled (provider: none)');
    expect(() => provider.doOther()).toThrow('Provider disabled (provider: none)');
  });

  test('every call throws the same error message', () => {
    const provider = disabledProvider<FakeProvider>();
    try {
      provider.doSomething(1);
    } catch (e: any) {
      expect(e.message).toBe('Provider disabled (provider: none)');
    }
  });

  test('returned object is truthy (provider exists, just disabled)', () => {
    const provider = disabledProvider<FakeProvider>();
    expect(provider).toBeTruthy();
  });

  test('accessing a property returns a function', () => {
    const provider = disabledProvider<FakeProvider>();
    expect(typeof provider.doSomething).toBe('function');
  });

  test('is not a thenable (safe to return from async functions)', () => {
    const provider = disabledProvider<FakeProvider>();
    expect((provider as any).then).toBeUndefined();
  });

  test('works when returned from an async function', async () => {
    async function createProvider() {
      return disabledProvider<FakeProvider>();
    }
    const provider = await createProvider();
    expect(provider).toBeTruthy();
    expect(() => provider.doSomething(1)).toThrow('Provider disabled');
  });
});
