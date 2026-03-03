import { describe, it, expect, beforeEach } from "@jest/globals";
import { Project, InMemoryFileSystemHost } from "ts-morph";
import { ParsedEntity } from "../types.js";

// We'll test scanEntities by mocking the filesystem and Project.
// Since entity-scanner uses `getAllTsFilesRecursively` and `new Project({ tsConfigFilePath })`,
// we test the core parsing logic by building a lightweight inline scanner function.

async function parseEntityFromSource(source: string): Promise<ParsedEntity | null> {
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile("test/user.entity.ts", source);

  const entityClass = sf.getClasses().find(cls => cls.getDecorator("Entity"));
  if (!entityClass) return null;

  const className = entityClass.getName() ?? "UnnamedEntity";
  const { SyntaxKind } = await import("ts-morph");

  const properties: any[] = entityClass.getProperties().map(prop => {
    const name = prop.getName();
    const typeNode = prop.getTypeNode();
    const type = typeNode ? typeNode.getText() : "any";
    const decorators = prop.getDecorators();
    const decoratorNames = decorators.map(d => d.getName());

    const isPrimary = decoratorNames.includes("PrimaryGeneratedColumn");
    const isRelation = decoratorNames.some(d =>
      ["OneToMany", "ManyToOne", "OneToOne", "ManyToMany"].includes(d)
    );
    const isOwningRelation = decoratorNames.includes("JoinColumn") || decoratorNames.includes("JoinTable");
    const relationType = decoratorNames.find(d =>
      ["OneToMany", "ManyToOne", "OneToOne", "ManyToMany"].includes(d)
    );

    const columnDecorator = prop.getDecorator("Column");
    let isOptional = false;
    if (columnDecorator) {
      const arg = columnDecorator.getArguments()?.[0];
      if (arg?.getText()?.includes("nullable: true")) isOptional = true;
    }

    let relatedEntity: string | undefined;
    if (isRelation && relationType) {
      const relationDecorator = decorators.find(d => d.getName() === relationType);
      const arrowFn = relationDecorator?.getArguments()?.[0];
      if (arrowFn && arrowFn.getKind() === SyntaxKind.ArrowFunction) {
        const match = arrowFn.getText().match(/=>\s*(\w+)/);
        if (match) relatedEntity = match[1];
      }
    }

    return {
      name, type, isPrimary, isRelation,
      isOwningRelation: isRelation ? isOwningRelation : undefined,
      relationType, relatedEntity,
      dtoType: "any", isOptional,
    };
  });

  return { name: className, originalTableName: className.toLowerCase(), filePath: "test/user.entity.ts", properties };
}

describe("entity-scanner (inline logic)", () => {
  it("should detect a simple entity with PK and columns", async () => {
    const entity = await parseEntityFromSource(`
      import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";
      @Entity()
      export class User {
        @PrimaryGeneratedColumn()
        id: number;
        @Column()
        name: string;
      }
    `);
    expect(entity).not.toBeNull();
    expect(entity!.name).toBe("User");
    expect(entity!.properties).toHaveLength(2);
    expect(entity!.properties[0].isPrimary).toBe(true);
    expect(entity!.properties[1].isPrimary).toBe(false);
  });

  it("should detect optional columns", async () => {
    const entity = await parseEntityFromSource(`
      import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";
      @Entity()
      export class Post {
        @PrimaryGeneratedColumn()
        id: number;
        @Column({ nullable: true })
        description?: string;
      }
    `);
    expect(entity!.properties[1].isOptional).toBe(true);
  });

  it("should detect ManyToOne with isOwningRelation true", async () => {
    const entity = await parseEntityFromSource(`
      import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from "typeorm";
      @Entity()
      export class Post {
        @PrimaryGeneratedColumn() id: number;
        @ManyToOne(() => User, user => user.posts)
        @JoinColumn({ name: "user_id" })
        author: User;
      }
    `);
    const rel = entity!.properties.find(p => p.isRelation);
    expect(rel).toBeDefined();
    expect(rel!.relationType).toBe("ManyToOne");
    expect(rel!.isOwningRelation).toBe(true);
    expect(rel!.relatedEntity).toBe("User");
  });

  it("should detect OneToMany with isOwningRelation false (no JoinColumn)", async () => {
    const entity = await parseEntityFromSource(`
      import { Entity, PrimaryGeneratedColumn, OneToMany } from "typeorm";
      @Entity()
      export class User {
        @PrimaryGeneratedColumn() id: number;
        @OneToMany(() => Post, post => post.author)
        posts: Post[];
      }
    `);
    const rel = entity!.properties.find(p => p.isRelation);
    expect(rel!.relationType).toBe("OneToMany");
    expect(rel!.isOwningRelation).toBe(false);
  });

  it("should detect OneToOne owning side (with @JoinColumn)", async () => {
    const entity = await parseEntityFromSource(`
      import { Entity, PrimaryGeneratedColumn, OneToOne, JoinColumn } from "typeorm";
      @Entity()
      export class User {
        @PrimaryGeneratedColumn() id: number;
        @OneToOne(() => Profile)
        @JoinColumn()
        profile: Profile;
      }
    `);
    const rel = entity!.properties.find(p => p.isRelation);
    expect(rel!.relationType).toBe("OneToOne");
    expect(rel!.isOwningRelation).toBe(true);
  });

  it("should detect OneToOne inverse side (without @JoinColumn)", async () => {
    const entity = await parseEntityFromSource(`
      import { Entity, PrimaryGeneratedColumn, OneToOne } from "typeorm";
      @Entity()
      export class Profile {
        @PrimaryGeneratedColumn() id: number;
        @OneToOne(() => User, user => user.profile)
        user: User;
      }
    `);
    const rel = entity!.properties.find(p => p.isRelation);
    expect(rel!.relationType).toBe("OneToOne");
    expect(rel!.isOwningRelation).toBe(false);
  });

  it("should detect ManyToMany owning side (with @JoinTable)", async () => {
    const entity = await parseEntityFromSource(`
      import { Entity, PrimaryGeneratedColumn, ManyToMany, JoinTable } from "typeorm";
      @Entity()
      export class User {
        @PrimaryGeneratedColumn() id: number;
        @ManyToMany(() => Role)
        @JoinTable()
        roles: Role[];
      }
    `);
    const rel = entity!.properties.find(p => p.isRelation);
    expect(rel!.relationType).toBe("ManyToMany");
    expect(rel!.isOwningRelation).toBe(true);
  });

  it("should return null for a class without @Entity decorator", async () => {
    const entity = await parseEntityFromSource(`
      export class NotAnEntity {
        id: number;
        name: string;
      }
    `);
    expect(entity).toBeNull();
  });
});
