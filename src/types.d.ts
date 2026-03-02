declare module 'which';

export interface EntityProperty {
  name: string;
  type: string;
  dtoType: string;
  isPrimary: boolean;
  isOptional: boolean;
  isRelation: boolean;
  isJoinColumn?: boolean;
  isOwningRelation?: boolean;
  relatedEntity?: string;
  relationType?: "OneToOne" | "ManyToOne" | "OneToMany" | "ManyToMany";
  relationFieldName?: string;
  joinColumnName?: string;
  onDelete?: string;
  orphanedRowAction?: string;
  inverseSide?: string;
  inverseJoinColumnName?: string; // Name of the inverse join column for ManyToMany
  joinTableName?: string; // Name of the join table for ManyToMany
}

export interface ParsedEntity {
  name: string;
  originalTableName: string;
  filePath: string;
  properties: EntityProperty[];
}
