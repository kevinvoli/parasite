/**
 * E2E Integration Test: Full generate flow
 *
 * Simulates a real project:
 *   1. Creates a temp directory with a TypeORM entity source file
 *   2. Runs scanEntities() to parse it
 *   3. Runs generateCrudResources() to produce CRUD files
 *   4. Verifies the generated output for correctness
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { scanEntities } from './entity-scanner.js';
import { generateCrudResources } from './crud-generator.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ENTITY_SOURCE = `
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from "typeorm";
import { Post } from "../post/entities/post.entity";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  email?: string;

  @OneToMany(() => Post, post => post.author)
  posts: Post[];
}
`;

const POST_ENTITY_SOURCE = `
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { User } from "../user/entities/user.entity";

@Entity()
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @ManyToOne(() => User, user => user.posts)
  @JoinColumn({ name: "user_id" })
  author: User;
}
`;

// ─── Setup ────────────────────────────────────────────────────────────────────

let tmpDir: string;
let entitiesDir: string;
let outputDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'parasite-e2e-'));
  entitiesDir = path.join(tmpDir, 'entities');
  outputDir = path.join(tmpDir, 'output');
  await fs.ensureDir(entitiesDir);
  await fs.ensureDir(outputDir);

  // Write entity source files
  await fs.writeFile(path.join(entitiesDir, 'user.entity.ts'), USER_ENTITY_SOURCE, 'utf-8');
  await fs.writeFile(path.join(entitiesDir, 'post.entity.ts'), POST_ENTITY_SOURCE, 'utf-8');
});

afterAll(async () => {
  await fs.remove(tmpDir);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('E2E: entity scanning → CRUD generation', () => {

  it('should scan two entity files and return two ParsedEntities', async () => {
    const entities = await scanEntities(entitiesDir);
    expect(entities).toHaveLength(2);

    const names = entities.map(e => e.name).sort();
    expect(names).toEqual(['Post', 'User']);
  });

  it('User entity should have id (PK), name, email (optional), posts (OneToMany)', async () => {
    const entities = await scanEntities(entitiesDir);
    const user = entities.find(e => e.name === 'User')!;
    expect(user).toBeDefined();

    const id = user.properties.find(p => p.name === 'id');
    expect(id?.isPrimary).toBe(true);

    const name = user.properties.find(p => p.name === 'name');
    expect(name?.type).toBe('string');
    expect(name?.isOptional).toBe(false);

    const email = user.properties.find(p => p.name === 'email');
    expect(email?.isOptional).toBe(true);

    const posts = user.properties.find(p => p.name === 'posts');
    expect(posts?.isRelation).toBe(true);
    expect(posts?.relationType).toBe('OneToMany');
    expect(posts?.relatedEntity).toBe('Post');
  });

  it('Post entity should have ManyToOne relation with isOwningRelation true', async () => {
    const entities = await scanEntities(entitiesDir);
    const post = entities.find(e => e.name === 'Post')!;
    expect(post).toBeDefined();

    const author = post.properties.find(p => p.name === 'author');
    expect(author?.isRelation).toBe(true);
    expect(author?.relationType).toBe('ManyToOne');
    expect(author?.relatedEntity).toBe('User');
    expect(author?.isOwningRelation).toBe(true); // has @JoinColumn
  });

  it('should generate all CRUD files for User entity', async () => {
    const entities = await scanEntities(entitiesDir);
    const user = entities.find(e => e.name === 'User')!;

    const userOutputDir = path.join(outputDir, 'user');
    await generateCrudResources(
      {
        ...user,
        relations: user.properties.filter(p => p.isRelation).map(p => p.name),
        hasRelations: user.properties.some(p => p.isRelation),
        optionalProperties: user.properties.filter(p => p.isOptional),
        dateProperties: user.properties.filter(p => p.type === 'Date'),
      },
      userOutputDir
    );

    expect(fs.existsSync(path.join(userOutputDir, 'user.controller.ts'))).toBe(true);
    expect(fs.existsSync(path.join(userOutputDir, 'user.service.ts'))).toBe(true);
    expect(fs.existsSync(path.join(userOutputDir, 'user.module.ts'))).toBe(true);
    expect(fs.existsSync(path.join(userOutputDir, 'dto', 'create-user.dto.ts'))).toBe(true);
    expect(fs.existsSync(path.join(userOutputDir, 'dto', 'update-user.dto.ts'))).toBe(true);
    expect(fs.existsSync(path.join(userOutputDir, 'dto', 'pagination.dto.ts'))).toBe(true);
    expect(fs.existsSync(path.join(userOutputDir, 'entities', 'user.entity.ts'))).toBe(true);
  });

  it('generated User controller should reference UserService and PaginationDto', async () => {
    const controllerPath = path.join(outputDir, 'user', 'user.controller.ts');
    const content = await fs.readFile(controllerPath, 'utf-8');

    expect(content).toContain('UserService');
    expect(content).toContain('PaginationDto');
    expect(content).toContain('@Controller');
    expect(content).toContain('@Get()');
    expect(content).toContain('@Post()');
    expect(content).toContain('@Patch(');
    expect(content).toContain('@Delete(');
  });

  it('generated User service should import the User entity and use repository', async () => {
    const servicePath = path.join(outputDir, 'user', 'user.service.ts');
    const content = await fs.readFile(servicePath, 'utf-8');

    expect(content).toContain('UserService');
    expect(content).toContain('@InjectRepository');
    expect(content).toContain('findAndCount');
    expect(content).toContain('findOne');
  });

  it('generated User create-dto should include @IsString() for name', async () => {
    const dtoPath = path.join(outputDir, 'user', 'dto', 'create-user.dto.ts');
    const content = await fs.readFile(dtoPath, 'utf-8');

    expect(content).toContain('@IsString()');
    expect(content).toContain('name');
    expect(content).toContain('@IsOptional()');
    expect(content).toContain('email?');
  });

  it('should generate all CRUD files for Post entity (with ManyToOne relation)', async () => {
    const entities = await scanEntities(entitiesDir);
    const post = entities.find(e => e.name === 'Post')!;

    const postOutputDir = path.join(outputDir, 'post');
    await generateCrudResources(
      {
        ...post,
        relations: post.properties.filter(p => p.isRelation).map(p => p.name),
        hasRelations: post.properties.some(p => p.isRelation),
        optionalProperties: post.properties.filter(p => p.isOptional),
        dateProperties: post.properties.filter(p => p.type === 'Date'),
      },
      postOutputDir
    );

    const entityContent = await fs.readFile(
      path.join(postOutputDir, 'entities', 'post.entity.ts'), 'utf-8'
    );
    expect(entityContent).toContain('ManyToOne');
    expect(entityContent).toContain('JoinColumn');
  });
});
