import { Project, SyntaxKind } from "ts-morph";
import path from "path";
import fs from "fs";
import getAllTsFilesRecursively from "../utils/recursive.js";
import { ParsedEntity, EntityProperty } from "../types.js";

export async function scanEntities(entitiesDir: string): Promise<ParsedEntity[]> {
  const project = new Project({
    tsConfigFilePath: "tsconfig.json",
  });

  const absolutePath = path.resolve(entitiesDir);
  const files = getAllTsFilesRecursively(absolutePath);


  const entities: ParsedEntity[] = [];

for (const filePath of files) {
  const sourceFile = project.addSourceFileAtPath(filePath);

    const entityClass = sourceFile.getClasses().find(cls => cls.getDecorator("Entity"));
    if (!entityClass) continue;

    const className = entityClass.getName() || "UnnamedEntity";
    const properties: EntityProperty[] = [];

    for (const prop of entityClass.getProperties()) {
      const name = prop.getName();
      const typeNode = prop.getTypeNode();
      const type = typeNode ? typeNode.getText() : "any";

      const decorators = prop.getDecorators();
      const decoratorNames = decorators.map(d => d.getName());

      const columnDecorator = prop.getDecorator("Column");
      let isOptional = false;

      if (columnDecorator) {
        const arg = columnDecorator.getArguments()?.[0];
        if (arg?.getText()?.includes("nullable: true")) {
          isOptional = true;
        }
      }

      const isPrimary = decoratorNames.includes("PrimaryGeneratedColumn");
      const isRelation = decoratorNames.some(d =>
        ["OneToMany", "ManyToOne", "OneToOne", "ManyToMany"].includes(d)
      );
      const isOwningRelation = decoratorNames.includes("JoinColumn") || decoratorNames.includes("JoinTable");
      const relationType = decoratorNames.find(d =>
        ["OneToMany", "ManyToOne", "OneToOne", "ManyToMany"].includes(d)
      );

      let relatedEntity: string | undefined = undefined;
      let dtoType: string;

      if (isRelation && relationType) {
        dtoType = ["OneToMany", "ManyToMany"].includes(relationType) ? "number[]" : "number";

        const relationDecorator = decorators.find(d => d.getName() === relationType);
        const arrowFn = relationDecorator?.getArguments()?.[0];

        if (arrowFn && arrowFn.getKind() === SyntaxKind.ArrowFunction) {
          const body = arrowFn.getText();
          // Format: "() => Entity", we want "Entity"
          const match = body.match(/=>\s*(\w+)/);
          if (match) {
            relatedEntity = match[1];
          }
        }
      } else {
        // Typescript type -> DTO type
        const lowerType = type.toLowerCase();
        if (lowerType === "date") dtoType = "string";
        else if (lowerType === "boolean") dtoType = "boolean";
        else if (lowerType.includes("string")) dtoType = "string";
        else if (lowerType.includes("number") || lowerType.includes("int")) dtoType = "number";
        else dtoType = "any";
      }

      properties.push({
        name,
        type,
        isPrimary,
        isRelation,
        isOwningRelation: isRelation ? isOwningRelation : undefined,
        relationType: relationType as "OneToMany" | "ManyToOne" | "OneToOne" | "ManyToMany" | undefined,
        relatedEntity,
        dtoType,
        isOptional,
      });
    }

    entities.push({
      name: className,
      originalTableName: className.toLowerCase(),
      filePath,
      properties,
    });
    
  }

  return entities;
}


