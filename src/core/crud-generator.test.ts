import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { generateCrudResources } from './crud-generator.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { EntityProperty } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function prop(overrides: Partial<EntityProperty> & { name: string; type: string }): EntityProperty {
  return {
    dtoType: overrides.type,
    isPrimary: false,
    isOptional: false,
    isRelation: false,
    ...overrides,
  };
}

function relProp(overrides: Partial<EntityProperty> & {
  name: string; type: string;
  relationType: "ManyToOne" | "OneToMany" | "OneToOne" | "ManyToMany";
  relatedEntity: string;
}): EntityProperty {
  return {
    dtoType: "number",
    isPrimary: false,
    isOptional: false,
    isRelation: true,
    relationFieldName: overrides.name,
    inverseSide: "items",
    joinColumnName: `${overrides.name}_id`,
    isOwningRelation: false,
    ...overrides,
  };
}

function makeEntity(overrides: Record<string, any> = {}) {
  return {
    name: 'User',
    originalTableName: 'users',
    filePath: 'src/user/entities/user.entity.ts',
    properties: [
      prop({ name: 'id', type: 'number', isPrimary: true }),
      prop({ name: 'name', type: 'string' }),
    ],
    relations: [],
    hasRelations: false,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generateCrudResources', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'parasite-crud-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  // ── File generation ─────────────────────────────────────────────────────────

  it('should generate all 7 CRUD files for a simple entity', async () => {
    await generateCrudResources(makeEntity(), tmpDir);

    expect(fs.existsSync(path.join(tmpDir, 'user.controller.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'user.service.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'user.module.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'dto', 'create-user.dto.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'dto', 'update-user.dto.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'dto', 'pagination.dto.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'entities', 'user.entity.ts'))).toBe(true);
  });

  it('should only generate the specified subset of files', async () => {
    await generateCrudResources(makeEntity(), tmpDir, ['controller', 'service']);

    expect(fs.existsSync(path.join(tmpDir, 'user.controller.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'user.service.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'user.module.ts'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'entities', 'user.entity.ts'))).toBe(false);
  });

  it('should not write any files in dry-run mode', async () => {
    await generateCrudResources(makeEntity(), tmpDir, undefined, undefined, true);

    expect(fs.existsSync(path.join(tmpDir, 'user.controller.ts'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'user.service.ts'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'entities', 'user.entity.ts'))).toBe(false);
  });

  it('should use kebab-case for file names', async () => {
    const entity = makeEntity({ name: 'BlogPost', originalTableName: 'blog_posts' });
    await generateCrudResources(entity, tmpDir, ['controller', 'entity']);

    expect(fs.existsSync(path.join(tmpDir, 'blog-post.controller.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'entities', 'blog-post.entity.ts'))).toBe(true);
  });

  // ── TypeORM imports in entity ────────────────────────────────────────────────

  it('should include Entity, PrimaryGeneratedColumn and Column for a basic entity', async () => {
    await generateCrudResources(makeEntity(), tmpDir, ['entity']);
    const content = await fs.readFile(path.join(tmpDir, 'entities', 'user.entity.ts'), 'utf-8');

    expect(content).toContain('Entity');
    expect(content).toContain('PrimaryGeneratedColumn');
    expect(content).toContain('Column');
    expect(content).not.toContain('ManyToOne');
    expect(content).not.toContain('JoinColumn');
  });

  it('should include ManyToOne and JoinColumn for a ManyToOne relation', async () => {
    const entity = makeEntity({
      properties: [
        prop({ name: 'id', type: 'number', isPrimary: true }),
        relProp({ name: 'author', type: 'User', relationType: 'ManyToOne',
                  relatedEntity: 'User', isOwningRelation: true,
                  joinColumnName: 'user_id', inverseSide: 'posts' }),
      ],
      relations: ['author'],
      hasRelations: true,
    });
    await generateCrudResources(entity, tmpDir, ['entity']);
    const content = await fs.readFile(path.join(tmpDir, 'entities', 'user.entity.ts'), 'utf-8');

    expect(content).toContain('ManyToOne');
    expect(content).toContain('JoinColumn');
    expect(content).not.toContain('OneToMany');
  });

  it('should include OneToMany for a OneToMany relation', async () => {
    const entity = makeEntity({
      properties: [
        prop({ name: 'id', type: 'number', isPrimary: true }),
        relProp({ name: 'posts', type: 'Post[]', dtoType: 'number[]', relationType: 'OneToMany',
                  relatedEntity: 'Post', isOwningRelation: false, inverseSide: 'author' }),
      ],
      relations: ['posts'],
      hasRelations: true,
    });
    await generateCrudResources(entity, tmpDir, ['entity']);
    const content = await fs.readFile(path.join(tmpDir, 'entities', 'user.entity.ts'), 'utf-8');

    expect(content).toContain('OneToMany');
    expect(content).not.toContain('JoinColumn');
  });

  it('should include ManyToMany and JoinTable for the owning side', async () => {
    const entity = makeEntity({
      properties: [
        prop({ name: 'id', type: 'number', isPrimary: true }),
        relProp({ name: 'roles', type: 'Role[]', dtoType: 'number[]', relationType: 'ManyToMany',
                  relatedEntity: 'Role', isOwningRelation: true, inverseSide: 'users',
                  joinColumnName: 'user_id', inverseJoinColumnName: 'role_id', joinTableName: 'user_roles' }),
      ],
      relations: ['roles'],
      hasRelations: true,
    });
    await generateCrudResources(entity, tmpDir, ['entity']);
    const content = await fs.readFile(path.join(tmpDir, 'entities', 'user.entity.ts'), 'utf-8');

    expect(content).toContain('ManyToMany');
    expect(content).toContain('JoinTable');
  });

  it('should include ManyToMany but NOT JoinTable for the inverse side', async () => {
    const entity = makeEntity({
      name: 'Role',
      originalTableName: 'roles',
      properties: [
        prop({ name: 'id', type: 'number', isPrimary: true }),
        relProp({ name: 'users', type: 'User[]', dtoType: 'number[]', relationType: 'ManyToMany',
                  relatedEntity: 'User', isOwningRelation: false, inverseSide: 'roles' }),
      ],
      relations: ['users'],
      hasRelations: true,
    });
    await generateCrudResources(entity, tmpDir, ['entity']);
    const content = await fs.readFile(path.join(tmpDir, 'entities', 'role.entity.ts'), 'utf-8');

    expect(content).toContain('ManyToMany');
    expect(content).not.toContain('JoinTable');
  });

  // ── ENUM support ─────────────────────────────────────────────────────────────

  it('should generate an enum declaration for an ENUM column', async () => {
    const entity = makeEntity({
      properties: [
        prop({ name: 'id', type: 'number', isPrimary: true }),
        prop({ name: 'status', type: 'string', isEnum: true, enumValues: ['active', 'inactive', 'banned'] }),
      ],
    });
    await generateCrudResources(entity, tmpDir, ['entity']);
    const content = await fs.readFile(path.join(tmpDir, 'entities', 'user.entity.ts'), 'utf-8');

    expect(content).toContain('StatusEnum');
    expect(content).toContain("ACTIVE = 'active'");
    expect(content).toContain("INACTIVE = 'inactive'");
    expect(content).toContain("BANNED = 'banned'");
  });

  // ── Swagger ──────────────────────────────────────────────────────────────────

  it('should include swagger decorators in controller when swagger is enabled', async () => {
    const entity = { ...makeEntity(), swagger: true };
    await generateCrudResources(entity, tmpDir, ['controller']);
    const content = await fs.readFile(path.join(tmpDir, 'user.controller.ts'), 'utf-8');

    expect(content).toContain('@nestjs/swagger');
    expect(content).toContain('@ApiTags');
    expect(content).toContain('@ApiOperation');
    expect(content).toContain('@ApiResponse');
  });

  it('should NOT include swagger decorators when swagger is not enabled', async () => {
    await generateCrudResources(makeEntity(), tmpDir, ['controller']);
    const content = await fs.readFile(path.join(tmpDir, 'user.controller.ts'), 'utf-8');

    expect(content).not.toContain('@nestjs/swagger');
    expect(content).not.toContain('@ApiTags');
  });

  // ── class-validator decorators ────────────────────────────────────────────────

  it('should include class-validator decorators in create DTO', async () => {
    await generateCrudResources(makeEntity(), tmpDir, ['create-dto']);
    const content = await fs.readFile(path.join(tmpDir, 'dto', 'create-user.dto.ts'), 'utf-8');

    expect(content).toContain('class-validator');
    expect(content).toContain('@IsString()');
  });

  it('should include @IsOptional() for optional properties in create DTO', async () => {
    const entity = makeEntity({
      properties: [
        prop({ name: 'id', type: 'number', isPrimary: true }),
        prop({ name: 'bio', type: 'string', isOptional: true }),
      ],
    });
    await generateCrudResources(entity, tmpDir, ['create-dto']);
    const content = await fs.readFile(path.join(tmpDir, 'dto', 'create-user.dto.ts'), 'utf-8');

    expect(content).toContain('@IsOptional()');
    expect(content).toContain('bio?');
  });

  it('should include @IsInt() validator for ManyToOne relation in create DTO', async () => {
    const entity = makeEntity({
      properties: [
        prop({ name: 'id', type: 'number', isPrimary: true }),
        relProp({ name: 'author', type: 'User', relationType: 'ManyToOne',
                  relatedEntity: 'User', isOwningRelation: true,
                  joinColumnName: 'user_id', inverseSide: 'posts' }),
      ],
      relations: ['author'],
      hasRelations: true,
    });
    await generateCrudResources(entity, tmpDir, ['create-dto']);
    const content = await fs.readFile(path.join(tmpDir, 'dto', 'create-user.dto.ts'), 'utf-8');

    expect(content).toContain('@IsInt()');
  });

  // ── Backup ───────────────────────────────────────────────────────────────────

  it('should create a .bak file when overwriteExisting is true and file already exists', async () => {
    await generateCrudResources(makeEntity(), tmpDir, ['controller']);
    const controllerPath = path.join(tmpDir, 'user.controller.ts');
    expect(fs.existsSync(controllerPath)).toBe(true);

    const entity = { ...makeEntity(), overwriteExisting: true };
    await generateCrudResources(entity, tmpDir, ['controller']);

    expect(fs.existsSync(`${controllerPath}.bak`)).toBe(true);
  });

  it('should NOT create a .bak file when overwriteExisting is false', async () => {
    await generateCrudResources(makeEntity(), tmpDir, ['controller']);
    await generateCrudResources(makeEntity(), tmpDir, ['controller']);

    const controllerPath = path.join(tmpDir, 'user.controller.ts');
    expect(fs.existsSync(`${controllerPath}.bak`)).toBe(false);
  });

  // ── Pagination ───────────────────────────────────────────────────────────────

  it('should include pagination in controller findAll route', async () => {
    await generateCrudResources(makeEntity(), tmpDir, ['controller']);
    const content = await fs.readFile(path.join(tmpDir, 'user.controller.ts'), 'utf-8');

    expect(content).toContain('@Query()');
    expect(content).toContain('PaginationDto');
  });

  // ── relatedEntities (module imports) ────────────────────────────────────────

  it('should add related entity import to module for entities with relations', async () => {
    const entity = makeEntity({
      properties: [
        prop({ name: 'id', type: 'number', isPrimary: true }),
        relProp({ name: 'roles', type: 'Role[]', dtoType: 'number[]', relationType: 'ManyToMany',
                  relatedEntity: 'Role', isOwningRelation: true, inverseSide: 'users',
                  joinColumnName: 'user_id', inverseJoinColumnName: 'role_id', joinTableName: 'user_roles' }),
      ],
      relations: ['roles'],
      hasRelations: true,
    });
    await generateCrudResources(entity, tmpDir, ['module']);
    const content = await fs.readFile(path.join(tmpDir, 'user.module.ts'), 'utf-8');

    expect(content).toContain('Role');
    expect(content).toContain('role');
  });
});
