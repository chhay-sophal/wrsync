import * as vscode from 'vscode';
import { initAuth } from './auth';
import { initCompareProvider } from './compareProvider';
import { initDevReload } from './devReload';
import { initLinkSuggestionsPanel } from './linkSuggestionsPanel';
import { initLinksStore } from './linksStore';
import { initMediaProvider } from './mediaProvider';
import { initModifiedTracker, setBadgeTarget } from './modifiedTracker';
import { initPublishCurrentFile } from './publishCurrentFile';
import { initState } from './state';
import { registerWebResourceCommands } from './webResourceCommands';
import { WebResourceTree } from './webResourceTree';

export function activate(context: vscode.ExtensionContext) {
	initAuth(context);
	initDevReload(context);
	initLinksStore(context);
	initState(context);
	initCompareProvider(context);
	initMediaProvider(context);
	initModifiedTracker(context);
	initLinkSuggestionsPanel(context);
	initPublishCurrentFile(context);

	// The sidebar is a native tree view ("Web Resources"), so hovers, selection, keyboard
	// navigation, inline actions and theming behave like VS Code's own Explorer.
	const tree = new WebResourceTree();
	context.subscriptions.push(tree);
	setBadgeTarget(tree.view);
	registerWebResourceCommands(context, tree);
}

export function deactivate() {}
