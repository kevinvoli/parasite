import { kebabCase, camelCase, toPascalCase, toSingular } from './string-formatters.js';

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

    it('should handle underscore mixed with uppercase (B10)', () => {
      expect(kebabCase('my_Entity')).toBe('my-entity');
    });

    it('should handle acronyms correctly (TICKET-016)', () => {
      expect(kebabCase('MyHTTPRequest')).toBe('my-http-request');
      expect(kebabCase('parseHTMLContent')).toBe('parse-html-content');
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

    it('should handle double underscores (B11)', () => {
      expect(camelCase('my__test')).toBe('myTest');
    });

    it('should lowercase first character of PascalCase (TICKET-016)', () => {
      expect(camelCase('User')).toBe('user');
      expect(camelCase('BlogPost')).toBe('blogPost');
    });

    it('should handle ALL_CAPS with underscores (TICKET-016)', () => {
      expect(camelCase('MY_CONSTANT')).toBe('myConstant');
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

  describe('toSingular', () => {
    it('should singularize words ending in -ies', () => {
      expect(toSingular('categories')).toBe('category');
      expect(toSingular('countries')).toBe('country');
    });

    it('should singularize words ending in -ses/-xes/-zes', () => {
      expect(toSingular('addresses')).toBe('address');
      expect(toSingular('boxes')).toBe('box');
    });

    it('should singularize regular -s words', () => {
      expect(toSingular('users')).toBe('user');
      expect(toSingular('posts')).toBe('post');
    });

    it('should leave invariant words unchanged', () => {
      expect(toSingular('status')).toBe('status');
      expect(toSingular('process')).toBe('process');
      expect(toSingular('news')).toBe('news');
    });

    it('should handle irregular plurals (TICKET-016)', () => {
      expect(toSingular('people')).toBe('person');
      expect(toSingular('children')).toBe('child');
    });
  });
});
