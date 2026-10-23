import * as vscode from 'vscode';
import {
	getOthersChanges,
	getWebResourceDetails,
	listEnvironments,
	publishWebResources,
	updateWebResourceContent,
} from './dataverseClient';
import { listLinks, onDidChangeLinks, type ResourceLink } from './linksStore';
import { notifyRemoteContentChanged, scheduleModifiedCountRefresh } from './modifiedTracker';
import { getWorkspaceFileContent } from './workspaceFiles';

const CONTEXT_KEY = 'wrsync.activeFileLinked';

/** Web resource type each local file extension may be published to. Keep in sync with
 * LINKABLE_EXTENSIONS in webview-ui/src/features/webresources/webResourceTypes.ts - links
 * made before linking was restricted by type can still point at the wrong kind of file. */
const TYPE_BY_EXTENSION: Record<string, number> = {
	html: 1,
	htm: 1,
	css: 2,
	js: 3,
	xml: 4,
	xsl: 9,
	xslt: 9,
	svg: 11,
	resx: 12,
};

/** Environment id -> Web API URL, looked up once per session: listing environments is a
 * Power Platform API call, too slow to repeat on every publish. */
let apiUrlByEnvironmentId: Map<string, string> | undefined;

/** Registers "Publish This File" (command, editor title button, keybinding) and keeps the
 * `wrsync.activeFileLinked` context key current, which those contributions' `when` clauses
 * use to appear only for linked files. */
export function initPublishCurrentFile(context: vscode.ExtensionContext): void {
	const updateContext = () => {
		const uri = vscode.window.activeTextEditor?.document.uri;
		vscode.commands.executeCommand('setContext', CONTEXT_KEY, uri ? linksFor(uri).length > 0 : false);
	};
	context.subscriptions.push(
		vscode.commands.registerCommand('wrsync.publishCurrentFile', (uri?: vscode.Uri) => publishCurrentFile(uri)),
		vscode.window.onDidChangeActiveTextEditor(updateContext),
		onDidChangeLinks(updateContext)
	);
	updateContext();
}

function linksFor(uri: vscode.Uri): ResourceLink[] {
	if (uri.scheme !== 'file' || !vscode.workspace.getWorkspaceFolder(uri)) {return [];}
	const relativePath = vscode.workspace.asRelativePath(uri, false);
	return listLinks().filter((l) => l.localPath === relativePath);
}

async function resolveApiUrl(environmentId: string): Promise<string> {
	if (!apiUrlByEnvironmentId?.has(environmentId)) {
		const environments = await listEnvironments();
		apiUrlByEnvironmentId = new Map(environments.map((e) => [e.id, e.apiUrl]));
	}
	const apiUrl = apiUrlByEnvironmentId.get(environmentId);
	if (!apiUrl) {throw new Error("The linked file's environment isn't available to this account.");}
	return apiUrl;
}

/** A file can be linked in several environments (e.g. dev and test); ask which one. */
async function pickLink(links: ResourceLink[]): Promise<{ link: ResourceLink; apiUrl: string } | undefined> {
	const withUrls = await Promise.all(
		links.map(async (link) => ({ link, apiUrl: await resolveApiUrl(link.environmentId).catch(() => undefined) }))
	);
	const available = withUrls.filter((x): x is { link: ResourceLink; apiUrl: string } => x.apiUrl !== undefined);
	if (available.length === 0) {throw new Error("None of this file's linked environments are available to this account.");}
	if (available.length === 1) {return available[0];}
	const picked = await vscode.window.showQuickPick(
		available.map((x) => ({ label: new URL(x.apiUrl).hostname, description: x.link.solutionUniqueName, x })),
		{ placeHolder: 'This file is linked in several environments. Publish to which one?' }
	);
	return picked?.x;
}

async function publishCurrentFile(uri?: vscode.Uri): Promise<void> {
	const target = uri ?? vscode.window.activeTextEditor?.document.uri;
	if (!target) {return;}
	const links = linksFor(target);
	if (links.length === 0) {
		vscode.window.showInformationMessage('This file isn\'t linked to a web resource. Link it from the wrsync sidebar first.');
		return;
	}

	try {
		const choice = await pickLink(links);
		if (!choice) {return;}
		const { link, apiUrl } = choice;
		const host = new URL(apiUrl).hostname;

		// Publish what's on screen, and keep disk and Dataverse equal afterwards so the file
		// doesn't immediately show as modified again.
		const document = vscode.workspace.textDocuments.find((d) => d.uri.toString() === target.toString());
		if (document?.isDirty && !(await document.save())) {return;}

		const [details, othersChanges] = await Promise.all([
			getWebResourceDetails(apiUrl, link.webresourceId),
			getOthersChanges(apiUrl, [link.webresourceId]).catch(() => null),
		]);

		const extension = link.localPath.slice(link.localPath.lastIndexOf('.') + 1).toLowerCase();
		if (TYPE_BY_EXTENSION[extension] !== details.webresourcetype) {
			vscode.window.showErrorMessage(
				`${link.localPath} can't be published to ${details.name}: its file type doesn't match the web resource's type. Unlink it and link a matching file.`
			);
			return;
		}

		const change = othersChanges?.[0];
		const detail = change
			? `Last changed in Dataverse by ${change.modifiedbyname ?? 'an unknown user'}` +
				(change.modifiedon ? `, ${new Date(change.modifiedon).toLocaleString()}` : '') +
				'. Publishing will overwrite their change.'
			: othersChanges === null
				? "Couldn't check whether someone else changed it."
				: `Local content will overwrite what's in ${host} and be published.`;
		const confirmLabel = change ? 'Publish Anyway' : 'Publish';
		const answer = await vscode.window.showWarningMessage(
			`Publish ${details.name} to ${host}?`,
			{ modal: true, detail },
			confirmLabel
		);
		if (answer !== confirmLabel) {return;}

		await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: `Publishing ${details.name}...` },
			async () => {
				const content = await getWorkspaceFileContent(link.localPath);
				await updateWebResourceContent(apiUrl, link.webresourceId, Buffer.from(content, 'utf-8').toString('base64'));
				await publishWebResources(apiUrl, [link.webresourceId]);
			}
		);
		notifyRemoteContentChanged();
		scheduleModifiedCountRefresh();
		vscode.window.showInformationMessage(`Published ${details.name} to ${host}.`);
	} catch (err) {
		vscode.window.showErrorMessage(`Publish failed: ${(err as Error).message}`);
	}
}
