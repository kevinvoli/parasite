import { jest } from '@jest/globals';

export const mockQuery = jest.fn();

export const Client = jest.fn().mockImplementation(() => ({
  connect: jest.fn().mockResolvedValue(undefined),
  query: mockQuery,
  end: jest.fn().mockResolvedValue(undefined),
}));

export default { Client };
