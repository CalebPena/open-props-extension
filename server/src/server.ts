import {
	createConnection,
	TextDocuments,
	ProposedFeatures,
	InitializeParams,
	TextDocumentSyncKind,
	InitializeResult,
	HandlerResult,
	CompletionItem,
} from 'vscode-languageserver/node';

import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import openPropsVariables from './openPropsVariables';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams) => {
	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			completionProvider: {},
			hoverProvider: true,
		},
	};

	return result;
});

function getLine(uri: string, position: Position) {
	const document = documents.get(uri);

	if (document === undefined) {
		return;
	}

	const line = document.getText({
		start: { line: position.line, character: 0 },
		end: {
			line: position.line,
			character: Infinity,
		},
	});

	return line;
}

const endChars = ['(', ')', ',', ' ', '\t'];

connection.onCompletion((params, token, workDoneProgress) => {
	const line = getLine(params.textDocument.uri, params.position);

	if (line === undefined) {
		return;
	}

	// if there is no CSS property before, then return
	if (!line.match(/^\s*[a-zA-Z0-9\-_]*\s*:/)) {
		return;
	}

	let inVar = false;

	let i = params.position.character - 1;
	const varChars = ['v', 'a', 'r', '('];

	while (
		i > 0 &&
		(!endChars.includes(line[i]) || varChars.at(-1) === line[i]) &&
		(varChars.length === 4 || varChars.at(-1) === line[i]) &&
		varChars.length !== 0
	) {
		if (varChars.at(-1) === line[i]) {
			varChars.pop();
		}

		i--;
	}

	if (varChars.length === 0) {
		inVar = true;
	}

	const result: HandlerResult<CompletionItem[], void> = Object.entries(
		openPropsVariables
	).map((entry) => {
		const [variable, css] = entry;
		return {
			label: variable,
			documentation: css,
			insertText: inVar ? variable : `var(${variable})`,
		};
	});

	return result;
});

connection.onHover((params, token, workDoneProgress) => {
	const line = getLine(params.textDocument.uri, params.position);

	if (line === undefined) {
		return null;
	}

	let i = params.position.character;
	while (i < line.length && !endChars.includes(line[i])) {
		i++;
	}

	let j = params.position.character;
	while (j > 0 && !endChars.includes(line[j])) {
		j--;
	}

	j++;

	const potentialVar = line.substring(j, i).trim();

	if (!(potentialVar in openPropsVariables)) {
		return null;
	}

	return {
		contents: openPropsVariables[potentialVar],
		range: {
			start: { line: params.position.line, character: j },
			end: { line: params.position.line, character: i },
		},
	};
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
