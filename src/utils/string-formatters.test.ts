import { kebabCase, camelCase, toPascalCase } from './string-formatters.js';

describe('String Formatters', () => {
  describe('kebabCase', () => {
    it('should convert PascalCase to kebab-case', () => {
      expect(kebabCase('MyAwesomeString')).toBe('my-awesome-string');
    });

    it('should handle an already kebab-cased string', () => {
      expect(kebabCase('my-awesome-string')).toBe('my-awesome-string');
    });

    it('should convert camelCase to kebab-case', () => {
      expect(kebabCase('myAwesomeString')).toBe('my-awesome-string');
    });

    it('should handle a single word', () => {
      expect(kebabCase('Hello')).toBe('hello');
    });
  });

  describe('camelCase', () => {
    it('should convert snake_case to camelCase', () => {
      expect(camelCase('my_awesome_string')).toBe('myAwesomeString');
    });

    it('should handle an already camelCased string', () => {
      expect(camelCase('myAwesomeString')).toBe('myAwesomeString');
    });

    it('should handle a single word', () => {
      expect(camelCase('hello')).toBe('hello');
    });
  });

  describe('toPascalCase', () => {
    it('should convert snake_case to PascalCase', () => {
      expect(toPascalCase('my_awesome_string')).toBe('MyAwesomeString');
    });

    it('should convert camelCase to PascalCase', () => {
      expect(toPascalCase('myAwesomeString')).toBe('MyAwesomeString');
    });

    it('should handle a single word', () => {
      expect(toPascalCase('hello')).toBe('Hello');
    });
  });
});
