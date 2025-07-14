import {
  Project,
  SyntaxKind,
  ObjectLiteralExpression,
  PropertyAssignment,
  ArrayLiteralExpression,
  Expression,
} from "ts-morph";
import path from "path";

export async function addModuleToAppModule(appModulePath: string, moduleName: string, modulePath: string) {
  const project = new Project({
    tsConfigFilePath: "tsconfig.json",
  });

  const sourceFile = project.addSourceFileAtPath(appModulePath);

  // Vérifier si déjà importé
  const existingImport = sourceFile.getImportDeclarations().find((d) => {
    return (
      d.getModuleSpecifierValue() === modulePath &&
      d.getNamedImports().some((i) => i.getName() === moduleName)
    );
  });

  if (!existingImport) {
    sourceFile.addImportDeclaration({
      namedImports: [moduleName],
      moduleSpecifier: modulePath,
    });
  }

  // Trouver le décorateur @Module()
  const decorator = sourceFile.getFirstDescendant((node) => {
    return node.getKind() === SyntaxKind.Decorator &&
      node.getText().startsWith("@Module");
  });

  if (!decorator) {
    console.error("❌ Décorateur @Module non trouvé dans app.module.ts");
    return;
  }

  const arg = decorator.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
  if (!arg) return;

  const objLiteral = arg as ObjectLiteralExpression;
  const importsProp = objLiteral.getProperty("imports");

  if (
    importsProp &&
    importsProp.getKind() === SyntaxKind.PropertyAssignment
  ) {
    const assignment = importsProp as PropertyAssignment;
    const arrayLiteral = assignment.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression) as ArrayLiteralExpression;

    const alreadyExists = arrayLiteral.getElements().some((el: Expression) => el.getText() === moduleName);

    if (!alreadyExists) {
      arrayLiteral.addElement(moduleName);
    }
  } else {
    // Si "imports" n'existe pas, on le crée
    objLiteral.addPropertyAssignment({
      name: "imports",
      initializer: `[${moduleName}]`,
    });
  }

  await sourceFile.save();
  console.log(`✅ ${moduleName} ajouté à ${path.basename(appModulePath)}`);
}
