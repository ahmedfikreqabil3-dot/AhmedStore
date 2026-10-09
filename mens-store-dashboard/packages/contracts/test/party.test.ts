import { describe, expect, it } from 'vitest';
import { createCustomerSchema, createSupplierSchema } from '../src/party.js';

describe('party contracts', () => {
  it('accepts legacy-compatible customer details and exact credit limit decimals', () => {
    expect(createCustomerSchema.parse({ name: ' Mohamed Ali ', phone: '01012345678', email: 'mohamed@example.test', address: ' Cairo ', notes: ' VIP ', creditLimit: '5000.0000' })).toEqual({ name: 'Mohamed Ali', phone: '01012345678', email: 'mohamed@example.test', address: 'Cairo', notes: 'VIP', creditLimit: '5000.0000' });
  });

  it('rejects malformed customer contact and credit-limit data', () => {
    expect(createCustomerSchema.safeParse({ name: 'M', phone: null, email: 'not-an-email', address: null, notes: null, creditLimit: '-1' }).success).toBe(false);
  });

  it('accepts and validates supplier contact details', () => {
    expect(createSupplierSchema.parse({ name: ' Textile Importers ', phone: '01012345678', email: 'orders@example.test', address: ' Cairo ', notes: ' Net 30 ' })).toEqual({ name: 'Textile Importers', phone: '01012345678', email: 'orders@example.test', address: 'Cairo', notes: 'Net 30' });
    expect(createSupplierSchema.safeParse({ name: 'X', phone: null, email: 'bad', address: null, notes: null }).success).toBe(false);
  });
});
