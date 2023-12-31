import {
  createConnection,
  TextDocuments,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  ColorInformation,
  FileChangeType,
  Hover,
} from "vscode-languageserver/node";
import * as fs from "fs";
import { Position, TextDocument } from "vscode-languageserver-textdocument";
import isColor from "./utils/isColor";
import { uriToPath } from "./utils/protocol";
import { findAll } from "./utils/findAll";
import { indexToPosition } from "./utils/indexToPosition";
import { getCurrentWord } from "./utils/getCurrentWord";
import { isInFunctionExpression } from "./utils/isInFunctionExpression";
import CSSVariableManager, {
  CSSVariablesSettings,
  defaultSettings,
} from "./CSSVariableManager";

export const makeConnection = () => {
  // Create a connection for the server, using Node's IPC as a transport.
  // Also include all preview / proposed LSP features.
  const connection = createConnection(process.stdin, process.stdout);

  // Create a simple text document manager.
  const documents: TextDocuments<TextDocument> = new TextDocuments(
    TextDocument
  );

  let hasConfigurationCapability = false;
  let hasWorkspaceFolderCapability = false;
  let hasDiagnosticRelatedInformationCapability = false;

  const cssVariableManager = new CSSVariableManager();

  connection.onInitialize(async (params: InitializeParams) => {
    const capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.
    hasConfigurationCapability = !!(
      capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
      capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    hasDiagnosticRelatedInformationCapability = !!(
      capabilities.textDocument &&
      capabilities.textDocument.publishDiagnostics &&
      capabilities.textDocument.publishDiagnostics.relatedInformation
    );

    const result: InitializeResult = {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        // Tell the client that this server supports code completion.
        completionProvider: {
          resolveProvider: true,
        },
        definitionProvider: true,
        hoverProvider: true,
        colorProvider: true,
      },
    };

    if (hasWorkspaceFolderCapability) {
      result.capabilities.workspace = {
        workspaceFolders: {
          supported: true,
        },
      };
    }
    return result;
  });

  connection.onInitialized(async () => {
    if (hasConfigurationCapability) {
      // Register for all configuration changes.
      connection.client.register(
        DidChangeConfigurationNotification.type,
        undefined
      );
    }
    if (hasWorkspaceFolderCapability) {
      connection.workspace.onDidChangeWorkspaceFolders((e) => {
        logger("workspace change", e);
      });
    }
  });

  let globalSettings = defaultSettings;

  // Cache the settings of all open documents
  const documentSettings: Map<
    string,
    Thenable<CSSVariablesSettings>
  > = new Map();

  function logger(location: string, content: object) {
    connection.console.info(`logger: ${location}`);
    connection.console.info(JSON.stringify(content));
  }

  connection.onDidCloseTextDocument((event) => {
    connection.console.info("onDidCloseTextDocument");
    connection.console.info(event.textDocument.uri);
  });

  documents.onDidOpen(async ({ document }) => {
    if (!document.uri) return;

    const workspaceFolders = await connection.workspace.getWorkspaceFolders();
    const currentFile = document.uri.startsWith("file://")
      ? document.uri.slice(7)
      : document.uri;

    const validFolders = workspaceFolders
      ?.map((folder) => uriToPath(folder.uri) || "")
      .filter((path) => !!path && currentFile.startsWith(path));

    logger("file opened", { document, globalSettings, validFolders });
    // parse and sync variables
    cssVariableManager.parseAndSyncVariables(
      validFolders || [],
      globalSettings
    );
  });

  // Only keep settings for open documents
  documents.onDidClose((e) => {
    connection.console.log("Closed: " + e.document.uri);
    documentSettings.delete(e.document.uri);
  });

  connection.onDidChangeConfiguration(async (change) => {
    logger("configChange", { change });
    globalSettings = <CSSVariablesSettings>(
      (change.settings?.cssVariables || defaultSettings)
    );
    logger("configChange", globalSettings);
  });

  connection.onDidChangeWatchedFiles(async ({ changes }) => {
    const workspaceFolders = await connection.workspace.getWorkspaceFolders();
    // update cached variables
    changes.forEach((change) => {
      const filePath = uriToPath(change.uri);
      if (filePath) {
        const [workspace] = workspaceFolders
          ?.map((folder) => uriToPath(folder.uri) || "")
          .find((ws) => filePath.includes(ws)) ?? [""];

        // remove variables from cache
        if (change.type === FileChangeType.Deleted) {
          cssVariableManager.clearFileCache(filePath, workspace);
        } else {
          const content = fs.readFileSync(filePath, "utf8");
          cssVariableManager.parseCSSVariablesFromText({
            content,
            filePath,
            workspace,
          });
        }
      }
    });
  });

  // This handler provides the initial list of the completion items.
  connection.onCompletion(
    async (_textDocumentPosition: TextDocumentPositionParams) => {
      const doc = documents.get(_textDocumentPosition.textDocument.uri);
      if (!doc) {
        return [];
      }

      const offset = doc.offsetAt(_textDocumentPosition.position);
      const currentWord = getCurrentWord(doc, offset);

      const isFunctionCall = isInFunctionExpression(currentWord);

      const items: CompletionItem[] = [];
      const filePath = uriToPath(_textDocumentPosition.textDocument.uri);
      const workspaceFolders = await connection.workspace.getWorkspaceFolders();

      const wsFolderUris = workspaceFolders.map(
        (folder) => uriToPath(folder.uri) ?? ""
      );

      const workspace =
        wsFolderUris.find((ws) => filePath.startsWith(ws)) ?? "";

      const variableOptions = cssVariableManager.getAllForPath(workspace);

      variableOptions.forEach((opt, val) => logger(val, opt));

      variableOptions.forEach((variable) => {
        const varSymbol = variable.symbol;
        const insertText = isFunctionCall
          ? varSymbol.name
          : `var(${varSymbol.name})`;
        const completion: CompletionItem = {
          label: varSymbol.name,
          detail: varSymbol.value,
          documentation: varSymbol.value,
          insertText,
          kind: isColor(varSymbol.value)
            ? CompletionItemKind.Color
            : CompletionItemKind.Variable,
        };

        if (isFunctionCall) {
          completion.detail = varSymbol.value;
        }

        items.push(completion);
      });

      return items;
    }
  );

  // This handler resolves additional information for the item selected in
  // the completion list.
  connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    return item;
  });

  connection.onDocumentColor((params): ColorInformation[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    const colors: ColorInformation[] = [];

    const text = document.getText();
    const matches = findAll(/var\((?<varName>--[a-z-0-9]+)/g, text);

    const globalStart: Position = { line: 0, character: 0 };

    matches.map((match) => {
      const start = indexToPosition(text, match.index + 4);
      const end = indexToPosition(text, match.index + match[0].length);

      const cssVariable = cssVariableManager.getAll().get(match.groups.varName);

      if (cssVariable?.color) {
        const range = {
          start: {
            line: globalStart.line + start.line,
            character:
              (end.line === 0 ? globalStart.character : 0) + start.character,
          },
          end: {
            line: globalStart.line + end.line,
            character:
              (end.line === 0 ? globalStart.character : 0) + end.character,
          },
        };

        colors.push({
          color: cssVariable.color,
          range,
        });
      }
    });

    return colors;
  });

  connection.onHover(async (params) => {
    const doc = documents.get(params.textDocument.uri);

    if (!doc) {
      return null;
    }
    const offset = doc.offsetAt(params.position);
    const currentWord = getCurrentWord(doc, offset);

    logger("onHover", { offset, currentWord });
    if (!currentWord) return null;

    const nornalizedWord = currentWord.slice(1);

    const cssVariable = cssVariableManager.getAll().get(nornalizedWord);
    logger("onHover", { nornalizedWord, cssVariable });

    if (cssVariable) {
      return {
        contents: cssVariable.symbol.value,
        range: cssVariable.definition.range,
      } as Hover;
    }

    return null;
  });

  connection.onColorPresentation((params) => {
    const document = documents.get(params.textDocument.uri);

    const className = document.getText(params.range);
    if (!className) {
      return [];
    }

    return [];
  });

  connection.onDefinition((params) => {
    const doc = documents.get(params.textDocument.uri);

    if (!doc) {
      return null;
    }

    const offset = doc.offsetAt(params.position);
    const currentWord = getCurrentWord(doc, offset);

    if (!currentWord) return null;

    const nornalizedWord = currentWord.slice(1);
    const cssVariable = cssVariableManager.getAll().get(nornalizedWord);

    return cssVariable ? cssVariable.definition : null;
  });

  // Make the text document manager listen on the connection
  // for open, change and close text document events
  documents.listen(connection);

  // Listen on the connection
  return connection;
};
