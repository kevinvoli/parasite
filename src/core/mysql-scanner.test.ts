import { jest } from '@jest/globals';
import { MySqlScanner, mapMySQLTypeToTS } from './mysql-scanner.js';
// Import createConnection and mockQuery from the mocked module directly
import { createConnection, mockQuery } from 'mysql2/promise'; // This gets the mocked version

describe('MySQL Scanner', () => {
  let scanner: MySqlScanner;

  beforeEach(() => {
    // Reset mocks before each test
    mockQuery.mockClear();
    createConnection.mockClear(); // Clear the createConnection mock directly
    scanner = new MySqlScanner();
  });

  describe('mapMySQLTypeToTS', () => {
    it('should map integer types to number', () => {
      expect(mapMySQLTypeToTS('int')).toBe('number');
      expect(mapMySQLTypeToTS('bigint')).toBe('number');
      expect(mapMySQLTypeToTS('smallint')).toBe('number');
    });

    it('should map decimal types to number', () => {
      expect(mapMySQLTypeToTS('decimal(10, 2)')).toBe('number');
      expect(mapMySQLTypeToTS('float')).toBe('number');
      expect(mapMySQLTypeToTS('double')).toBe('number');
    });

    it('should map string types to string', () => {
      expect(mapMySQLTypeToTS('varchar(255)')).toBe('string');
      expect(mapMySQLTypeToTS('text')).toBe('string');
      expect(mapMySQLTypeToTS('char(1)')).toBe('string');
      expect(mapMySQLTypeToTS('enum("a", "b")')).toBe('string');
    });

    it('should map date and time types to Date', () => {
      expect(mapMySQLTypeToTS('date')).toBe('Date');
      expect(mapMySQLTypeToTS('datetime')).toBe('Date');
      expect(mapMySQLTypeToTS('timestamp')).toBe('Date');
    });

    it('should map boolean types to boolean', () => {
      expect(mapMySQLTypeToTS('tinyint(1)')).toBe('boolean');
      expect(mapMySQLTypeToTS('bool')).toBe('boolean');
    });

    it('should map other types to any', () => {
      expect(mapMySQLTypeToTS('blob')).toBe('any');
      expect(mapMySQLTypeToTS('json')).toBe('any');
    });

    it('should be case-insensitive', () => {
      expect(mapMySQLTypeToTS('INT')).toBe('number');
      expect(mapMySQLTypeToTS('VARCHAR(255)')).toBe('string');
    });
  });

  describe('introspect', () => {
    it('should throw an error if no tables are found', async () => {
      // Arrange: Mock 'SHOW TABLES' to return an empty array
      mockQuery.mockResolvedValueOnce([[]]);

      // Act & Assert
      await expect(scanner.introspect('mysql://user:pass@host:3306/db'))
        .rejects
        .toThrow('❌ Aucune table trouvée dans la base de données.');
    });

    it('should correctly parse a simple table with various column types', async () => {
      // Arrange
      const showTablesResponse = [[{ 'Tables_in_db': 'users' }]];
      const showColumnsResponse = [[
        { Field: 'id', Type: 'int(11)', Null: 'NO', Key: 'PRI', Default: null, Extra: 'auto_increment' },
        { Field: 'user_name', Type: 'varchar(255)', Null: 'NO', Key: '', Default: null, Extra: '' },
        { Field: 'created_at', Type: 'timestamp', Null: 'NO', Key: '', Default: 'CURRENT_TIMESTAMP', Extra: '' },
        { Field: 'is_active', Type: 'tinyint(1)', Null: 'NO', Key: '', Default: '1', Extra: '' },
        { Field: 'bio', Type: 'text', Null: 'YES', Key: '', Default: null, Extra: '' },
      ]];
      const foreignKeysResponse = [[]]; // No foreign keys

      mockQuery
        .mockResolvedValueOnce(showTablesResponse)
        .mockResolvedValueOnce(showColumnsResponse)
        .mockResolvedValueOnce(foreignKeysResponse)
        .mockResolvedValueOnce([[]]); // Mock uniqueColumnsResult for 'users'

      // Act
      const entities = await scanner.introspect('mysql://user:pass@host:3306/db');

      // Assert
      expect(entities).toHaveLength(1);
      const userEntity = entities[0];

      expect(userEntity.name).toBe('Users');
      expect(userEntity.properties).toHaveLength(5);

      const idProp = userEntity.properties.find(p => p.name === 'id');
      expect(idProp).toBeDefined();
      expect(idProp!.isPrimary).toBe(true);
      expect(idProp!.type).toBe('number');
      expect(idProp!.isOptional).toBe(false);

      const userNameProp = userEntity.properties.find(p => p.name === 'userName');
      expect(userNameProp).toBeDefined();
      expect(userNameProp!.isPrimary).toBe(false);
      expect(userNameProp!.type).toBe('string');
      expect(userNameProp!.isOptional).toBe(false);

      const createdAtProp = userEntity.properties.find(p => p.name === 'createdAt');
      expect(createdAtProp).toBeDefined();
      expect(createdAtProp!.type).toBe('Date');

      const isActiveProp = userEntity.properties.find(p => p.name === 'isActive');
      expect(isActiveProp).toBeDefined();
      expect(isActiveProp!.type).toBe('boolean');

      const bioProp = userEntity.properties.find(p => p.name === 'bio');
      expect(bioProp).toBeDefined();
      expect(bioProp!.type).toBe('string');
      expect(bioProp!.isOptional).toBe(true);
    });

    it('should correctly parse a ManyToOne and its inverse OneToMany relationship', async () => {
      // Arrange
      const showTablesResponse = [[{ 'Tables_in_db': 'users' }, { 'Tables_in_db': 'posts' }]];
      
      const usersColumns = [[{ Field: 'id', Type: 'int(11)', Null: 'NO', Key: 'PRI' }]];
      const usersFks = [[]];

      const postsColumns = [[
        { Field: 'id', Type: 'int(11)', Null: 'NO', Key: 'PRI' },
        { Field: 'title', Type: 'varchar(255)', Null: 'NO', Key: '' },
        { Field: 'user_id', Type: 'int(11)', Null: 'YES', Key: '' },
      ]];
      const postsFks = [[{ COLUMN_NAME: 'user_id', REFERENCED_TABLE_NAME: 'users' }]];

      mockQuery
        .mockResolvedValueOnce(showTablesResponse) // For SHOW TABLES
        .mockResolvedValueOnce(usersColumns)       // For SHOW COLUMNS on users
        .mockResolvedValueOnce(usersFks)           // For FKS on users
        .mockResolvedValueOnce([[]])               // Mock uniqueColumnsResult for 'users'
        .mockResolvedValueOnce(postsColumns)       // For SHOW COLUMNS on posts
        .mockResolvedValueOnce(postsFks)           // For FKS on posts
        .mockResolvedValueOnce([[]]);              // Mock uniqueColumnsResult for 'posts'
      // Act
      const entities = await scanner.introspect('mysql://user:pass@host:3306/db');
      
      // Assert
      expect(entities).toHaveLength(2);
      const userEntity = entities.find(e => e.name === 'Users');
      const postEntity = entities.find(e => e.name === 'Posts');

      expect(userEntity).toBeDefined();
      expect(postEntity).toBeDefined();

      // Check ManyToOne relation on Post
      const userRelationProp = postEntity!.properties.find(p => p.name === 'user');
      expect(userRelationProp).toBeDefined();
      expect(userRelationProp!.isRelation).toBe(true);
      expect(userRelationProp!.relationType).toBe('ManyToOne');
      expect(userRelationProp!.relatedEntity).toBe('Users');

      // Check inverse OneToMany relation on User
      const postsRelationProp = userEntity!.properties.find(p => p.name === 'posts');
      expect(postsRelationProp).toBeDefined();
      expect(postsRelationProp!.isRelation).toBe(true);
      expect(postsRelationProp!.relationType).toBe('OneToMany');
      expect(postsRelationProp!.relatedEntity).toBe('Posts');
      expect(postsRelationProp!.type).toBe('Posts[]');
    });
    it('should correctly parse a OneToOne relationship', async () => {
      // Arrange
      const showTablesResponse = [[{ 'Tables_in_db': 'users' }, { 'Tables_in_db': 'profiles' }]];
      
      const usersColumns = [[{ Field: 'id', Type: 'int(11)', Null: 'NO', Key: 'PRI' }]];
      const usersFks = [[]]; // No outgoing FKs from users

      const profilesColumns = [[
        { Field: 'id', Type: 'int(11)', Null: 'NO', Key: 'PRI', Default: null, Extra: 'auto_increment' },
        { Field: 'street', Type: 'varchar(255)', Null: 'NO', Key: '' },
        { Field: 'user_id', Type: 'int(11)', Null: 'NO', Key: '' }, // Not nullable to match OneToOne
      ]];
      const profilesFks = [[{ COLUMN_NAME: 'user_id', REFERENCED_TABLE_NAME: 'users' }]];
      const profilesUniqueColumns = [[{ COLUMN_NAME: 'user_id' }]]; // user_id is unique

      mockQuery
        .mockResolvedValueOnce(showTablesResponse)     // For SHOW TABLES
        .mockResolvedValueOnce(usersColumns)           // For SHOW COLUMNS on users
        .mockResolvedValueOnce(usersFks)               // For FKS on users
        .mockResolvedValueOnce([[]])                   // Mock uniqueColumnsResult for 'users'
        .mockResolvedValueOnce(profilesColumns)        // For SHOW COLUMNS on profiles
        .mockResolvedValueOnce(profilesFks)            // For FKS on profiles
        .mockResolvedValueOnce(profilesUniqueColumns); // For UNIQUE COLUMNS on profiles

      // Act
      const entities = await scanner.introspect('mysql://user:pass@host:3306/db');
      
      // Assert
      expect(entities).toHaveLength(2);
      const userEntity = entities.find(e => e.name === 'Users');
      const profileEntity = entities.find(e => e.name === 'Profiles');

      expect(userEntity).toBeDefined();
      expect(profileEntity).toBeDefined();

      // Check OneToOne relation on Profile (owning side)
      const userRelationProp = profileEntity!.properties.find(p => p.name === 'user');
      expect(userRelationProp).toBeDefined();
      expect(userRelationProp!.isRelation).toBe(true);
      expect(userRelationProp!.relationType).toBe('OneToOne');
      expect(userRelationProp!.relatedEntity).toBe('Users');
      expect(userRelationProp!.isOptional).toBe(false); // Since user_id is NOT NULL

      // Check inverse OneToOne relation on User
      const profileInverseProp = userEntity!.properties.find(p => p.name === 'profile');
      expect(profileInverseProp).toBeDefined();
      expect(profileInverseProp!.isRelation).toBe(true);
      expect(profileInverseProp!.relationType).toBe('OneToOne');
      expect(profileInverseProp!.relatedEntity).toBe('Profiles');
      expect(profileInverseProp!.isOptional).toBe(false); // Should match owning side's optionality
    });
    it('should correctly parse a ManyToMany relationship via a join table', async () => {
      // Arrange
      const showTablesResponse = [[{ 'Tables_in_db': 'users' }, { 'Tables_in_db': 'roles' }, { 'Tables_in_db': 'user_roles' }]];

      const usersColumns = [[{ Field: 'id', Type: 'int(11)', Null: 'NO', Key: 'PRI' }]];
      const usersFks = [[]]; // No outgoing FKs from users
      const usersUniqueColumns = [[]];

      const rolesColumns = [[{ Field: 'id', Type: 'int(11)', Null: 'NO', Key: 'PRI' }]];
      const rolesFks = [[]]; // No outgoing FKs from roles
      const rolesUniqueColumns = [[]];

      const userRolesColumns = [[
        { Field: 'user_id', Type: 'int(11)', Null: 'NO', Key: 'PRI' },
        { Field: 'role_id', Type: 'int(11)', Null: 'NO', Key: 'PRI' },
      ]];
      const userRolesFks = [[
        { COLUMN_NAME: 'user_id', REFERENCED_TABLE_NAME: 'users' },
        { COLUMN_NAME: 'role_id', REFERENCED_TABLE_NAME: 'roles' },
      ]];
      const userRolesUniqueColumns = [[]]; // Neither user_id nor role_id is individually unique

      mockQuery
        .mockResolvedValueOnce(showTablesResponse)     // For SHOW TABLES
        // Users table
        .mockResolvedValueOnce(usersColumns)           // For SHOW COLUMNS on users
        .mockResolvedValueOnce(usersFks)               // For FKS on users
        .mockResolvedValueOnce(usersUniqueColumns)     // For UNIQUE COLUMNS on users
        // Roles table
        .mockResolvedValueOnce(rolesColumns)           // For SHOW COLUMNS on roles
        .mockResolvedValueOnce(rolesFks)               // For FKS on roles
        .mockResolvedValueOnce(rolesUniqueColumns)     // For UNIQUE COLUMNS on roles
        // User_Roles table (join table)
        .mockResolvedValueOnce(userRolesColumns)       // For SHOW COLUMNS on user_roles
        .mockResolvedValueOnce(userRolesFks)           // For FKS on user_roles
        .mockResolvedValueOnce(userRolesUniqueColumns) // For UNIQUE COLUMNS on user_roles
        ;

      // Act
      const entities = await scanner.introspect('mysql://user:pass@host:3306/db');
      
      // Assert
      expect(entities).toHaveLength(2); // Should only return Users and Roles, not UserRoles
      const userEntity = entities.find(e => e.name === 'Users');
      const roleEntity = entities.find(e => e.name === 'Roles');
      const userRolesEntity = entities.find(e => e.originalTableName === 'user_roles'); // Should be filtered out

      expect(userEntity).toBeDefined();
      expect(roleEntity).toBeDefined();
      expect(userRolesEntity).toBeUndefined(); // Join table should be excluded

      // Check ManyToMany relation on User
      const rolesRelationProp = userEntity!.properties.find(p => p.name === 'roles');
      expect(rolesRelationProp).toBeDefined();
      expect(rolesRelationProp!.isRelation).toBe(true);
      expect(rolesRelationProp!.relationType).toBe('ManyToMany');
      expect(rolesRelationProp!.relatedEntity).toBe('Roles');
      expect(rolesRelationProp!.joinTableName).toBe('user_roles');
      expect(rolesRelationProp!.joinColumnName).toBe('user_id'); // FK from join table to user
      expect(rolesRelationProp!.inverseJoinColumnName).toBe('role_id'); // FK from join table to role

      // Check inverse ManyToMany relation on Role
      const usersRelationProp = roleEntity!.properties.find(p => p.name === 'users');
      expect(usersRelationProp).toBeDefined();
      expect(usersRelationProp!.isRelation).toBe(true);
      expect(usersRelationProp!.relationType).toBe('ManyToMany');
      expect(usersRelationProp!.relatedEntity).toBe('Users');
      expect(usersRelationProp!.joinTableName).toBe('user_roles');
      expect(usersRelationProp!.joinColumnName).toBe('role_id'); // FK from join table to role
      expect(usersRelationProp!.inverseJoinColumnName).toBe('user_id'); // FK from join table to user
    });
  });
});