import { expect, it } from 'vitest';
import { operationLabel, operationMoney } from './operation-format.js';

it('formats exact decimal amounts for display including refunds and values beyond safe floating-point precision', () => {
  expect(operationMoney('19.9550')).toBe('19.96');
  expect(operationMoney('-19.9550')).toBe('-19.96');
  expect(operationMoney('0')).toBe('0.00');
  expect(operationMoney('-0.0000')).toBe('0.00');
  expect(operationMoney('999999999999999.9999')).toBe('1,000,000,000,000,000.00');
  expect(operationMoney('not-an-amount')).toBe('—');
});
it('translates operational states and payment names while preserving unrecognized labels', () => {
  expect(operationLabel('POSTED')).toBe('مسجلة');
  expect(operationLabel('CASH')).toBe('نقدي');
  expect(operationLabel('Other')).toBe('Other');
});
