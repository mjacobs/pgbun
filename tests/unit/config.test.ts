import { test, expect } from 'bun:test';
import { Config } from '../../src/config';

test('Config.load() should return a config with default values', () => {
  const config = Config.load();
  expect(config.listenPort).toBe(6432);
  expect(config.listenHost).toBe('0.0.0.0');
  expect(config.poolMode).toBe('session');
});

test('Config constructor should override default values', () => {
  const customConfig = new Config({
    listen_port: 8000,
    pool_mode: 'transaction',
  });
  expect(customConfig.listenPort).toBe(8000);
  expect(customConfig.poolMode).toBe('transaction');
  // A value that wasn't overridden should still have the default
  expect(customConfig.listenHost).toBe('0.0.0.0');
});
