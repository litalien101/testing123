// utils.test.js
const { urlMatchesMonitored } = require('./utils_for_tests');

test('matches basic host substrings', () => {
  expect(urlMatchesMonitored('https://www.tiktok.com/video', ['tiktok.com'])).toBe(true);
  expect(urlMatchesMonitored('https://sub.snapchat.com/story', ['snapchat.com'])).toBe(true);
  expect(urlMatchesMonitored('https://example.com', ['tiktok.com'])).toBe(false);
});

test('matches wildcard pattern', () => {
  expect(urlMatchesMonitored('https://shop.tiktok.com', ['*.tiktok.com'])).toBe(true);
  expect(urlMatchesMonitored('https://notrelated.com', ['*.tiktok.com'])).toBe(false);
});
