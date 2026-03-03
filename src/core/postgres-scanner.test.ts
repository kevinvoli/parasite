import { jest } from '@jest/globals';
import { PostgresScanner, mapPostgresTypeToTS } from './postgres-scanner.js';
import { Client, mockQuery } from 'pg';

describe('PostgreSQL Scanner', () => {
  let scanner: PostgresScanner;

  beforeEach(() => {
    mockQuery.mockClear();
    (Client as jest.Mock).mockClear();
    scanner = new PostgresScanner();
  });

  // ─── mapPostgresTypeToTS ─────────────────────────────────────────────────────

  describe('mapPostgresTypeToTS', () => {
    it('should map integer data_type values to number', () => {
      expect(mapPostgresTypeToTS('integer')).toBe('number');
      expect(mapPostgresTypeToTS('bigint')).toBe('number');
      expect(mapPostgresTypeToTS('smallint')).toBe('number');
      expect(mapPostgresTypeToTS('numeric')).toBe('number');
      expect(mapPostgresTypeToTS('decimal')).toBe('number');
      expect(mapPostgresTypeToTS('real')).toBe('number');
      expect(mapPostgresTypeToTS('double precision')).toBe('number');
      expect(mapPostgresTypeToTS('money')).toBe('number');
    });

    it('should map string data_type values to string', () => {
      expect(mapPostgresTypeToTS('character varying')).toBe('string');
      expect(mapPostgresTypeToTS('varchar')).toBe('string');
      expect(mapPostgresTypeToTS('character')).toBe('string');
      expect(mapPostgresTypeToTS('char')).toBe('string');
      expect(mapPostgresTypeToTS('text')).toBe('string');
      expect(mapPostgresTypeToTS('uuid')).toBe('string');
    });

    it('should map date/time data_type values to Date', () => {
      expect(mapPostgresTypeToTS('date')).toBe('Date');
      expect(mapPostgresTypeToTS('timestamp with time zone')).toBe('Date');
      expect(mapPostgresTypeToTS('timestamp without time zone')).toBe('Date');
      expect(mapPostgresTypeToTS('time with time zone')).toBe('Date');
      expect(mapPostgresTypeToTS('time without time zone')).toBe('Date');
    });

    it('should map boolean to boolean', () => {
      expect(mapPostgresTypeToTS('boolean')).toBe('boolean');
    });

    it('should map unknown types to any', () => {
      expect(mapPostgresTypeToTS('json')).toBe('any');
      expect(mapPostgresTypeToTS('jsonb')).toBe('any');
      expect(mapPostgresTypeToTS('bytea')).toBe('any');
      // Note: udt_name values like int4/bool/timestamptz also return 'any'
      expect(mapPostgresTypeToTS('int4')).toBe('any');
      expect(mapPostgresTypeToTS('bool')).toBe('any');
    });

    it('should be case-insensitive', () => {
      expect(mapPostgresTypeToTS('INTEGER')).toBe('number');
      expect(mapPostgresTypeToTS('TEXT')).toBe('string');
      expect(mapPostgresTypeToTS('BOOLEAN')).toBe('boolean');
    });
  });

  // ─── introspect ──────────────────────────────────────────────────────────────

  describe('introspect', () => {
    it('should throw an error if no tables are found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(scanner.introspect('postgres://user:pass@host:5432/db'))
        .rejects
        .toThrow('❌ Aucune table trouvée dans la base de données.');
    });

    it('should correctly parse a simple table with various column types', async () => {
      // ── tables ──
      mockQuery.mockResolvedValueOnce({ rows: [{ table_name: 'users' }] });

      // ── users: columns (varchar/text work with mapPostgresTypeToTS; integer too) ──
      mockQuery.mockResolvedValueOnce({ rows: [
        { column_name: 'id',      udt_name: 'integer', data_type: 'integer',           is_nullable: 'NO'  },
        { column_name: 'name',    udt_name: 'varchar', data_type: 'character varying',  is_nullable: 'NO'  },
        { column_name: 'bio',     udt_name: 'text',    data_type: 'text',               is_nullable: 'YES' },
        { column_name: 'is_active', udt_name: 'boolean', data_type: 'boolean',         is_nullable: 'NO'  },
      ]});
      // no USER-DEFINED columns → no enum queries
      mockQuery.mockResolvedValueOnce({ rows: [{ column_name: 'id' }] }); // PKs
      mockQuery.mockResolvedValueOnce({ rows: [] });                       // FKs
      mockQuery.mockResolvedValueOnce({ rows: [] });                       // UNIQUEs

      const entities = await scanner.introspect('postgres://user:pass@host:5432/db');

      expect(entities).toHaveLength(1);
      const userEntity = entities[0];
      expect(userEntity.name).toBe('Users');
      expect(userEntity.originalTableName).toBe('users');

      const idProp = userEntity.properties.find(p => p.name === 'id');
      expect(idProp).toBeDefined();
      expect(idProp!.isPrimary).toBe(true);
      expect(idProp!.isOptional).toBe(false);

      const nameProp = userEntity.properties.find(p => p.name === 'name');
      expect(nameProp).toBeDefined();
      expect(nameProp!.type).toBe('string');
      expect(nameProp!.isOptional).toBe(false);

      const bioProp = userEntity.properties.find(p => p.name === 'bio');
      expect(bioProp).toBeDefined();
      expect(bioProp!.type).toBe('string');
      expect(bioProp!.isOptional).toBe(true);

      const isActiveProp = userEntity.properties.find(p => p.name === 'isActive');
      expect(isActiveProp).toBeDefined();
      expect(isActiveProp!.type).toBe('boolean');
    });

    it('should convert snake_case column names to camelCase', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ table_name: 'blog_posts' }] });
      mockQuery.mockResolvedValueOnce({ rows: [
        { column_name: 'id',         udt_name: 'integer', data_type: 'integer',          is_nullable: 'NO' },
        { column_name: 'created_at', udt_name: 'date',    data_type: 'date',             is_nullable: 'NO' },
        { column_name: 'author_name',udt_name: 'varchar', data_type: 'character varying', is_nullable: 'NO' },
      ]});
      mockQuery.mockResolvedValueOnce({ rows: [{ column_name: 'id' }] }); // PKs
      mockQuery.mockResolvedValueOnce({ rows: [] });                       // FKs
      mockQuery.mockResolvedValueOnce({ rows: [] });                       // UNIQUEs

      const entities = await scanner.introspect('postgres://user:pass@host:5432/db');

      expect(entities[0].name).toBe('BlogPosts');
      expect(entities[0].properties.find(p => p.name === 'createdAt')).toBeDefined();
      expect(entities[0].properties.find(p => p.name === 'authorName')).toBeDefined();
    });

    it('should correctly parse a ManyToOne and its inverse OneToMany relationship', async () => {
      // ── tables ──
      mockQuery.mockResolvedValueOnce({ rows: [{ table_name: 'users' }, { table_name: 'posts' }] });

      // ── users ──
      mockQuery.mockResolvedValueOnce({ rows: [
        { column_name: 'id', udt_name: 'integer', data_type: 'integer', is_nullable: 'NO' },
      ]});
      mockQuery.mockResolvedValueOnce({ rows: [{ column_name: 'id' }] }); // PKs
      mockQuery.mockResolvedValueOnce({ rows: [] });                       // FKs
      mockQuery.mockResolvedValueOnce({ rows: [] });                       // UNIQUEs

      // ── posts ──
      mockQuery.mockResolvedValueOnce({ rows: [
        { column_name: 'id',      udt_name: 'integer', data_type: 'integer', is_nullable: 'NO'  },
        { column_name: 'user_id', udt_name: 'integer', data_type: 'integer', is_nullable: 'YES' },
      ]});
      mockQuery.mockResolvedValueOnce({ rows: [{ column_name: 'id' }] }); // PKs
      mockQuery.mockResolvedValueOnce({ rows: [
        { column_name: 'user_id', foreign_table_name: 'users' },
      ]});                                                                 // FKs
      mockQuery.mockResolvedValueOnce({ rows: [] });                       // UNIQUEs

      const entities = await scanner.introspect('postgres://user:pass@host:5432/db');

      expect(entities).toHaveLength(2);
      const userEntity = entities.find(e => e.name === 'Users');
      const postEntity = entities.find(e => e.name === 'Posts');
      expect(userEntity).toBeDefined();
      expect(postEntity).toBeDefined();

      // posts.user → ManyToOne to Users (owning side)
      const userRelProp = postEntity!.properties.find(p => p.name === 'user');
      expect(userRelProp).toBeDefined();
      expect(userRelProp!.isRelation).toBe(true);
      expect(userRelProp!.relationType).toBe('ManyToOne');
      expect(userRelProp!.relatedEntity).toBe('Users');
      expect(userRelProp!.isOwningRelation).toBe(true);

      // users.posts → OneToMany inverse
      const postsRelProp = userEntity!.properties.find(p => p.name === 'posts');
      expect(postsRelProp).toBeDefined();
      expect(postsRelProp!.isRelation).toBe(true);
      expect(postsRelProp!.relationType).toBe('OneToMany');
      expect(postsRelProp!.relatedEntity).toBe('Posts');
      expect(postsRelProp!.type).toBe('Posts[]');
    });

    it('should correctly parse a OneToOne relationship via UNIQUE FK', async () => {
      // ── tables ──
      mockQuery.mockResolvedValueOnce({ rows: [{ table_name: 'users' }, { table_name: 'profiles' }] });

      // ── users ──
      mockQuery.mockResolvedValueOnce({ rows: [
        { column_name: 'id', udt_name: 'integer', data_type: 'integer', is_nullable: 'NO' },
      ]});
      mockQuery.mockResolvedValueOnce({ rows: [{ column_name: 'id' }] }); // PKs
      mockQuery.mockResolvedValueOnce({ rows: [] });                       // FKs
      mockQuery.mockResolvedValueOnce({ rows: [] });                       // UNIQUEs

      // ── profiles ──
      mockQuery.mockResolvedValueOnce({ rows: [
        { column_name: 'id',      udt_name: 'integer', data_type: 'integer', is_nullable: 'NO' },
        { column_name: 'user_id', udt_name: 'integer', data_type: 'integer', is_nullable: 'NO' },
      ]});
      mockQuery.mockResolvedValueOnce({ rows: [{ column_name: 'id' }] }); // PKs
      mockQuery.mockResolvedValueOnce({ rows: [
        { column_name: 'user_id', foreign_table_name: 'users' },
      ]});                                                                 // FKs
      mockQuery.mockResolvedValueOnce({ rows: [
        { column_name: 'user_id' },                                        // UNIQUE on user_id → OneToOne
      ]});

      const entities = await scanner.introspect('postgres://user:pass@host:5432/db');

      expect(entities).toHaveLength(2);
      const userEntity = entities.find(e => e.name === 'Users');
      const profileEntity = entities.find(e => e.name === 'Profiles');

      // profiles.user → OneToOne (owning, has JoinColumn)
      const userRelProp = profileEntity!.properties.find(p => p.name === 'user');
      expect(userRelProp).toBeDefined();
      expect(userRelProp!.relationType).toBe('OneToOne');
      expect(userRelProp!.isOwningRelation).toBe(true);
      expect(userRelProp!.relatedEntity).toBe('Users');
      expect(userRelProp!.isOptional).toBe(false); // user_id NOT NULL

      // users.profile → OneToOne (inverse)
      const profileRelProp = userEntity!.properties.find(p => p.name === 'profile');
      expect(profileRelProp).toBeDefined();
      expect(profileRelProp!.relationType).toBe('OneToOne');
      expect(profileRelProp!.relatedEntity).toBe('Profiles');
    });

    it('should detect ManyToMany via a join table and exclude it from output', async () => {
      // ── tables ──
      mockQuery.mockResolvedValueOnce({ rows: [
        { table_name: 'users' },
        { table_name: 'roles' },
        { table_name: 'user_roles' },
      ]});

      // ── users ──
      mockQuery.mockResolvedValueOnce({ rows: [
        { column_name: 'id', udt_name: 'integer', data_type: 'integer', is_nullable: 'NO' },
      ]});
      mockQuery.mockResolvedValueOnce({ rows: [{ column_name: 'id' }] }); // PKs
      mockQuery.mockResolvedValueOnce({ rows: [] });                       // FKs
      mockQuery.mockResolvedValueOnce({ rows: [] });                       // UNIQUEs

      // ── roles ──
      mockQuery.mockResolvedValueOnce({ rows: [
        { column_name: 'id', udt_name: 'integer', data_type: 'integer', is_nullable: 'NO' },
      ]});
      mockQuery.mockResolvedValueOnce({ rows: [{ column_name: 'id' }] }); // PKs
      mockQuery.mockResolvedValueOnce({ rows: [] });                       // FKs
      mockQuery.mockResolvedValueOnce({ rows: [] });                       // UNIQUEs

      // ── user_roles (join table) ──
      mockQuery.mockResolvedValueOnce({ rows: [
        { column_name: 'user_id', udt_name: 'integer', data_type: 'integer', is_nullable: 'NO' },
        { column_name: 'role_id', udt_name: 'integer', data_type: 'integer', is_nullable: 'NO' },
      ]});
      mockQuery.mockResolvedValueOnce({ rows: [
        { column_name: 'user_id' },
        { column_name: 'role_id' },
      ]});                                                                  // PKs (composite)
      mockQuery.mockResolvedValueOnce({ rows: [
        { column_name: 'user_id', foreign_table_name: 'users' },
        { column_name: 'role_id', foreign_table_name: 'roles' },
      ]});                                                                  // FKs
      mockQuery.mockResolvedValueOnce({ rows: [] });                        // UNIQUEs

      const entities = await scanner.introspect('postgres://user:pass@host:5432/db');

      expect(entities).toHaveLength(2); // user_roles excluded
      const userEntity = entities.find(e => e.name === 'Users');
      const roleEntity = entities.find(e => e.name === 'Roles');
      expect(entities.find(e => e.originalTableName === 'user_roles')).toBeUndefined();

      // users.roles → ManyToMany (owning, has @JoinTable)
      const rolesRelProp = userEntity!.properties.find(p => p.name === 'roles');
      expect(rolesRelProp).toBeDefined();
      expect(rolesRelProp!.relationType).toBe('ManyToMany');
      expect(rolesRelProp!.relatedEntity).toBe('Roles');
      expect(rolesRelProp!.isOwningRelation).toBe(true);
      expect(rolesRelProp!.joinTableName).toBe('user_roles');
      expect(rolesRelProp!.joinColumnName).toBe('user_id');
      expect(rolesRelProp!.inverseJoinColumnName).toBe('role_id');

      // roles.users → ManyToMany (inverse, no @JoinTable)
      const usersRelProp = roleEntity!.properties.find(p => p.name === 'users');
      expect(usersRelProp).toBeDefined();
      expect(usersRelProp!.relationType).toBe('ManyToMany');
      expect(usersRelProp!.relatedEntity).toBe('Users');
      expect(usersRelProp!.isOwningRelation).toBe(false);
      expect(usersRelProp!.joinTableName).toBe('user_roles');
    });

    it('should detect a UUID primary key column', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ table_name: 'users' }] });
      mockQuery.mockResolvedValueOnce({ rows: [
        { column_name: 'id',   udt_name: 'uuid',    data_type: 'uuid',              is_nullable: 'NO' },
        { column_name: 'name', udt_name: 'varchar', data_type: 'character varying', is_nullable: 'NO' },
      ]});
      mockQuery.mockResolvedValueOnce({ rows: [{ column_name: 'id' }] }); // PKs
      mockQuery.mockResolvedValueOnce({ rows: [] });                       // FKs
      mockQuery.mockResolvedValueOnce({ rows: [] });                       // UNIQUEs

      const entities = await scanner.introspect('postgres://user:pass@host:5432/db');

      const idProp = entities[0].properties.find(p => p.name === 'id');
      expect(idProp).toBeDefined();
      expect(idProp!.isUuid).toBe(true);
      expect(idProp!.type).toBe('string');
      expect(idProp!.isPrimary).toBe(true);
    });

    it('should detect an ENUM column and fetch its values', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ table_name: 'users' }] });
      // columns — status is USER-DEFINED
      mockQuery.mockResolvedValueOnce({ rows: [
        { column_name: 'id',     udt_name: 'integer',     data_type: 'integer',      is_nullable: 'NO' },
        { column_name: 'status', udt_name: 'user_status', data_type: 'USER-DEFINED', is_nullable: 'NO' },
      ]});
      // pg_enum values for 'user_status'
      mockQuery.mockResolvedValueOnce({ rows: [
        { enumlabel: 'active' },
        { enumlabel: 'inactive' },
        { enumlabel: 'banned' },
      ]});
      mockQuery.mockResolvedValueOnce({ rows: [{ column_name: 'id' }] }); // PKs
      mockQuery.mockResolvedValueOnce({ rows: [] });                       // FKs
      mockQuery.mockResolvedValueOnce({ rows: [] });                       // UNIQUEs

      const entities = await scanner.introspect('postgres://user:pass@host:5432/db');

      const statusProp = entities[0].properties.find(p => p.name === 'status');
      expect(statusProp).toBeDefined();
      expect(statusProp!.isEnum).toBe(true);
      expect(statusProp!.enumValues).toEqual(['active', 'inactive', 'banned']);
    });
  });
});
