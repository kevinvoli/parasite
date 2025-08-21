declare module 'which';

export interface EntityProperty {
  name: string;
  type: string;
  dtoType: string;
  isPrimary: boolean;
  isOptional: boolean;
  isRelation: boolean;
  isJoinColumn?: boolean;
  relatedEntity?: string;
  relationType?: string;
  relationFieldName?: string;
  joinColumnName?: string;
  onDelete?: string;
  orphanedRowAction?: string;
  inverseSide?: string;
}

export interface ParsedEntity {
  name: string;
  filePath: string;
  properties: EntityProperty[];
}
