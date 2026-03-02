import { jest } from '@jest/globals';

export const mockQuery = jest.fn();

export const createConnection = jest.fn(() => ({
  query: mockQuery,
  end: jest.fn().mockResolvedValue(undefined),
}));
